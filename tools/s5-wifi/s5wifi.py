#!/usr/bin/env python3
"""Independently authored DC-S5 field measurements; Python 3.9+, MIT.

Only literal, user-selected IPv4 addresses are contacted. No HTTP redirects,
proxies, automatic authentication or command retries. Protocol candidates are
described in docs/research/wireless-connection.md, not a promised S5 API.
"""
import argparse
import collections
import csv
import datetime
import hashlib
import http.client
import io
import ipaddress
import json
import math
import os
from pathlib import Path
import re
import socket
import struct
import sys
import tempfile
import threading
import time
import urllib.parse
import xml.etree.ElementTree as ET

OK, USAGE, NETWORK, PROTOCOL, GATE, AMBIGUOUS, MISMATCH = 0, 2, 3, 4, 5, 6, 7
MAX_XML = 4 * 1024 * 1024
MAX_JPEG = 64 * 1024 * 1024
CDS = "urn:schemas-upnp-org:service:ContentDirectory:1"
SOAP = "http://schemas.xmlsoap.org/soap/envelope/"


class FieldError(Exception):
    def __init__(self, message, code=PROTOCOL):
        super().__init__(message)
        self.code = code


def utc_now():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()


def local_name(tag):
    return tag.rsplit("}", 1)[-1]


def xml_parse(data):
    if isinstance(data, str):
        data = data.encode("utf-8")
    # Also catches UTF-16/32 declarations; ElementTree never receives a DTD.
    scan = data.replace(b"\x00", b"").upper()
    if len(data) > MAX_XML or b"<!DOCTYPE" in scan or b"<!ENTITY" in scan:
        raise FieldError("Oversized XML or DTD/entity declaration refused")
    try:
        return ET.fromstring(data)
    except ET.ParseError as exc:
        raise FieldError("Invalid XML: " + str(exc)) from exc


def first_text(root, name, default=None):
    return next((el.text or "" for el in root.iter()
                 if local_name(el.tag) == name), default)


def parse_camrply(data, headers=None):
    """Protocol success is independent of HTTP 200. Unknown replies fail closed."""
    raw = data.decode("utf-8-sig", errors="replace").strip()
    hdr = {k.lower(): v for k, v in (headers or {}).items()}
    if raw.startswith("<"):
        root = xml_parse(data)
        if local_name(root.tag) != "camrply":
            raise FieldError("Expected camrply XML")
        result = first_text(root, "result")
        if result is None:
            raise FieldError("camrply has no result")
        values = {}
        for el in root.iter():
            if not list(el) and local_name(el.tag) != "result":
                values.setdefault(local_name(el.tag), []).append(el.text or "")
        parsed = {"format": "xml", "result": result.strip(), "values": values}
        session = first_text(root, "session_id") or first_text(root, "X-SESSION_ID")
    else:
        fields = next(csv.reader(io.StringIO(raw)), [])
        if not fields or not (fields[0] == "ok" or fields[0].startswith("err")):
            raise FieldError("Unknown camera response; inspect private raw log")
        parsed = {"format": "csv", "result": fields[0], "fields": fields[1:]}
        session = None
        # Observed envelope: ok,<name>,remote,open,<session>. Do not guess a
        # session from an arbitrary last CSV field or a challenge reply.
        if len(fields) == 5 and fields[2:4] == ["remote", "open"]:
            session = fields[4]
    parsed["ok"] = parsed["result"] == "ok"
    session = hdr.get("x-session_id") or session
    if session:
        if "\r" in session or "\n" in session or len(session) > 1024:
            raise FieldError("Invalid session header")
        parsed["session_token"] = session
    return parsed


def gen2_response(challenge, profile):
    """Generic byte-XOR profile, supplied by the owner after S5 verification.

    No G9II identity or challenge constants are embedded. A profile consists
    of challenge_order ('little'/'big'), value_words and value2_words, each
    word being eight hexadecimal digits in network byte order.
    """
    try:
        seed = bytes.fromhex(challenge)
        order = profile["challenge_order"]
        if len(seed) != 4 or order not in ("little", "big"):
            raise ValueError("Expected four-byte challenge and byte order")
        seed = seed[::-1] if order == "little" else seed
        results = []
        for key in ("value_words", "value2_words"):
            words = profile[key]
            if not isinstance(words, list) or not 1 <= len(words) <= 32:
                raise ValueError("Invalid word list")
            blocks = []
            for word in words:
                mask = bytes.fromhex(word)
                if len(mask) != 4:
                    raise ValueError("Each word must contain four bytes")
                blocks.append(bytes(a ^ b for a, b in zip(seed, mask)).hex())
            results.append("".join(blocks))
        return results
    except (KeyError, TypeError, ValueError) as exc:
        raise FieldError("Invalid verified gen2 profile: " + str(exc), USAGE) from exc


def json_read(path):
    try:
        with open(path, encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError) as exc:
        raise FieldError("Cannot read JSON " + str(path) + ": " + str(exc), USAGE) from exc


def json_write(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    # Output directories are private by default; do not loosen existing modes.
    fd, tmp = tempfile.mkstemp(prefix=".json-", dir=str(path.parent))
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(value, handle, ensure_ascii=False, indent=2, sort_keys=True)
            handle.write("\n")
        os.replace(tmp, path)
    finally:
        if os.path.exists(tmp):
            os.unlink(tmp)


class Run:
    def __init__(self, directory, verbose=False):
        self.directory = Path(directory)
        self.directory.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.verbose = verbose
        self.lock = threading.Lock()
        self.sequence = 0

    def save(self, name, value):
        value = dict(value, recorded_utc=utc_now())
        json_write(self.directory / (name + ".json"), value)
        print(json.dumps(redact(value, collect_secrets(value)), ensure_ascii=False, indent=2), flush=True)
        return value

    def raw(self, metadata, body=b""):
        with self.lock:
            self.sequence += 1
            prefix = "%d-%06d-%d" % (time.time_ns(), self.sequence, os.getpid())
        folder = self.directory / "raw"
        json_write(folder / (prefix + ".json"), metadata)
        if body:
            fd = os.open(str(folder / (prefix + ".bin")),
                         os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
            with os.fdopen(fd, "wb") as handle:
                handle.write(body)
        if self.verbose:
            print("raw: " + prefix + " " + json.dumps(redact(metadata)), file=sys.stderr)


class Camera:
    def __init__(self, ip, timeout, run, http_port=80, user_agent="Moment-S5-field-test/1"):
        try:
            address = ipaddress.IPv4Address(ip)
            if address.is_multicast or address.is_unspecified or int(address) == 0xffffffff:
                raise ValueError("Not a unicast IPv4 address")
        except (ValueError, ipaddress.AddressValueError) as exc:
            raise FieldError("--camera-ip must be one literal unicast IPv4 address", USAGE) from exc
        self.ip = str(address)
        if not user_agent or len(user_agent) > 256 or any(ord(char) < 32 or ord(char) > 126 for char in user_agent):
            raise FieldError("User-Agent must be 1..256 printable ASCII characters", USAGE)
        self.user_agent = user_agent
        self.timeout = timeout
        self.run = run
        self.base = "http://%s:%d" % (self.ip, http_port)
        self.session = None
        session_path = run.directory / ".session.json"
        if session_path.exists():
            saved = json_read(session_path)
            if saved.get("camera_ip") == self.ip and saved.get("base") == self.base:
                self.session = saved.get("session_token")

    def allowed_url(self, url):
        try:
            parts = urllib.parse.urlsplit(url)
            port = parts.port or 80
        except ValueError as exc:
            raise FieldError("Invalid camera URL", USAGE) from exc
        if (parts.scheme != "http" or parts.hostname != self.ip or parts.username
                or parts.password or parts.fragment or not 1 <= port <= 65535):
            raise FieldError("Refused URL outside selected camera IP: " + redact_text(url), USAGE)
        return parts, port

    def connection(self, url):
        parts, port = self.allowed_url(url)
        # Direct HTTPConnection deliberately bypasses proxy env vars and has
        # no redirect, authentication, retry or connection-pool machinery.
        return http.client.HTTPConnection(self.ip, port, timeout=self.timeout), parts

    def allowed_data_url(self, url):
        parts, port = self.allowed_url(url)
        # Descriptions and media URLs must never turn a read/download into a
        # camera command. Only command() constructs cam.cgi requests.
        path = urllib.parse.unquote(parts.path).lower()
        query = urllib.parse.parse_qs(parts.query)
        if re.search(r"(?:^|/)cam\.cgi(?:/|$)", path) or "mode" in query:
            raise FieldError("Camera command URL refused as a description/control/media resource", USAGE)
        return parts, port

    def request(self, url, method="GET", body=None, headers=None, limit=MAX_XML):
        connection, parts = self.connection(url)
        request_headers = {"User-Agent": self.user_agent, "Connection": "close"}
        if self.session:
            request_headers["X-SESSION_ID"] = self.session
        request_headers.update(headers or {})
        metadata = {"url": url, "method": method, "request_headers": request_headers,
                    "dispatch_monotonic": time.monotonic(), "request_utc": utc_now()}
        data = b""
        try:
            path = urllib.parse.urlunsplit(("", "", parts.path or "/", parts.query, ""))
            connection.request(method, path, body=body, headers=request_headers)
            response = connection.getresponse()
            metadata.update(status=response.status, response_headers=dict(response.getheaders()))
            data = response.read(limit + 1)
            if len(data) > limit:
                raise FieldError("Camera response exceeds bound")
            if not 200 <= response.status < 300:
                raise FieldError("HTTP %d; redirects are never followed" % response.status)
            return data, metadata["response_headers"]
        except (OSError, http.client.HTTPException) as exc:
            metadata["error"] = str(exc)
            raise FieldError("Network request failed (no retry): " + str(exc), NETWORK) from exc
        finally:
            metadata["completed_monotonic"] = time.monotonic()
            self.run.raw(metadata, data)
            connection.close()

    def command(self, mode, kind=None, value=None, value2=None, check=True):
        params = {"mode": mode}
        for key, item in (("type", kind), ("value", value), ("value2", value2)):
            if item is not None:
                params[key] = str(item)
        data, headers = self.request(self.base + "/cam.cgi?" + urllib.parse.urlencode(params))
        parsed = parse_camrply(data, headers)
        if check and not parsed["ok"]:
            raise FieldError("Camera rejected command: " + parsed["result"])
        return parsed

    def store_session(self, parsed):
        token = parsed.get("session_token")
        if token:
            self.session = token
            json_write(self.run.directory / ".session.json",
                       {"camera_ip": self.ip, "base": self.base, "session_token": token})


def parse_description(data, url, camera):
    root = xml_parse(data)
    base = first_text(root, "URLBase") or url
    camera.allowed_data_url(base)
    services = []
    for el in root.iter():
        if local_name(el.tag) == "service":
            item = {local_name(child.tag): child.text or "" for child in el}
            for key in ("controlURL", "eventSubURL", "SCPDURL"):
                if item.get(key):
                    resolved = urllib.parse.urljoin(base, item[key])
                    camera.allowed_data_url(resolved)
                    item[key] = resolved
            services.append(item)
    return {"description_url": url, "model": first_text(root, "modelName"),
            "model_number": first_text(root, "modelNumber"),
            "serial_number": first_text(root, "serialNumber"),
            "udn": first_text(root, "UDN"), "friendlyName": first_text(root, "friendlyName"),
            "manufacturer": first_text(root, "manufacturer"),
            "firmware": next((el.text for el in root.iter()
                              if local_name(el.tag).lower() in ("firmwareversion", "firmware", "x_firmwareversion")), None),
            "services": services}


def discover(camera, args):
    locations, ssdp, errors = [], [], []
    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        sock.bind(("0.0.0.0", 0))
        sock.settimeout(min(args.ssdp_seconds, 0.25))
        target = (camera.ip, args.ssdp_port)
        packet = ("M-SEARCH * HTTP/1.1\r\nHOST: %s:%d\r\nMAN: \"ssdp:discover\"\r\n"
                  "MX: 1\r\nST: urn:schemas-upnp-org:device:MediaServer:1\r\n\r\n") % target
        sock.sendto(packet.encode("ascii"), target)
        until = time.monotonic() + args.ssdp_seconds
        while time.monotonic() < until:
            try:
                data, source = sock.recvfrom(65535)
            except socket.timeout:
                continue
            if source[0] != camera.ip:
                continue
            fields = {}
            for line in data.decode("iso-8859-1").splitlines()[1:]:
                if ":" in line:
                    key, val = line.split(":", 1)
                    fields[key.lower()] = val.strip()
            ssdp.append(fields)
            camera.run.raw({"kind": "ssdp", "source_ip": source[0]}, data)
            if fields.get("location") and fields["location"] not in locations:
                locations.append(fields["location"])
    except OSError as exc:
        errors.append("SSDP: " + str(exc))
    finally:
        sock.close()
    if args.description_url:
        locations.insert(0, args.description_url)
    if not locations:
        # Known read-only paths, confined to the chosen IP. No identities tried.
        locations = ["http://%s:%d/Lumix/Server0/ddd" % (camera.ip, args.description_port),
                     "http://%s:%d/Server0/ddd" % (camera.ip, args.description_port)]
    devices = []
    for url in dict.fromkeys(locations):
        try:
            camera.allowed_data_url(url)
            data, _ = camera.request(url)
            devices.append(parse_description(data, url, camera))
        except FieldError as exc:
            errors.append(str(exc))
    try:
        state = camera.command("getstate", check=False)
    except FieldError as exc:
        state = {"error": str(exc)}
    value = camera.run.save("discovery", {"camera_ip": camera.ip, "unicast_ssdp": True,
                                          "ssdp": ssdp, "devices": devices,
                                          "getstate": state, "errors": errors})
    if not devices:
        raise FieldError("No valid device description; set --description-url from your capture", NETWORK)
    return value


def auth(camera, args):
    result = {"camera_ip": camera.ip, "flow": args.flow, "replies": []}
    # An explicit auth starts a fresh local session, without cycling identities.
    camera.session = None
    (camera.run.directory / ".session.json").unlink(missing_ok=True)
    try:
        if args.flow == "legacy":
            reply = camera.command("accctrl", "req_acc", args.client_id, args.device_name)
            result["replies"].append(reply)
            camera.store_session(reply)
        else:
            if args.response_file:
                supplied = json_read(args.response_file)
                if supplied.get("camera_ip") != camera.ip:
                    raise FieldError("Response file is not bound to this camera IP", USAGE)
                value, value2 = supplied["value"], supplied["value2"]
            else:
                challenge_reply = camera.command("accctrl", "req_acc_g")
                result["replies"].append(challenge_reply)
                fields = challenge_reply.get("fields", [])
                challenge = fields[0] if len(fields) == 1 else first_from_values(challenge_reply, "challenge")
                if not challenge:
                    raise FieldError("Unknown gen2 challenge envelope; inspect private raw log")
                result["challenge"] = challenge
                if args.challenge_only:
                    result["status"] = "challenge-only; no req_acc_e sent"
                    return camera.run.save("auth", result)
                profile = json_read(args.gen2_profile)
                if profile.get("camera_ip") != camera.ip or profile.get("verified_model") != "DC-S5":
                    raise FieldError("Profile must explicitly confirm DC-S5 and this camera IP", USAGE)
                value, value2 = gen2_response(challenge, profile)
            for _ in range(args.exchanges):
                reply = camera.command("accctrl", "req_acc_e", value, value2)
                result["replies"].append(reply)
                camera.store_session(reply)
            if not camera.session:
                raise FieldError("No session received; no extra authentication request sent")
        if args.register_name:
            result["replies"].append(camera.command("setsetting", "device_name", args.device_name))
        result["status"] = "accepted; confirm on camera if prompted"
        result["session_received"] = bool(camera.session)
    except (FieldError, KeyError) as exc:
        result["error"] = str(exc)
        camera.run.save("auth", result)
        if isinstance(exc, FieldError):
            raise
        raise FieldError("Response file missing required field", USAGE) from exc
    return camera.run.save("auth", result)


def first_from_values(reply, key):
    return next(iter(reply.get("values", {}).get(key, [])), None)


def probe(camera, args):
    requests = [("getstate", None)] + [("getinfo", key) for key in ("capability", "allmenu", "curmenu", "lens")]
    requests += [("getsetting", key) for key in args.settings.split(",") if key]
    results = []
    for mode, kind in requests:
        item = {"mode": mode, "type": kind}
        try:
            item["reply"] = camera.command(mode, kind, check=False)
        except FieldError as exc:
            item["error"] = str(exc)
        results.append(item)
    camera.run.save("probe", {"camera_ip": camera.ip, "requests": results})
    if not any(item.get("reply", {}).get("ok") for item in results):
        raise FieldError("All read-only probes failed; do not auto-switch authentication")


def jpeg_segments(data):
    """Marker/length and scan-envelope validation; not an entropy decoder."""
    if not (data.startswith(b"\xff\xd8") and data.endswith(b"\xff\xd9")) or len(data) > MAX_JPEG:
        raise FieldError("JPEG SOI/EOI missing or frame too large")
    pos, in_scan, saw_scan = 2, False, False
    segments = []
    while pos < len(data):
        if in_scan:
            pos = data.find(b"\xff", pos)
            if pos < 0:
                break
            marker_pos = pos
            while pos < len(data) and data[pos] == 255:
                pos += 1
            if pos >= len(data):
                break
            marker = data[pos]
            pos += 1
            if marker == 0 or 0xd0 <= marker <= 0xd7:
                continue
            in_scan = False
        else:
            marker_pos = pos
            if data[pos] != 255:
                raise FieldError("JPEG marker boundary invalid")
            while pos < len(data) and data[pos] == 255:
                pos += 1
            if pos >= len(data):
                break
            marker = data[pos]
            pos += 1
        if marker == 0xd9:
            if pos != len(data) or not saw_scan:
                raise FieldError("JPEG has trailing data or no SOS")
            return segments
        if marker in (0, 0xd8) or 0xd0 <= marker <= 0xd7:
            raise FieldError("Unexpected JPEG marker")
        if marker == 1:
            continue
        if pos + 2 > len(data):
            break
        length = int.from_bytes(data[pos:pos + 2], "big")
        if length < 2 or pos + length > len(data):
            raise FieldError("Truncated JPEG segment")
        segments.append((marker, data[pos + 2:pos + length], marker_pos))
        pos += length
        if marker == 0xda:
            in_scan, saw_scan = True, True
    raise FieldError("JPEG scan truncated")


def jpeg_dimensions(data):
    dimensions = None
    for marker, content, _ in jpeg_segments(data):
        if marker in (0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf):
            if len(content) < 6 or len(content) != 6 + 3 * content[5]:
                raise FieldError("Invalid JPEG SOF")
            height, width = struct.unpack(">HH", content[1:5])
            if not width or not height or width > 20000 or height > 20000:
                raise FieldError("Invalid JPEG dimensions")
            dimensions = {"width": width, "height": height}
    if not dimensions:
        raise FieldError("JPEG has no supported SOF")
    return dimensions


def exif_basics(data):
    """Read only an allowlist of TIFF/EXIF fields; never GPS, maker notes, serial."""
    names = {0x010f: "make", 0x0110: "model", 0x0112: "orientation",
             0x0132: "datetime", 0x9003: "datetime_original", 0x9004: "datetime_digitized",
             0xa002: "pixel_x", 0xa003: "pixel_y", 0xa434: "lens_model"}
    result = {}
    for marker, content, _ in jpeg_segments(data):
        if marker != 0xe1 or not content.startswith(b"Exif\x00\x00"):
            continue
        tiff = content[6:]
        try:
            endian = {b"II": "<", b"MM": ">"}[tiff[:2]]
            if struct.unpack_from(endian + "H", tiff, 2)[0] != 42:
                raise ValueError("TIFF magic")
            seen = set()

            def read_ifd(offset):
                if offset in seen or len(seen) >= 4:
                    return
                seen.add(offset)
                count = struct.unpack_from(endian + "H", tiff, offset)[0]
                if count > 512 or offset + 2 + count * 12 + 4 > len(tiff):
                    raise ValueError("TIFF directory bound")
                for index in range(count):
                    at = offset + 2 + index * 12
                    tag, kind, number = struct.unpack_from(endian + "HHI", tiff, at)
                    if tag == 0x8769:
                        read_ifd(struct.unpack_from(endian + "I", tiff, at + 8)[0])
                    if tag not in names or number > 512 or kind not in (2, 3, 4):
                        continue
                    size = number * {2: 1, 3: 2, 4: 4}[kind]
                    start = at + 8 if size <= 4 else struct.unpack_from(endian + "I", tiff, at + 8)[0]
                    if start + size > len(tiff):
                        raise ValueError("TIFF field bound")
                    value = tiff[start:start + size]
                    if kind == 2:
                        result[names[tag]] = value.rstrip(b"\0").decode("ascii", errors="replace")
                    elif number == 1:
                        result[names[tag]] = int.from_bytes(value, "little" if endian == "<" else "big")
            read_ifd(struct.unpack_from(endian + "I", tiff, 4)[0])
        except (KeyError, struct.error, ValueError, IndexError) as exc:
            result["parse_error"] = str(exc)
    return result


def file_info(path):
    path = Path(path)
    if path.stat().st_size > MAX_JPEG:
        raise FieldError("JPEG exceeds 64 MiB bound")
    data = path.read_bytes()
    return {"path": str(path), "size": len(data), "sha256": hashlib.sha256(data).hexdigest(),
            "dimensions": jpeg_dimensions(data), "exif": exif_basics(data)}


class JPEGAssembler:
    """Default: one datagram per JPEG (prefix permitted).

    Sequence framing is opt-in after measuring the S5 header. Missing,
    duplicate/out-of-order sequence numbers discard the unfinished frame;
    never concatenate arbitrary UDP packets to manufacture a valid frame.
    """
    def __init__(self, framing="datagram", header_bytes=0, sequence_offset=0,
                 sequence_bytes=2, sequence_endian="big", max_frame=2 * 1024 * 1024):
        self.framing = framing
        self.header_bytes = header_bytes
        self.sequence_offset = sequence_offset
        self.sequence_bytes = sequence_bytes
        self.sequence_endian = sequence_endian
        self.max_frame = max_frame
        self.pending = bytearray()
        self.last_sequence = None
        self.dropped = 0
        self.invalid = 0

    def feed(self, packet):
        payload = packet
        if self.framing == "sequence":
            end = self.sequence_offset + self.sequence_bytes
            if end > self.header_bytes or len(packet) < self.header_bytes:
                self.invalid += 1
                return []
            sequence = int.from_bytes(packet[self.sequence_offset:end], self.sequence_endian)
            payload = packet[self.header_bytes:]
            if self.last_sequence is not None and sequence != (self.last_sequence + 1) % (1 << (8 * self.sequence_bytes)):
                if self.pending:
                    self.dropped += 1
                self.pending.clear()
            self.last_sequence = sequence
            if payload.startswith(b"\xff\xd8"):
                if self.pending:
                    self.dropped += 1
                self.pending = bytearray(payload)
            elif self.pending:
                self.pending.extend(payload)
            else:
                return []
            if len(self.pending) > self.max_frame:
                self.pending.clear()
                self.dropped += 1
                return []
            if not self.pending.endswith(b"\xff\xd9"):
                return []
            frame = bytes(self.pending)
            self.pending.clear()
        else:
            start = payload.find(b"\xff\xd8")
            if start < 0:
                self.invalid += 1
                return []
            frame = payload[start:]
            if len(frame) > self.max_frame:
                self.invalid += 1
                return []
        try:
            dimensions = jpeg_dimensions(frame)
        except FieldError:
            self.invalid += 1
            return []
        return [(frame, dimensions)]


def frame_metrics(events, start, end, window=3.0):
    duration = max(0.0, end - start)
    active = [(at, digest) for at, digest in events if start <= at <= end]
    times = [at for at, _ in active]
    gaps = [b - a for a, b in zip([start] + times, times + [end])]
    tail = end - times[-1] if times else None
    cutoff = end - window
    recent = [(at, digest) for at, digest in active if at >= cutoff]
    recent_times = [at for at, _ in recent]
    window_gaps = [b - a for a, b in zip([max(start, cutoff)] + recent_times, recent_times + [end])]
    unique = len({digest for _, digest in recent})
    gate = {"window_seconds": window, "full_window": duration >= window,
            "complete_frames": len(recent), "unique_frames": unique,
            "unique_fps": unique / window, "max_gap_ms": max(window_gaps, default=window) * 1000,
            "last_frame_age_ms": None if tail is None else tail * 1000,
            "target_unique_fps": 10, "max_allowed_gap_ms": 500}
    gate["passed"] = bool(gate["full_window"] and recent and gate["unique_fps"] >= 10
                          and gate["max_gap_ms"] <= 500 and tail <= 0.5)
    return {"duration_seconds": duration, "complete_frames": len(active),
            "complete_fps": len(active) / duration if duration else 0,
            "unique_frames": len({digest for _, digest in active}),
            "unique_fps": len({digest for _, digest in active}) / duration if duration else 0,
            "max_gap_ms": max(gaps, default=duration) * 1000,
            "last_frame_age_ms": None if tail is None else tail * 1000,
            "last_3s_gate": gate}


class LiveSession:
    def __init__(self, camera, args):
        self.camera, self.args = camera, args
        self.socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_RCVBUF, 1024 * 1024)
        self.socket.bind(("0.0.0.0", args.port))  # Always before startstream.
        self.socket.settimeout(0.1)
        self.port = self.socket.getsockname()[1]
        self.assembler = JPEGAssembler(args.framing, args.header_bytes, args.sequence_offset,
                                       args.sequence_bytes, args.sequence_endian)
        self.lock = threading.Lock()
        self.stop = threading.Event()
        self.events, self.samples, self.raw_packets, self.errors = [], [], [], []
        self.ring = collections.deque()
        self.ring_bytes = 0
        self.packet_sizes = collections.Counter()
        self.dimensions = collections.Counter()
        self.foreign_packets = 0
        self.started = time.monotonic()
        self.request_started = False
        self.receiver = threading.Thread(target=self.receive, daemon=True)
        self.keeper = threading.Thread(target=self.keepalive, daemon=True)
        self.receiver.start()

    def begin(self):
        self.camera.command("camcmd", value="recmode")
        self.started = time.monotonic()
        self.request_started = True
        self.camera.command("startstream", value=self.port)
        self.keeper.start()

    def receive(self):
        while not self.stop.is_set():
            try:
                packet, source = self.socket.recvfrom(65535)
            except socket.timeout:
                continue
            except OSError:
                break
            at = time.monotonic()
            if source[0] != self.camera.ip:
                self.foreign_packets += 1
                continue
            frames = self.assembler.feed(packet)
            with self.lock:
                self.packet_sizes[len(packet)] += 1
                if len(self.raw_packets) < self.args.raw_datagrams:
                    self.raw_packets.append({"at_seconds": at - self.started, "size": len(packet),
                                             "source_port": source[1], "hex": packet.hex()})
                for frame, dims in frames:
                    digest = hashlib.sha256(frame).hexdigest()
                    self.events.append((at, digest))
                    self.dimensions[(dims["width"], dims["height"])] += 1
                    if len(self.samples) < self.args.samples:
                        self.samples.append(frame)
                    self.ring.append((at, frame))
                    self.ring_bytes += len(frame)
                    while self.ring and (self.ring[0][0] < at - 3.2 or self.ring_bytes > MAX_JPEG):
                        self.ring_bytes -= len(self.ring.popleft()[1])
                # Bound event metadata as well as JPEG storage. 30 min at
                # normal frame rates fits; higher rates fail conservatively.
                if len(self.events) > 1000000:
                    self.errors.append("Event limit exceeded")
                    self.stop.set()

    def keepalive(self):
        while not self.stop.wait(self.args.keepalive):
            try:
                self.camera.command("getstate")
            except FieldError as exc:
                self.errors.append(str(exc))

    def freeze(self, end=None):
        end = time.monotonic() if end is None else end
        with self.lock:
            metrics = frame_metrics(self.events, self.started, end)
            frames = [(at, frame) for at, frame in self.ring if end - 3 <= at <= end]
        if not frames or end - frames[0][0] < 2.5:
            metrics["last_3s_gate"]["passed"] = False
        return metrics, frames

    def close(self, name="liveview"):
        ended = time.monotonic()
        self.stop.set()
        self.receiver.join(timeout=1)
        if self.keeper.is_alive():
            self.keeper.join(timeout=self.camera.timeout + 1)
        self.socket.close()
        if self.request_started:
            try:
                self.camera.command("stopstream")
            except FieldError as exc:
                self.errors.append("stopstream: " + str(exc))
        metrics, _ = self.freeze(ended)
        windows = []
        boundary = self.started + 3
        while boundary <= ended:
            windows.append(frame_metrics(self.events, boundary - 3, boundary)["last_3s_gate"])
            boundary += 0.5
        metrics.update(camera_ip=self.camera.ip, framing=self.args.framing, udp_port=self.port,
                       packet_sizes=dict(self.packet_sizes), dimensions=[{"width": w, "height": h, "frames": n}
                                                                       for (w, h), n in self.dimensions.items()],
                       invalid_datagrams=self.assembler.invalid, dropped_partial_frames=self.assembler.dropped,
                       pending_partial_bytes=len(self.assembler.pending), foreign_packets_ignored=self.foreign_packets,
                       errors=self.errors, rolling_3s_windows=windows,
                       all_measured_windows_passed=bool(windows) and all(w["passed"] for w in windows),
                       loss_rate=None, loss_rate_note="No known S5 sequence format; packet/frame loss rate not inferred",
                       validation="JPEG marker/SOF/SOS envelope; entropy decoding is not performed")
        folder = self.camera.run.directory / name
        folder.mkdir(exist_ok=True, mode=0o700)
        for index, frame in enumerate(self.samples):
            (folder / ("sample-%03d.jpg" % index)).write_bytes(frame)
        json_write(folder / "datagrams.json", {"datagrams": self.raw_packets})
        return self.camera.run.save(name, metrics)


def liveview(camera, args):
    session = LiveSession(camera, args)
    interrupted = False
    try:
        session.begin()
        session.stop.wait(args.seconds)
    except KeyboardInterrupt:
        interrupted = True
    finally:
        result = session.close()
    if interrupted:
        raise FieldError("Interrupted; stopstream attempted, evidence saved", 130)
    if session.errors or not result["last_3s_gate"]["passed"] or not result["all_measured_windows_passed"]:
        raise FieldError("Liveview gate failed; move the scene and inspect frame/framing evidence", GATE)


def protocol_info(value):
    # Some observed cameras use a semicolon instead of the third colon.
    parts = value.split(":", 3)
    if len(parts) == 3 and ";" in parts[2]:
        mime, attributes = parts[2].split(";", 1)
        parts = parts[:2] + [mime, attributes]
    if len(parts) != 4:
        raise FieldError("Invalid res protocolInfo")
    attributes = {}
    for field in parts[3].split(";"):
        if "=" in field:
            key, content = field.split("=", 1)
            attributes[key] = content.strip("'\"")
    return {"transport": parts[0], "mime": parts[2], "attributes": attributes,
            "flag": attributes.get("PANASONIC.COM_PN"),
            "original_filename": attributes.get("OriginalFileName")}


def parse_browse(data):
    outer = xml_parse(data)
    if any(local_name(el.tag) == "Fault" for el in outer.iter()):
        raise FieldError("SOAP Fault: " + (first_text(outer, "errorDescription") or first_text(outer, "faultstring") or "unknown"))
    result = first_text(outer, "Result")
    if result is None:
        raise FieldError("SOAP Browse has no DIDL Result")
    didl = xml_parse(result)
    if local_name(didl.tag) != "DIDL-Lite":
        raise FieldError("Expected DIDL-Lite")
    entries = []
    for el in didl:
        kind = local_name(el.tag)
        if kind not in ("item", "container"):
            continue
        resources = []
        for child in el:
            if local_name(child.tag) == "res":
                resource = {"url": (child.text or "").strip(), "protocolInfo": child.get("protocolInfo", ""),
                            "size": int(child.get("size")) if child.get("size") is not None else None,
                            "resolution": child.get("resolution")}
                resource.update(protocol_info(resource["protocolInfo"]))
                resource["original_filename"] = (resource["original_filename"] or child.get("OriginalFileName")
                                                 or first_text(el, "OriginalFileName"))
                resources.append(resource)
        entries.append({"kind": kind, "id": el.get("id"), "parent_id": el.get("parentID"),
                        "slot": first_text(el, "StorageID") or first_text(el, "X_StorageID"),
                        "title": first_text(el, "title"), "resources": resources})
    try:
        number = int(first_text(outer, "NumberReturned"))
        total = int(first_text(outer, "TotalMatches"))
        update = first_text(outer, "UpdateID")
        if number != len(entries) or not 0 <= number <= total:
            raise ValueError("Inconsistent pagination counts")
    except (TypeError, ValueError) as exc:
        raise FieldError("Invalid Browse pagination: " + str(exc)) from exc
    return {"entries": entries, "number_returned": number, "total_matches": total, "update_id": update}


def select_original(item, camera=None):
    candidates = {}
    for resource in item.get("resources", []):
        if resource.get("flag") not in ("CAM_ORG", "CAM_RAW_JPG") or resource.get("transport") != "http-get":
            continue
        if resource.get("attributes", {}).get("DLNA.ORG_CI") == "1":
            continue
        suffix = urllib.parse.urlsplit(resource["url"]).path.upper()
        filename = (resource.get("original_filename") or "").upper()
        if suffix.endswith((".RW2", ".RAW", ".MP4")) or filename.endswith((".RW2", ".RAW", ".MP4")):
            continue
        if camera:
            camera.allowed_data_url(resource["url"])
        candidates[resource["url"]] = resource
    if len(candidates) != 1:
        raise FieldError("Expected exactly one original JPEG candidate, found %d" % len(candidates), AMBIGUOUS)
    return next(iter(candidates.values()))


def browse_body(object_id, start, count):
    env = ET.Element("{%s}Envelope" % SOAP, {"{%s}encodingStyle" % SOAP: SOAP})
    body = ET.SubElement(env, "{%s}Body" % SOAP)
    call = ET.SubElement(body, "{%s}Browse" % CDS)
    for name, text in (("ObjectID", object_id), ("BrowseFlag", "BrowseDirectChildren"), ("Filter", "*"),
                       ("StartingIndex", str(start)), ("RequestedCount", str(count)), ("SortCriteria", "")):
        ET.SubElement(call, name).text = text
    ET.SubElement(call, "{urn:schemas-panasonic-com:pana}X_FromCP").text = "LumixLink2.0"
    return ET.tostring(env, encoding="utf-8", xml_declaration=True)


def control_url(camera, override=None):
    if override:
        camera.allowed_data_url(override)
        return override
    path = camera.run.directory / "discovery.json"
    if not path.exists():
        raise FieldError("Run discover first, or provide the captured --control-url", USAGE)
    saved = json_read(path)
    if saved.get("camera_ip") != camera.ip:
        raise FieldError("Discovery belongs to a different camera IP", USAGE)
    urls = {service["controlURL"] for device in saved.get("devices", []) for service in device.get("services", [])
            if service.get("serviceType", "").startswith(CDS.rsplit(":", 1)[0] + ":") and service.get("controlURL")}
    if len(urls) != 1:
        raise FieldError("ContentDirectory URL is missing or ambiguous; specify --control-url", AMBIGUOUS)
    url = urls.pop()
    camera.allowed_data_url(url)
    return url


def read_catalog(camera, url, object_id="0", page_size=100, max_items=100000):
    camera.allowed_data_url(url)
    queue, visited, items, containers = collections.deque([object_id]), set(), [], []
    scheduled = {object_id}
    while queue:
        current = queue.popleft()
        if current in visited:
            continue
        visited.add(current)
        start, update, expected_total = 0, None, None
        while True:
            data, _ = camera.request(url, "POST", browse_body(current, start, page_size),
                                     {"Content-Type": "text/xml; charset=utf-8", "SOAPAction": '"%s#Browse"' % CDS})
            page = parse_browse(data)
            if start and (page["update_id"] != update or page["total_matches"] != expected_total):
                raise FieldError("Catalog changed during pagination; new baseline required", AMBIGUOUS)
            update, expected_total = page["update_id"], page["total_matches"]
            for entry in page["entries"]:
                if not entry["id"]:
                    raise FieldError("Catalog item without stable ID", AMBIGUOUS)
                for resource in entry["resources"]:
                    camera.allowed_data_url(resource["url"])
                if entry["kind"] == "container":
                    if entry["id"] in scheduled:
                        raise FieldError("Repeated/cyclic catalog container; baseline incomplete", AMBIGUOUS)
                    containers.append(entry)
                    queue.append(entry["id"])
                    scheduled.add(entry["id"])
                else:
                    items.append(entry)
            if len(items) + len(containers) > max_items:
                raise FieldError("Catalog item bound exceeded; baseline incomplete", AMBIGUOUS)
            start += page["number_returned"]
            if start == expected_total:
                break
            if not page["number_returned"] or start > expected_total:
                raise FieldError("Catalog pagination incomplete", AMBIGUOUS)
    identities = [item_identity(item) for item in items]
    if len(identities) != len(set(identities)):
        raise FieldError("Duplicate catalog identities; baseline ambiguous", AMBIGUOUS)
    return {"camera_ip": camera.ip, "control_url": url, "object_id": object_id,
            "complete": True, "items": items, "containers": containers}


def item_identity(item):
    return (item.get("slot"), item.get("parent_id"), item.get("id"))


def new_originals(baseline, current, camera):
    if not baseline.get("complete") or baseline.get("camera_ip") != camera.ip:
        raise FieldError("Baseline incomplete or belongs to a different IP", AMBIGUOUS)
    old = {item_identity(item): item for item in baseline["items"]}
    new = []
    for item in current["items"]:
        identity = item_identity(item)
        if identity in old:
            if old[identity].get("resources") != item.get("resources"):
                raise FieldError("An existing catalog identity changed; refusing file attribution", AMBIGUOUS)
            continue
        flags = {resource.get("flag") for resource in item["resources"]}
        if flags & {"CAM_ORG", "CAM_RAW_JPG"}:
            new.append((item, select_original(item, camera)))
    if len(new) > 1:
        raise FieldError("Multiple new JPEGs; refusing ambiguous match", AMBIGUOUS)
    return new


def catalog(camera, args):
    url = control_url(camera, args.control_url)
    camera.command("camcmd", value="playmode")
    result = read_catalog(camera, url, args.object_id, args.page_size)
    camera.run.save("baseline", result)


def download_original(camera, resource, destination):
    destination = Path(destination)
    if destination.exists():
        raise FieldError("Download target already exists; choose a new path", USAGE)
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    camera.allowed_data_url(resource["url"])
    connection, parts = camera.connection(resource["url"])
    fd, temporary = tempfile.mkstemp(prefix=".s5-download-", dir=str(destination.parent))
    metadata = {"kind": "original-download", "url": resource["url"], "started_monotonic": time.monotonic()}
    try:
        headers = {"Connection": "close", "User-Agent": camera.user_agent}
        if camera.session:
            headers["X-SESSION_ID"] = camera.session
        path = urllib.parse.urlunsplit(("", "", parts.path, parts.query, ""))
        connection.request("GET", path, headers=headers)
        response = connection.getresponse()
        metadata.update(status=response.status, response_headers=dict(response.getheaders()))
        if response.status != 200:
            raise FieldError("Original download HTTP %d; no redirect followed" % response.status)
        expected = response.getheader("Content-Length")
        received = 0
        with os.fdopen(fd, "wb") as handle:
            fd = None
            while True:
                chunk = response.read(65536)
                if not chunk:
                    break
                received += len(chunk)
                if received > MAX_JPEG:
                    raise FieldError("Original exceeds 64 MiB bound")
                handle.write(chunk)
            handle.flush()
            os.fsync(handle.fileno())
        if expected is not None and received != int(expected):
            raise FieldError("HTTP length mismatch")
        if resource.get("size") is not None and received != resource["size"]:
            raise FieldError("DIDL size mismatch; original not published")
        info = file_info(temporary)
        os.replace(temporary, destination)
        info["path"] = str(destination)
        metadata["size"] = received
        return info
    except (OSError, http.client.HTTPException) as exc:
        raise FieldError("Original download failed (no retry): " + str(exc), NETWORK) from exc
    finally:
        metadata["completed_monotonic"] = time.monotonic()
        camera.run.raw(metadata)
        connection.close()
        if fd is not None:
            os.close(fd)
        if os.path.exists(temporary):
            os.unlink(temporary)


def capture_once(camera):
    # One call site and a new direct HTTP connection. Never put this in a poll
    # loop, timeout handler, retry decorator or recovery/resume path.
    return camera.command("camcmd", value="capture")


def shoot(camera, args):
    result = {"camera_ip": camera.ip, "capture_dispatches": 0, "status": "preparing"}
    baseline, url, session, frozen = None, None, None, None
    if args.baseline:
        baseline = json_read(args.baseline)
        url = control_url(camera, args.control_url or baseline.get("control_url"))
        current = read_catalog(camera, url, baseline.get("object_id", "0"), args.page_size)
        if new_originals(baseline, current, camera):
            raise FieldError("Baseline already has a newer JPEG; make a fresh baseline before capture", AMBIGUOUS)
    elif args.download:
        raise FieldError("--download requires a complete --baseline", USAGE)
    if not args.yes:
        print("Will send capture EXACTLY ONCE to %s. Type SHOOT to confirm:" % camera.ip, file=sys.stderr)
        try:
            confirmed = input().strip() == "SHOOT"
        except EOFError:
            confirmed = False
        if not confirmed:
            raise FieldError("Capture cancelled; no capture sent", 130)
    try:
        if args.prebuffer_seconds:
            session = LiveSession(camera, args)
            session.begin()
            session.stop.wait(args.prebuffer_seconds)
            freeze_at = time.monotonic()
            metrics, frozen = session.freeze(freeze_at)
            result["prebuffer"] = metrics
            result["freeze_monotonic"] = freeze_at
            if session.errors or not metrics["last_3s_gate"]["passed"]:
                raise FieldError("Pre-shutter 3 s gate failed; capture NOT sent", GATE)
        else:
            camera.command("camcmd", value="recmode")
        result["capture_dispatches"] = 1
        result["capture_dispatch_monotonic"] = time.monotonic()
        result["capture_utc"] = utc_now()
        result["status"] = "dispatch intent; execution may become uncertain"
        # Durable intent is written before sending; a subsequent invocation is
        # never treated as a resume that may replay this command.
        json_write(camera.run.directory / "shoot.json", result)
        if session:
            # Disk I/O in the durable intent must not turn a previously ready
            # buffer into an old buffer. Freeze again at the actual boundary.
            freeze_at = time.monotonic()
            metrics, frozen = session.freeze(freeze_at)
            result["prebuffer"] = metrics
            result["freeze_monotonic"] = freeze_at
            dispatch_at = time.monotonic()
            last_age = metrics["last_frame_age_ms"]
            if (session.errors or not metrics["last_3s_gate"]["passed"] or last_age is None
                    or last_age + (dispatch_at - freeze_at) * 1000 > 500):
                result["capture_dispatches"] = 0
                result["status"] = "buffer stale before dispatch; capture not sent"
                raise FieldError("Prebuffer became stale before dispatch; capture NOT sent", GATE)
            result["capture_dispatch_monotonic"] = dispatch_at
            result["capture_utc"] = utc_now()
        try:
            result["capture_reply"] = capture_once(camera)
            result["status"] = "accepted; file not yet verified"
        except FieldError as exc:
            result["status"] = "execution unknown; do not repeat capture"
            result["capture_error"] = str(exc)
            if exc.code != NETWORK or not baseline:
                raise
            # Only read-only catalog reconciliation is allowed after timeout.
        result["capture_reply_monotonic"] = time.monotonic()
        if session:
            session.stop.wait(args.post_seconds)
            result["liveview"] = session.close("shoot-liveview")
            session = None
        if baseline:
            camera.command("camcmd", value="playmode")
            deadline = time.monotonic() + args.wait_seconds
            first_seen, candidate, read_errors = None, None, []
            while time.monotonic() < deadline:
                try:
                    current = read_catalog(camera, url, baseline.get("object_id", "0"), args.page_size)
                    matches = new_originals(baseline, current, camera)
                except FieldError as exc:
                    if exc.code != NETWORK:
                        raise
                    read_errors.append(str(exc))
                    time.sleep(min(args.poll_interval, max(0, deadline - time.monotonic())))
                    continue
                if matches:
                    item, resource = matches[0]
                    identity = (item_identity(item), resource["url"], resource.get("size"))
                    if candidate != identity:
                        candidate, first_seen = identity, time.monotonic()
                    if time.monotonic() - first_seen >= args.settle_seconds:
                        result["new_item"] = item
                        result["item_first_seen_monotonic"] = first_seen
                        result["catalog_read_errors"] = read_errors
                        if args.download:
                            result["download"] = download_original(camera, resource, args.download_to or camera.run.directory / "phone-original.jpg")
                            result["download_complete_monotonic"] = time.monotonic()
                            result["status"] = "unique original candidate downloaded; SD comparison required"
                        break
                else:
                    candidate, first_seen = None, None
                time.sleep(min(args.poll_interval, max(0, deadline - time.monotonic())))
            else:
                raise FieldError("No stable, unique new JPEG before deadline; do not resend capture", AMBIGUOUS)
    except (FieldError, KeyboardInterrupt) as exc:
        result["error"] = str(exc) or "Interrupted"
        raise
    finally:
        if session:
            result["liveview"] = session.close("shoot-liveview")
        if frozen:
            folder = camera.run.directory / "prebuffer"
            folder.mkdir(exist_ok=True, mode=0o700)
            manifest = []
            for index, (at, frame) in enumerate(frozen):
                filename = "pre-%04d.jpg" % index
                (folder / filename).write_bytes(frame)
                manifest.append({"filename": filename, "relative_to_capture_ms": (at - result.get("capture_dispatch_monotonic", at)) * 1000,
                                 "sha256": hashlib.sha256(frame).hexdigest()})
            json_write(folder / "manifest.json", {"frames": manifest, "pre_only": True})
            result["prebuffer_frames_saved"] = len(manifest)
        camera.run.save("shoot", result)


def verify(run, args):
    sd, phone = file_info(args.sd), file_info(args.phone)
    comparisons = {key: sd[key] == phone[key] for key in ("size", "sha256", "dimensions", "exif")}
    passed = all(comparisons.values())
    run.save("verify", {"sd": sd, "phone": phone, "comparisons": comparisons, "passed": passed})
    if not passed:
        raise FieldError("SD / downloaded file mismatch; byte preservation gate failed", MISMATCH)


SENSITIVE_KEY = re.compile(r"ssid|password|passwd|passphrase|credential|mac.?address|(?:^|_)mac(?:$|_)|serial|session|token|gps|latitude|longitude|udn|(?:^|_)usn(?:$|_)|friendlyname|device.name|client.id|challenge|value.words|value2.words|request.headers|response.headers", re.I)


def redact_text(value, secrets=()):
    for secret in secrets:
        if isinstance(secret, str) and secret:
            value = value.replace(secret, "[redacted]")
            value = value.replace(urllib.parse.quote(secret, safe=""), "[redacted]")
    value = re.sub(r"(?i)(?:[0-9a-f]{2}[:-]){5}[0-9a-f]{2}", "[redacted-mac]", value)
    value = re.sub(r"(?i)\b[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\b", "[redacted-uuid]", value)
    value = re.sub(r"(?is)<(?:[\w.-]+:)?(SSID|Password|SerialNumber|GPS\w*|X-SESSION_ID|session_id|UDN)\b[^>]*>.*?</(?:[\w.-]+:)?\1\s*>", "[redacted]", value)
    value = re.sub(r"(?i)((?:ssid|password|passwd|serial(?:number)?|x-session_id|session_id|token|gps\w*|latitude|longitude)\s*[=:]\s*)(?:\"[^\"]*\"|'[^']*'|[^\s&<,;]+)", r"\1[redacted]", value)
    if "mode=accctrl" in value or "type=req_acc" in value or "type=device_name" in value:
        value = re.sub(r"(?i)(value2?=)[^&\s]+", r"\1[redacted]", value)
    if value.startswith("/") and not value.startswith("/cam.cgi"):
        value = "[local-path]"
    return value


def redact(value, secrets=()):
    if isinstance(value, dict):
        output = {}
        auth_context = value.get("type", "").startswith("req_acc") if isinstance(value.get("type"), str) else False
        public_command = value.get("mode") in ("camcmd", "camctrl", "getsetting") and value.get("type") != "device_name"
        for key, item in value.items():
            if SENSITIVE_KEY.search(str(key)) or key in ("fields", "hex", "raw", "body", "response_value", "response_value2") or ((auth_context or not public_command) and key in ("value", "value2")):
                output[key] = item if isinstance(item, bool) else "[redacted]"
            elif key in ("model", "modelName", "model_number") and item in ("DC-S5", "S5"):
                # A public model must not vanish when a friendly name equals it.
                output[key] = item
            else:
                output[key] = redact(item, secrets)
        return output
    if isinstance(value, list):
        return [redact(item, secrets) for item in value]
    if isinstance(value, str):
        return redact_text(value, secrets)
    return value


def collect_secrets(value):
    found = []
    if isinstance(value, dict):
        for key, item in value.items():
            if SENSITIVE_KEY.search(str(key)) or key in ("fields", "response_value", "response_value2"):
                def strings(node):
                    if isinstance(node, str):
                        found.append(node)
                    elif isinstance(node, (list, tuple)):
                        for child in node:
                            strings(child)
                    elif isinstance(node, dict):
                        for child in node.values():
                            strings(child)
                strings(item)
            found.extend(collect_secrets(item))
    elif isinstance(value, list):
        for item in value:
            found.extend(collect_secrets(item))
    return found


def report(run, args):
    source = Path(args.source or run.directory)
    documents, secrets = [], []
    for path in sorted(source.rglob("*.json")):
        relative = path.relative_to(source)
        if "raw" in relative.parts or path.name == "datagrams.json":
            continue
        content = json_read(path)
        secrets.extend(collect_secrets(content))
        if path.name.startswith("."):
            continue
        documents.append((str(relative), content))
    if not documents:
        raise FieldError("No measurement JSON found", USAGE)
    lines = ["# DC-S5 Wi-Fi field report (redacted)", "", "Generated: " + utc_now(), "",
             "Only mock results are software evidence; real DC-S5 feasibility requires field measurements.", "",
             "Threshold: full 3 s pre-shutter window, max gap and last-frame age ≤500 ms, ≥10 unique JPEG hashes/s; original bytes must match SD SHA-256.", "",
             "Raw responses, datagram hex, credentials, images, GPS and bugreports are excluded. Review this summary before sharing.", ""]
    for name, content in documents:
        lines.extend(["## " + redact_text(name, secrets), "", "```json", json.dumps(redact(content, secrets), ensure_ascii=False, indent=2, sort_keys=True), "```", ""])
    destination = Path(args.report_to or source / "REPORT.redacted.md")
    destination.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    destination.write_text("\n".join(lines), encoding="utf-8")
    print("Redacted report: " + str(destination))
    return destination


def live_arguments(parser):
    parser.add_argument("--port", type=int, default=49152)
    parser.add_argument("--keepalive", type=float, default=2)
    parser.add_argument("--raw-datagrams", type=int, default=20)
    parser.add_argument("--samples", type=int, default=3)
    parser.add_argument("--framing", choices=("datagram", "sequence"), default="datagram")
    parser.add_argument("--header-bytes", type=int, default=0)
    parser.add_argument("--sequence-offset", type=int, default=0)
    parser.add_argument("--sequence-bytes", type=int, choices=(1, 2, 4), default=2)
    parser.add_argument("--sequence-endian", choices=("big", "little"), default="big")


def catalog_arguments(parser):
    parser.add_argument("--control-url")
    parser.add_argument("--object-id", default="0")
    parser.add_argument("--page-size", type=int, default=100)


def build_parser():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--camera-ip", help="One literal IPv4 address (required for network commands)")
    parser.add_argument("--http-port", type=int, default=80, help="cam.cgi port; mock can use an unprivileged port")
    parser.add_argument("--timeout", type=float, default=5)
    parser.add_argument("--user-agent", default="Moment-S5-field-test/1", help="Explicit captured HTTP app identity; never auto-cycled")
    parser.add_argument("--out", default="./s5-field-runs/" + datetime.datetime.now().strftime("%Y%m%d-%H%M%S-%f"))
    parser.add_argument("--verbose", action="store_true", help="Print redacted request metadata; private raw bodies always saved")
    commands = parser.add_subparsers(dest="command", required=True)
    p = commands.add_parser("discover", help="IP-scoped unicast SSDP and device description")
    p.add_argument("--ssdp-port", type=int, default=1900)
    p.add_argument("--ssdp-seconds", type=float, default=2)
    p.add_argument("--description-port", type=int, default=60606)
    p.add_argument("--description-url")
    p = commands.add_parser("auth", help="Explicit access registration; never invoked automatically")
    p.add_argument("--flow", choices=("legacy", "gen2"), required=True)
    p.add_argument("--client-id", default="0")
    p.add_argument("--device-name", default="moment-s5-field")
    p.add_argument("--register-name", action="store_true")
    group = p.add_mutually_exclusive_group()
    group.add_argument("--challenge-only", action="store_true")
    group.add_argument("--gen2-profile", help="Owner-verified S5 byte-XOR profile JSON")
    group.add_argument("--response-file", help="IP-bound value/value2 JSON for a previously obtained challenge")
    p.add_argument("--exchanges", type=int, choices=(1, 2), default=1, help="Explicit req_acc_e count; never automatically repeated")
    p = commands.add_parser("probe", help="Read-only camera state, menus, lens and settings")
    p.add_argument("--settings", default="iso,focal,shtrspeed,liveviewsize")
    p = commands.add_parser("liveview", help="UDP JPEG measurements with 3 s feasibility gate")
    p.add_argument("--seconds", type=float, default=60)
    live_arguments(p)
    commands.add_parser("af", help="Send oneshot_af once")
    p = commands.add_parser("focus", help="Send one relative focus command")
    p.add_argument("--step", choices=("wide-fast", "wide-slow", "tele-fast", "tele-slow"), required=True)
    p = commands.add_parser("catalog", help="Playmode and exhaustive recursive SOAP Browse baseline")
    catalog_arguments(p)
    p = commands.add_parser("shoot", help="Confirm, capture once, optionally reconcile and download")
    p.add_argument("--yes", action="store_true")
    p.add_argument("--baseline")
    p.add_argument("--download", action="store_true")
    p.add_argument("--download-to")
    p.add_argument("--wait-seconds", type=float, default=60)
    p.add_argument("--poll-interval", type=float, default=0.5)
    p.add_argument("--settle-seconds", type=float, default=1)
    p.add_argument("--prebuffer-seconds", type=float, default=0, help="Fill and freeze a live 3 s buffer before sending capture")
    p.add_argument("--post-seconds", type=float, default=2, help="Observe stream interruption after capture")
    catalog_arguments(p)
    live_arguments(p)
    p = commands.add_parser("verify", help="SD vs downloaded JPEG size/hash/dimensions/EXIF")
    p.add_argument("--sd", required=True)
    p.add_argument("--phone", required=True)
    p = commands.add_parser("report", help="Bundle result JSON into a redacted Markdown summary")
    p.add_argument("--source")
    p.add_argument("--report-to")
    return parser


def main(argv=None):
    parser = build_parser()
    args = parser.parse_args(argv)
    if not math.isfinite(args.timeout) or args.timeout <= 0 or not 1 <= args.http_port <= 65535:
        parser.error("timeout must be positive and HTTP port valid")
    for key in ("seconds", "ssdp_seconds", "keepalive", "poll_interval", "wait_seconds", "settle_seconds"):
        if hasattr(args, key) and (not math.isfinite(getattr(args, key)) or getattr(args, key) <= 0):
            parser.error("--" + key.replace("_", "-") + " must be positive")
    if hasattr(args, "port") and not 0 <= args.port <= 65535:
        parser.error("UDP port must be 0..65535 (0 selects an ephemeral port)")
    if hasattr(args, "ssdp_port") and not 1 <= args.ssdp_port <= 65535:
        parser.error("SSDP port must be 1..65535")
    if hasattr(args, "description_port") and not 1 <= args.description_port <= 65535:
        parser.error("Description port must be 1..65535")
    if hasattr(args, "framing"):
        if min(args.samples, args.raw_datagrams, args.header_bytes, args.sequence_offset) < 0 or args.samples > 100 or args.raw_datagrams > 1000:
            parser.error("Invalid sample/datagram/header bounds")
        if args.framing == "sequence" and args.header_bytes < args.sequence_offset + args.sequence_bytes:
            parser.error("Measured sequence field must fit inside --header-bytes")
    if hasattr(args, "page_size") and not 1 <= args.page_size <= 1000:
        parser.error("page size must be 1..1000")
    if args.command == "shoot" and (not math.isfinite(args.prebuffer_seconds) or not math.isfinite(args.post_seconds)
                                    or args.prebuffer_seconds < 0 or args.post_seconds < 0):
        parser.error("prebuffer/post seconds cannot be negative")
    if args.command == "auth" and args.flow == "gen2" and not (args.challenge_only or args.gen2_profile or args.response_file):
        parser.error("gen2 requires --challenge-only, --gen2-profile or --response-file; no S5 constants guessed")
    if args.command == "auth" and args.flow == "legacy" and (args.challenge_only or args.gen2_profile or args.response_file or args.exchanges != 1):
        parser.error("gen2 options cannot be combined with --flow legacy")
    if args.command == "shoot" and args.download_to and not args.download:
        parser.error("--download-to requires --download")
    run = Run(args.out, args.verbose)
    try:
        if args.command in ("verify", "report"):
            {"verify": verify, "report": report}[args.command](run, args)
        else:
            if not args.camera_ip:
                parser.error("--camera-ip is required for network commands")
            camera = Camera(args.camera_ip, args.timeout, run, args.http_port, args.user_agent)
            if args.command in ("af", "focus"):
                reply = (camera.command("camcmd", value="oneshot_af") if args.command == "af"
                         else camera.command("camctrl", "focus", args.step))
                run.save(args.command, {"camera_ip": camera.ip, "step": getattr(args, "step", None), "reply": reply})
            else:
                {"discover": discover, "auth": auth, "probe": probe, "liveview": liveview,
                 "catalog": catalog, "shoot": shoot}[args.command](camera, args)
        return OK
    except FieldError as exc:
        print("ERROR: " + redact_text(str(exc)), file=sys.stderr)
        json_write(run.directory / (args.command + "-error.json"),
                   {"command": args.command, "error": str(exc), "exit_code": exc.code, "recorded_utc": utc_now()})
        return exc.code
    except KeyboardInterrupt:
        print("Interrupted; do not repeat an uncertain capture", file=sys.stderr)
        return 130
    except (OSError, ValueError, http.client.HTTPException) as exc:
        print("ERROR: " + redact_text(str(exc)), file=sys.stderr)
        json_write(run.directory / (args.command + "-error.json"),
                   {"command": args.command, "error": str(exc), "exit_code": PROTOCOL, "recorded_utc": utc_now()})
        return PROTOCOL


if __name__ == "__main__":
    sys.exit(main())
