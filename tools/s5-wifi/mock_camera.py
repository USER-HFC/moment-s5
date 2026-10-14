#!/usr/bin/env python3
"""Self-authored loopback-only S5 protocol fixture, NOT a real S5 emulator.

The JPEG encoder below constructs tiny grayscale baseline JPEGs from uniform
pixels using independently chosen Huffman/quantization tables. No image or
third-party source fixture is bundled. Python 3.9+, repository MIT license.
"""
import argparse
import html
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import importlib.util
import json
from pathlib import Path
import socket
import struct
import threading
import time
import urllib.parse
import xml.etree.ElementTree as ET

spec = importlib.util.spec_from_file_location("s5wifi", Path(__file__).with_name("s5wifi.py"))
s5 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(s5)


def segment(marker, data):
    return bytes([255, marker]) + struct.pack(">H", len(data) + 2) + data


def sample_exif():
    # TIFF IFD0: make, model, orientation, DateTime and ExifIFD pointer.
    fields = [(0x010f, 2, b"FieldFixture\0"), (0x0110, 2, b"MOCK-DC-S5\0"),
              (0x0112, 3, struct.pack("<H", 1)), (0x0132, 2, b"2026:10:14 12:00:00\0")]
    initial_size = 8 + 2 + 5 * 12 + 4
    extra, entries = bytearray(), []
    for tag, kind, value in fields:
        count = len(value) if kind == 2 else 1
        pointer = value.ljust(4, b"\0") if len(value) <= 4 else struct.pack("<I", initial_size + len(extra))
        entries.append(struct.pack("<HHI", tag, kind, count) + pointer)
        if len(value) > 4:
            extra.extend(value)
    exif_offset = initial_size + len(extra)
    entries.append(struct.pack("<HHII", 0x8769, 4, 1, exif_offset))
    date = b"2026:10:14 12:00:00\0"
    exif_ifd = struct.pack("<H", 1) + struct.pack("<HHII", 0x9003, 2, len(date), exif_offset + 18) + b"\0" * 4 + date
    tiff = b"II" + struct.pack("<HIH", 42, 8, 5) + b"".join(entries) + b"\0" * 4 + extra + exif_ifd
    return b"Exif\0\0" + tiff


def make_jpeg(level=128, width=64, height=48):
    dc_counts = bytes([0, 0, 0, 12] + [0] * 12)
    ac_counts = bytes([1] + [0] * 15)
    blocks = ((width + 7) // 8) * ((height + 7) // 8)
    dc = level - 128  # DCT DC = 8*(level-128), quantization divisor = 8.
    category = abs(dc).bit_length()
    magnitude = dc if dc >= 0 else (1 << category) - 1 + dc
    bits = format(category, "04b") + (format(magnitude, "0%db" % category) if category else "") + "0"
    bits += "00000" * (blocks - 1)  # subsequent DC delta 0, AC end-of-block.
    bits += "1" * ((-len(bits)) % 8)
    entropy = bytes(int(bits[at:at + 8], 2) for at in range(0, len(bits), 8)).replace(b"\xff", b"\xff\0")
    return (b"\xff\xd8" + segment(0xe0, b"JFIF\0\x01\x01\0\0\x01\0\x01\0\0")
            + segment(0xe1, sample_exif()) + segment(0xdb, b"\0" + b"\x08" * 64)
            + segment(0xc0, b"\x08" + struct.pack(">HH", height, width) + b"\x01\x01\x11\0")
            + segment(0xc4, b"\0" + dc_counts + bytes(range(12)) + b"\x10" + ac_counts + b"\0")
            + segment(0xda, b"\x01\x01\0\0\x3f\0") + entropy + b"\xff\xd9")


class MockCamera:
    def __init__(self, http_port=0, ssdp_port=0, fps=15, capture_delay=0, framing="datagram"):
        self.fps, self.capture_delay, self.framing = fps, capture_delay, framing
        self.capture_count = 0
        self.capture_paths = []
        self.mode = "recmode"
        self.requests = []
        self.lock = threading.Lock()
        self.quit = threading.Event()
        self.stream_stop = threading.Event()
        self.stream_thread = None
        self.server = ThreadingHTTPServer(("127.0.0.1", http_port), self.handler())
        self.port = self.server.server_address[1]
        self.base = "http://127.0.0.1:%d" % self.port
        self.photos = {"fixture-0000": make_jpeg(80, 512, 384)}
        self.ssdp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.ssdp.bind(("127.0.0.1", ssdp_port))
        self.ssdp.settimeout(0.1)
        self.ssdp_port = self.ssdp.getsockname()[1]
        self.http_thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.ssdp_thread = threading.Thread(target=self.ssdp_loop, daemon=True)

    def start(self):
        self.http_thread.start()
        self.ssdp_thread.start()
        return self

    def close(self):
        self.quit.set()
        self.stop_stream()
        self.ssdp.close()
        self.server.shutdown()
        self.server.server_close()
        self.http_thread.join(timeout=2)
        self.ssdp_thread.join(timeout=2)

    def ssdp_loop(self):
        while not self.quit.is_set():
            try:
                packet, address = self.ssdp.recvfrom(8192)
                if packet.startswith(b"M-SEARCH "):
                    message = ("HTTP/1.1 200 OK\r\nLOCATION: %s/Lumix/Server0/ddd\r\n"
                               "ST: urn:schemas-upnp-org:device:MediaServer:1\r\n\r\n") % self.base
                    self.ssdp.sendto(message.encode("ascii"), address)
            except socket.timeout:
                continue
            except OSError:
                break

    def description(self):
        return ("<root xmlns='urn:schemas-upnp-org:device-1-0'><device>"
                "<manufacturer>Self-authored fixture</manufacturer><modelName>MOCK-DC-S5</modelName>"
                "<modelNumber>fixture</modelNumber><firmwareVersion>mock-1</firmwareVersion>"
                "<serialNumber>PRIVATE-MOCK-SERIAL</serialNumber><serviceList><service>"
                "<serviceType>%s</serviceType><serviceId>urn:upnp-org:serviceId:ContentDirectory</serviceId>"
                "<controlURL>/Server0/CDS_control</controlURL><SCPDURL>/cds.xml</SCPDURL>"
                "</service></serviceList></device></root>") % s5.CDS

    def browse(self, request):
        root = s5.xml_parse(request)
        start = int(s5.first_text(root, "StartingIndex", "0"))
        count = int(s5.first_text(root, "RequestedCount", "100"))
        if s5.first_text(root, "ObjectID") != "0":
            photos = []
        else:
            photos = sorted(self.photos.items())
        didl = ET.Element("DIDL-Lite", {"xmlns": "urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/",
                                       "xmlns:dc": "http://purl.org/dc/elements/1.1/"})
        for name, data in photos[start:start + count]:
            item = ET.SubElement(didl, "item", {"id": name, "parentID": "0"})
            ET.SubElement(item, "dc:title").text = name + ".JPG"
            ET.SubElement(item, "res", {"protocolInfo": "http-get:*:image/jpeg:PANASONIC.COM_PN=CAM_LRGTN",
                                        "size": "500"}).text = self.base + "/thumb/" + name + ".JPG"
            info = "http-get:*:application/octet-stream;PANASONIC.COM_PN=CAM_ORG;OriginalFileName='%s.JPG'" % name
            ET.SubElement(item, "res", {"protocolInfo": info, "size": str(len(data)), "resolution": "512x384"}).text = self.base + "/original/" + name + ".JPG"
        inner = ET.tostring(didl, encoding="unicode")
        return ("<s:Envelope xmlns:s='%s'><s:Body><u:BrowseResponse xmlns:u='%s'>"
                "<Result>%s</Result><NumberReturned>%d</NumberReturned><TotalMatches>%d</TotalMatches>"
                "<UpdateID>%d</UpdateID></u:BrowseResponse></s:Body></s:Envelope>") % (
                    s5.SOAP, s5.CDS, html.escape(inner), len(photos[start:start + count]), len(photos), self.capture_count)

    def start_stream(self, address, port):
        self.stop_stream()
        self.stream_stop = threading.Event()

        def stream():
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.bind(("127.0.0.1", 0))
            sequence, index = 0, 0
            try:
                while not self.stream_stop.is_set() and not self.quit.is_set():
                    data = make_jpeg(64 + index % 128)
                    packets = [data] if self.framing == "datagram" else [data[at:at + 173] for at in range(0, len(data), 173)]
                    for packet in packets:
                        if self.framing == "sequence":
                            packet = struct.pack(">H", sequence % 65536) + packet
                        sock.sendto(packet, (address, port))
                        sequence += 1
                    index += 1
                    self.stream_stop.wait(1 / self.fps)
            finally:
                sock.close()
        self.stream_thread = threading.Thread(target=stream, daemon=True)
        self.stream_thread.start()

    def stop_stream(self):
        self.stream_stop.set()
        if self.stream_thread:
            self.stream_thread.join(timeout=1)

    def handler(self):
        owner = self

        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass

            def respond(self, body, status=200, mime="text/xml", headers=None):
                if isinstance(body, str):
                    body = body.encode("utf-8")
                try:
                    self.send_response(status)
                    self.send_header("Content-Type", mime)
                    self.send_header("Content-Length", str(len(body)))
                    for key, value in (headers or {}).items():
                        self.send_header(key, value)
                    self.end_headers()
                    self.wfile.write(body)
                except (BrokenPipeError, ConnectionResetError):
                    pass

            def do_GET(self):
                parsed = urllib.parse.urlsplit(self.path)
                params = {k: v[0] for k, v in urllib.parse.parse_qs(parsed.query).items()}
                owner.requests.append({"method": "GET", "path": self.path})
                if parsed.path in ("/Lumix/Server0/ddd", "/Server0/ddd"):
                    return self.respond(owner.description())
                if parsed.path.startswith("/original/"):
                    name = Path(parsed.path).stem
                    data = owner.photos.get(name)
                    return self.respond(data if data else "Missing", 200 if data else 404, "image/jpeg")
                if parsed.path == "/redirect":
                    return self.respond("", 302, headers={"Location": owner.base + "/cam.cgi?mode=camcmd&value=capture"})
                if parsed.path != "/cam.cgi":
                    return self.respond("Missing", 404)
                mode, kind, value = params.get("mode"), params.get("type"), params.get("value")
                if mode == "accctrl":
                    if kind == "req_acc_g":
                        return self.respond("ok,01020304", mime="text/plain")
                    if kind == "req_acc_e":
                        return self.respond('ok,"Private, mock camera",remote,open,PRIVATE-MOCK-TOKEN', mime="text/plain",
                                            headers={"X-SESSION_ID": "PRIVATE-MOCK-TOKEN"})
                if mode == "startstream":
                    owner.start_stream(self.client_address[0], int(value))
                elif mode == "stopstream":
                    owner.stop_stream()
                elif mode == "camcmd" and value == "capture":
                    # Count immediately; delay only the HTTP reply, just like
                    # an executed shutter whose response is lost.
                    with owner.lock:
                        owner.capture_count += 1
                        name = "fixture-%04d" % owner.capture_count
                        owner.photos[name] = make_jpeg(170 + owner.capture_count % 30, 512, 384)
                        owner.capture_paths.append(self.path)
                    time.sleep(owner.capture_delay)
                elif mode == "camcmd" and value in ("playmode", "recmode"):
                    owner.mode = value
                if mode == "getstate":
                    return self.respond("<camrply><result>ok</result><state><cammode>%s</cammode></state></camrply>" % owner.mode)
                if mode == "getinfo":
                    return self.respond("<camrply><result>ok</result><%s><model>MOCK-DC-S5</model></%s></camrply>" % (kind, kind))
                if mode == "getsetting":
                    if kind not in ("iso", "focal", "shtrspeed", "liveviewsize"):
                        return self.respond("<camrply><result>err-param</result></camrply>")
                    return self.respond("<camrply><result>ok</result><setting><%s>fixture</%s></setting></camrply>" % (kind, kind))
                return self.respond("<camrply><result>ok</result></camrply>")

            def do_POST(self):
                owner.requests.append({"method": "POST", "path": self.path})
                length = int(self.headers.get("Content-Length", "0"))
                body = self.rfile.read(min(length, s5.MAX_XML))
                if self.path == "/Server0/CDS_control":
                    return self.respond(owner.browse(body))
                self.respond("Missing", 404)
        return Handler


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--http-port", type=int, default=18080)
    parser.add_argument("--ssdp-port", type=int, default=11900)
    parser.add_argument("--fps", type=float, default=15)
    parser.add_argument("--capture-delay", type=float, default=0)
    parser.add_argument("--framing", choices=("datagram", "sequence"), default="datagram")
    parser.add_argument("--out", default="./s5-field-runs/mock-camera")
    args = parser.parse_args()
    if args.fps <= 0 or args.capture_delay < 0:
        parser.error("fps must be positive; delay cannot be negative")
    camera = MockCamera(args.http_port, args.ssdp_port, args.fps, args.capture_delay, args.framing).start()
    output = Path(args.out)
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    print(json.dumps({"mock_only": True, "base": camera.base, "ssdp_port": camera.ssdp_port}), flush=True)
    try:
        while not camera.quit.wait(0.2):
            pass
    except KeyboardInterrupt:
        pass
    finally:
        camera.close()
        for name, data in camera.photos.items():
            (output / (name + ".JPG")).write_bytes(data)
        s5.json_write(output / "mock-state.json", {"mock_only": True, "capture_count": camera.capture_count,
                                                  "capture_paths": camera.capture_paths, "requests": camera.requests})


if __name__ == "__main__":
    main()
