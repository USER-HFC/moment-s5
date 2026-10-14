#!/usr/bin/env python3
"""Offline, redacted HTTP summary from pcap/pcapng. Python 3.9+, MIT.

The dependency-free reader handles Ethernet/VLAN, loopback, raw IPv4 and
Linux cooked links, IPv4 TCP, Content-Length and chunked HTTP. It refuses
gapped/conflicting TCP data. IPv6, radiotap, encrypted Wi-Fi/TLS, IP fragments
and TCP sequence wrap need an optional tshark/Wireshark analysis instead.
"""
import argparse
import collections
import importlib.util
import ipaddress
import json
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys
import urllib.parse

spec = importlib.util.spec_from_file_location("s5wifi", Path(__file__).with_name("s5wifi.py"))
s5 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s5)
MAX_CAPTURE = 256 * 1024 * 1024
MAX_STREAM = 16 * 1024 * 1024


def packets(data):
    if data[:4] in (b"\xd4\xc3\xb2\xa1", b"\xa1\xb2\xc3\xd4", b"\x4d\x3c\xb2\xa1", b"\xa1\xb2\x3c\x4d"):
        endian = "<" if data[:4] in (b"\xd4\xc3\xb2\xa1", b"\x4d\x3c\xb2\xa1") else ">"
        if len(data) < 24:
            raise s5.FieldError("Truncated pcap header")
        link = struct.unpack_from(endian + "I", data, 20)[0]
        at, frame = 24, 0
        while at < len(data):
            if at + 16 > len(data):
                raise s5.FieldError("Truncated pcap packet header")
            _, _, size, _ = struct.unpack_from(endian + "IIII", data, at)
            at += 16
            if size > 16 * 1024 * 1024 or at + size > len(data):
                raise s5.FieldError("Truncated/oversized pcap packet")
            frame += 1
            yield frame, link, data[at:at + size]
            at += size
        return
    if data[:4] != b"\x0a\x0d\x0d\x0a":
        raise s5.FieldError("Expected pcap or pcapng")
    at, frame, endian, interfaces = 0, 0, None, []
    while at < len(data):
        if at + 12 > len(data):
            raise s5.FieldError("Truncated pcapng block")
        if data[at:at + 4] == b"\x0a\x0d\x0d\x0a":
            magic = data[at + 8:at + 12]
            if magic not in (b"\x4d\x3c\x2b\x1a", b"\x1a\x2b\x3c\x4d"):
                raise s5.FieldError("Invalid pcapng byte order")
            endian = "<" if magic == b"\x4d\x3c\x2b\x1a" else ">"
            interfaces = []
        kind, size = struct.unpack_from(endian + "II", data, at)
        if size < 12 or size % 4 or at + size > len(data) or struct.unpack_from(endian + "I", data, at + size - 4)[0] != size:
            raise s5.FieldError("Invalid pcapng block length")
        body = data[at + 8:at + size - 4]
        if kind == 1:
            if len(body) < 8:
                raise s5.FieldError("Truncated pcapng interface")
            interfaces.append(struct.unpack_from(endian + "H", body)[0])
        elif kind == 6:
            if len(body) < 20:
                raise s5.FieldError("Truncated pcapng enhanced packet")
            interface, _, _, captured, _ = struct.unpack_from(endian + "IIIII", body)
            if interface >= len(interfaces) or captured > len(body) - 20:
                raise s5.FieldError("Invalid pcapng packet/interface")
            frame += 1
            yield frame, interfaces[interface], body[20:20 + captured]
        elif kind == 3:
            if len(body) < 4 or not interfaces:
                raise s5.FieldError("Invalid pcapng simple packet")
            original = struct.unpack_from(endian + "I", body)[0]
            frame += 1
            yield frame, interfaces[0], body[4:4 + min(original, len(body) - 4)]
        at += size


def ipv4_payload(link, packet):
    if link == 1:  # Ethernet with optional 802.1Q/QinQ tags.
        if len(packet) < 14:
            return None
        offset, ether = 14, int.from_bytes(packet[12:14], "big")
        while ether in (0x8100, 0x88a8):
            if len(packet) < offset + 4:
                return None
            ether = int.from_bytes(packet[offset + 2:offset + 4], "big")
            offset += 4
        if ether != 0x0800:
            return None
        return packet[offset:]
    if link in (0, 108):  # BSD null/loop; AF_INET is 2.
        if packet[:4] not in (b"\x02\0\0\0", b"\0\0\0\x02"):
            return None
        return packet[4:]
    if link in (101, 228):
        return packet
    if link == 113 and packet[14:16] == b"\x08\0":
        return packet[16:]
    if link == 276 and packet[:2] == b"\x08\0":
        return packet[20:]
    return None


def tcp_packet(link, packet):
    ip = ipv4_payload(link, packet)
    if not ip or len(ip) < 20 or ip[0] >> 4 != 4:
        return None
    header = (ip[0] & 15) * 4
    size = int.from_bytes(ip[2:4], "big")
    if header < 20 or len(ip) < size or ip[9] != 6 or int.from_bytes(ip[6:8], "big") & 0x3fff:
        return None
    tcp = ip[header:size]
    if len(tcp) < 20:
        return None
    source_port, destination_port, sequence = struct.unpack_from(">HHI", tcp)
    offset = (tcp[12] >> 4) * 4
    if offset < 20 or offset > len(tcp):
        return None
    # SYN consumes a sequence number. FIN packets may still contain payload.
    sequence = (sequence + bool(tcp[13] & 2)) % (1 << 32)
    return (str(ipaddress.IPv4Address(ip[12:16])), source_port,
            str(ipaddress.IPv4Address(ip[16:20])), destination_port, sequence, tcp[offset:])


def reassemble(segments):
    ordered = sorted(segments, key=lambda item: (item[0], item[1]))
    if not ordered:
        return b"", None
    initial = ordered[0][0]
    output = bytearray()
    for sequence, _, payload in ordered:
        offset = sequence - initial
        if offset > len(output):
            return bytes(output), "TCP sequence gap; only contiguous prefix analyzed"
        overlap = min(len(payload), len(output) - offset)
        if bytes(output[offset:offset + overlap]) != payload[:overlap]:
            return b"", "Conflicting TCP retransmission; stream refused"
        output.extend(payload[overlap:])
        if len(output) > MAX_STREAM:
            return b"", "TCP stream exceeds 16 MiB; use optional tshark"
    return bytes(output), None


def unchunk(data, at):
    output = bytearray()
    while True:
        end = data.find(b"\r\n", at)
        if end < 0:
            raise ValueError("Truncated chunk length")
        size = int(data[at:end].split(b";", 1)[0], 16)
        at = end + 2
        if size == 0:
            if data[at:at + 2] == b"\r\n":
                return bytes(output), at + 2
            trailers = data.find(b"\r\n\r\n", at)
            if trailers < 0:
                raise ValueError("Truncated chunk trailers")
            return bytes(output), trailers + 4
        if size < 0 or at + size + 2 > len(data) or data[at + size:at + size + 2] != b"\r\n":
            raise ValueError("Truncated chunk body")
        output.extend(data[at:at + size])
        at += size + 2


def http_messages(data):
    output, at = [], 0
    while at < len(data):
        header_end = data.find(b"\r\n\r\n", at)
        if header_end < 0 or header_end - at > 65536:
            break
        lines = data[at:header_end].decode("iso-8859-1").split("\r\n")
        if not lines[0].startswith(("GET ", "POST ", "HEAD ", "HTTP/1.")):
            break
        headers = {}
        for line in lines[1:]:
            if ":" in line:
                key, value = line.split(":", 1)
                headers[key.lower()] = value.strip()
        at = header_end + 4
        response = lines[0].startswith("HTTP/")
        status = int(lines[0].split()[1]) if response else None
        try:
            if headers.get("transfer-encoding", "").lower() == "chunked":
                body, at = unchunk(data, at)
            elif "content-length" in headers:
                size = int(headers["content-length"])
                if size < 0 or at + size > len(data):
                    break
                body, at = data[at:at + size], at + size
            elif response and status not in (100, 101, 204, 304):
                # Close-delimited response: only the last response can be read.
                body, at = data[at:], len(data)
            else:
                body = b""
        except ValueError:
            break
        if response and status < 200:
            continue
        output.append({"start": lines[0], "headers": headers, "body": body, "status": status})
    return output


def summarize_pair(request, response=None):
    method, target, _ = request["start"].split(" ", 2)
    parts = urllib.parse.urlsplit(target)
    parameters = urllib.parse.parse_qs(parts.query)
    action = request["headers"].get("soapaction")
    is_cam = parts.path.endswith("/cam.cgi")
    if not is_cam and not action and method != "POST":
        return None
    item = {"method": method, "path": parts.path, "kind": "cam.cgi" if is_cam else "DLNA/SOAP",
            "parameters": {key: values[0] if len(values) == 1 else values for key, values in parameters.items()},
            "http_status": response.get("status") if response else None,
            "response_captured": bool(response)}
    if action:
        item["soap_action"] = action.strip('"')
    if not is_cam and request.get("body"):
        try:
            root = s5.xml_parse(request["body"])
            body = next((el for el in root.iter() if s5.local_name(el.tag) == "Body"), None)
            item["soap_calls"] = [s5.local_name(el.tag) for el in body] if body is not None else []
        except s5.FieldError:
            item["soap_parse"] = "unrecognized or truncated XML"
    if response:
        if is_cam:
            try:
                parsed = s5.parse_camrply(response["body"], response["headers"])
                item["protocol_result"] = parsed["result"]
                item["reply_format"] = parsed["format"]
                item["session_header_present"] = "x-session_id" in response["headers"]
                item["csv_field_count"] = len(parsed.get("fields", []))
            except s5.FieldError:
                item["protocol_result"] = "unrecognized or truncated response"
        elif response.get("body"):
            try:
                page = s5.parse_browse(response["body"])
                item["browse"] = {"number_returned": page["number_returned"], "total_matches": page["total_matches"],
                                  "resource_flags": sorted({res["flag"] or "unknown" for entry in page["entries"] for res in entry["resources"]})}
            except s5.FieldError:
                item["soap_response"] = "not a complete Browse response"
    if parameters.get("mode") == ["accctrl"] or parameters.get("type") == ["device_name"]:
        for key in ("value", "value2"):
            if key in item["parameters"]:
                item["parameters"][key] = "[redacted]"
    return s5.redact(item)


def builtin_summary(path, camera_ip):
    if Path(path).stat().st_size > MAX_CAPTURE:
        raise s5.FieldError("Capture exceeds 256 MiB; split it locally or use --tshark")
    data = Path(path).read_bytes()
    streams, links, packet_count = collections.defaultdict(list), set(), 0
    for frame, link, packet in packets(data):
        packet_count += 1
        links.add(link)
        tcp = tcp_packet(link, packet)
        if not tcp:
            continue
        src, sport, dst, dport, sequence, payload = tcp
        if camera_ip not in (src, dst) or not payload:
            continue
        streams[(src, sport, dst, dport)].append((sequence, frame, payload))
    conversations, warnings, handled = [], [], set()
    for direction, segments in streams.items():
        if direction in handled:
            continue
        src, sport, dst, dport = direction
        reverse = (dst, dport, src, sport)
        forward_data, warning = reassemble(segments)
        backward_data, backward_warning = reassemble(streams.get(reverse, []))
        handled.update((direction, reverse))
        warnings.extend(w for w in (warning, backward_warning) if w)
        first, second = http_messages(forward_data), http_messages(backward_data)
        if first and first[0]["status"] is not None:
            first, second = second, first
        for index, request in enumerate(first):
            if request["status"] is not None:
                continue
            summary = summarize_pair(request, second[index] if index < len(second) else None)
            if summary:
                conversations.append(summary)
    unsupported = links - {0, 1, 101, 108, 113, 228, 276}
    if unsupported:
        warnings.append("Unsupported link types %s; use optional --tshark after decryption if needed" % sorted(unsupported))
    return {"parser": "stdlib", "packet_count": packet_count, "link_types": sorted(links),
            "pairs": conversations, "warnings": sorted(set(warnings)),
            "limitations": "IPv4 plaintext HTTP only; no fragment/TLS/Wi-Fi decryption or TCP sequence wrap. Missing packets and truncated HTTP are not reconstructed speculatively."}


def tshark_summary(path, camera_ip):
    executable = shutil.which("tshark")
    if not executable:
        raise s5.FieldError("tshark is optional and is not installed; omit --tshark for supported captures", s5.USAGE)
    fields = ["frame.number", "tcp.stream", "http.request.method", "http.request.full_uri",
              "http.response.code", "http.request_in", "http.file_data", "http.request.line"]
    command = [executable, "-r", str(path), "-Y", "ip.addr == %s && (http.request || http.response)" % camera_ip,
               "-d", "tcp.port==60606,http", "-d", "tcp.port==50001,http", "-T", "fields",
               "-E", "separator=/t", "-E", "occurrence=a", "-E", "aggregator=|"]
    for field in fields:
        command.extend(["-e", field])
    completed = subprocess.run(command, capture_output=True, timeout=120)
    if completed.returncode:
        raise s5.FieldError("tshark failed: " + completed.stderr.decode(errors="replace")[:1000])
    requests, pairs, warnings = {}, [], []
    for line in completed.stdout.decode(errors="replace").splitlines():
        columns = line.split("\t")
        columns += [""] * (len(fields) - len(columns))
        if any("|" in column for column in columns[:7]):
            warnings.append("Multiple HTTP messages in one frame skipped; use the stdlib parser or inspect in Wireshark")
            continue
        frame, stream, method, uri, status, request_in, raw_body, request_lines = columns[:8]
        action_match = re.search(r"(?i)(?:^|\|)SOAPAction:\s*([^|]+)", request_lines)
        soap_action = action_match.group(1).replace("\\r\\n", "").strip() if action_match else ""
        try:
            body = bytes.fromhex(raw_body.replace(":", "")) if raw_body else b""
        except ValueError:
            body = raw_body.encode()
        if method:
            request = {"start": "%s %s HTTP/1.1" % (method, uri), "headers": {"soapaction": soap_action} if soap_action else {}, "body": body}
            requests[frame] = request
        elif status and request_in in requests:
            response = {"status": int(status), "headers": {}, "body": body}
            item = summarize_pair(requests.pop(request_in), response)
            if item:
                item["tcp_stream"] = stream
                pairs.append(item)
    for request in requests.values():
        item = summarize_pair(request)
        if item:
            pairs.append(item)
    return {"parser": "optional tshark", "pairs": pairs,
            "warnings": sorted(set(warnings + ["Encrypted traffic requires local decryption first; no secrets or full bodies are exported."]))}


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("capture")
    parser.add_argument("--camera-ip", required=True)
    parser.add_argument("--out", default="./s5-field-runs/pcap-summary")
    parser.add_argument("--tshark", action="store_true", help="Use installed tshark instead of the stdlib decoder")
    args = parser.parse_args(argv)
    try:
        args.camera_ip = str(ipaddress.IPv4Address(args.camera_ip))
        value = (tshark_summary if args.tshark else builtin_summary)(args.capture, args.camera_ip)
        value.update(camera_ip=args.camera_ip, redacted=True, recorded_utc=s5.utc_now())
        output = Path(args.out)
        output.mkdir(parents=True, exist_ok=True, mode=0o700)
        s5.json_write(output / "pcap-summary.json", s5.redact(value))
        (output / "PCAP.redacted.md").write_text("# S5 HTTP capture summary (redacted)\n\n```json\n" + json.dumps(s5.redact(value), ensure_ascii=False, indent=2) + "\n```\n", encoding="utf-8")
        print(json.dumps(s5.redact(value), ensure_ascii=False, indent=2))
        return s5.OK if value["pairs"] else s5.PROTOCOL
    except (s5.FieldError, OSError, ValueError, struct.error, subprocess.TimeoutExpired) as exc:
        print("ERROR: " + s5.redact_text(str(exc)), file=sys.stderr)
        return getattr(exc, "code", s5.PROTOCOL)


if __name__ == "__main__":
    sys.exit(main())
