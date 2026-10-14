"""Self-authored minimal fixtures; no third-party camera traces or images."""
import contextlib
import html
import importlib.util
import io
import json
from pathlib import Path
import struct
import subprocess
import tempfile
import time
import unittest
from unittest import mock


def load_file(name):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(name + ".py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


s5 = load_file("s5wifi")
mock_camera = load_file("mock_camera")
pcap = load_file("pcap_summarize")


def soap(didl, number=1, total=1):
    return ("<s:Envelope xmlns:s='%s'><s:Body><u:BrowseResponse xmlns:u='%s'>"
            "<Result>%s</Result><NumberReturned>%d</NumberReturned><TotalMatches>%d</TotalMatches>"
            "<UpdateID>1</UpdateID></u:BrowseResponse></s:Body></s:Envelope>" %
            (s5.SOAP, s5.CDS, html.escape(didl), number, total)).encode()


def didl(resources, identity="self-authored-photo"):
    return ("<DIDL-Lite xmlns='urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/'"
            " xmlns:dc='http://purl.org/dc/elements/1.1/'>"
            "<item id='%s' parentID='card-1'><dc:title>P0000001.JPG</dc:title>%s</item></DIDL-Lite>" % (identity, resources))


def resource(flag, path="original.JPG", mime="image/jpeg", conversion=None):
    info = "http-get:*:%s:PANASONIC.COM_PN=%s;OriginalFileName='P0000001.JPG'" % (mime, flag)
    if conversion:
        info += ";DLNA.ORG_CI=" + conversion
    return '<res protocolInfo="%s" size="1234">http://127.0.0.1:50001/%s</res>' % (info, path)


class ReplyTests(unittest.TestCase):
    def test_http_200_does_not_make_error_success(self):
        parsed = s5.parse_camrply(b"<camrply><result>err-unsuitable-app</result></camrply>")
        self.assertFalse(parsed["ok"])
        self.assertEqual(parsed["result"], "err-unsuitable-app")

    def test_namespace_xml_and_values(self):
        reply = s5.parse_camrply(b"<camrply xmlns='urn:fixture'><result>ok</result><state><iso>400</iso></state></camrply>")
        self.assertTrue(reply["ok"])
        self.assertEqual(reply["values"]["iso"], ["400"])

    def test_missing_result_unknown_and_entities_refused(self):
        for body in (b"<camrply/>", b"unknown", b"<!DOCTYPE camrply [<!ENTITY x 'ok'>]><camrply><result>&x;</result></camrply>"):
            with self.subTest(body=body), self.assertRaises(s5.FieldError):
                s5.parse_camrply(body)
        with self.assertRaises(s5.FieldError):
            s5.xml_parse("<!DOCTYPE a><a/>".encode("utf-16"))

    def test_gen2_csv_quoted_name_and_session(self):
        reply = s5.parse_camrply(b'ok,"Camera, fixture",remote,open,csv-token')
        self.assertEqual(reply["fields"][0], "Camera, fixture")
        self.assertEqual(reply["session_token"], "csv-token")
        header = s5.parse_camrply(b"ok,Camera,remote,open,csv-token", {"X-SeSsIoN_Id": "header-token"})
        self.assertEqual(header["session_token"], "header-token")
        self.assertNotIn("session_token", s5.parse_camrply(b"ok,01020304"))
        self.assertFalse(s5.parse_camrply(b"err-busy") ["ok"])

    def test_verified_profile_has_no_builtin_identity(self):
        # Arbitrary, self-chosen fixture words, not a production camera profile.
        profile = {"challenge_order": "little", "value_words": ["00000000", "aabbccdd"], "value2_words": ["01010101"]}
        self.assertEqual(s5.gen2_response("01020304", profile), ["04030201aeb8cedc", "05020300"])
        with self.assertRaises(s5.FieldError):
            s5.gen2_response("0102", profile)


class CatalogTests(unittest.TestCase):
    def test_soap_double_parse_and_original_over_thumbnail(self):
        page = s5.parse_browse(soap(didl(resource("CAM_LRGTN", "thumb.JPG") + resource("CAM_ORG"))))
        item = page["entries"][0]
        self.assertEqual(item["title"], "P0000001.JPG")
        original = s5.select_original(item)
        self.assertEqual(original["flag"], "CAM_ORG")
        self.assertEqual(original["size"], 1234)
        self.assertEqual(original["original_filename"], "P0000001.JPG")

    def test_raw_jpg_octet_stream_and_nonstandard_separator(self):
        info = "http-get:*:application/octet-stream;PANASONIC.COM_PN=CAM_RAW_JPG;OriginalFileName='P0000001.JPG'"
        resources = '<res protocolInfo="%s" size="99">http://127.0.0.1/original.JPG</res>' % info
        resources += resource("CAM_RAW", "photo.RW2", "application/octet-stream")
        item = s5.parse_browse(soap(didl(resources)))["entries"][0]
        self.assertEqual(s5.select_original(item)["flag"], "CAM_RAW_JPG")

    def test_thumbnails_raw_and_converted_never_fallback(self):
        for resources in (resource("CAM_LRGTN"), resource("CAM_RAW", "file.RW2"), resource("CAM_ORG", conversion="1")):
            item = s5.parse_browse(soap(didl(resources)))["entries"][0]
            with self.subTest(resources=resources), self.assertRaises(s5.FieldError) as caught:
                s5.select_original(item)
            self.assertEqual(caught.exception.code, s5.AMBIGUOUS)

    def test_two_originals_are_ambiguous(self):
        item = s5.parse_browse(soap(didl(resource("CAM_ORG", "card1.JPG") + resource("CAM_ORG", "card2.JPG"))))["entries"][0]
        with self.assertRaises(s5.FieldError):
            s5.select_original(item)

    def test_fault_and_mismatched_pagination(self):
        with self.assertRaises(s5.FieldError):
            s5.parse_browse(b"<Envelope><Fault><faultstring>fixture</faultstring></Fault></Envelope>")
        with self.assertRaises(s5.FieldError):
            s5.parse_browse(soap(didl(resource("CAM_ORG")), number=2, total=2))


class JPEGTests(unittest.TestCase):
    def test_self_authored_real_jpeg_and_exif(self):
        data = mock_camera.make_jpeg(160, 64, 48)
        self.assertEqual(s5.jpeg_dimensions(data), {"width": 64, "height": 48})
        self.assertEqual(s5.exif_basics(data)["orientation"], 1)
        self.assertEqual(s5.exif_basics(data)["datetime_original"], "2026:10:14 12:00:00")
        self.assertNotIn("gps", s5.exif_basics(data))

    def test_complete_prefixed_datagram_and_truncated_frame(self):
        data = mock_camera.make_jpeg()
        assembler = s5.JPEGAssembler()
        self.assertEqual(assembler.feed(b"fixture header" + data)[0][0], data)
        self.assertEqual(assembler.feed(data[:-2]), [])
        self.assertEqual(assembler.invalid, 1)

    def test_measured_sequence_reassembly_and_wrap(self):
        data = mock_camera.make_jpeg()
        assembler = s5.JPEGAssembler("sequence", header_bytes=2)
        pieces = [data[:100], data[100:200], data[200:]]
        frames = []
        for sequence, piece in zip((65535, 0, 1), pieces):
            frames += assembler.feed(struct.pack(">H", sequence) + piece)
        self.assertEqual(frames[0][0], data)

    def test_sequence_gap_duplicate_and_recovery(self):
        data = mock_camera.make_jpeg()
        assembler = s5.JPEGAssembler("sequence", header_bytes=2)
        assembler.feed(b"\0\x01" + data[:100])
        self.assertEqual(assembler.feed(b"\0\x03" + data[100:]), [])
        self.assertEqual(assembler.dropped, 1)
        self.assertEqual(assembler.feed(b"\0\x04" + data)[0][0], data)
        assembler.feed(b"\0\x05" + data[:100])
        self.assertEqual(assembler.feed(b"\0\x05" + data[100:]), [])
        self.assertEqual(assembler.dropped, 2)

    def test_invalid_sof_and_bound(self):
        data = mock_camera.make_jpeg()
        at = data.index(b"\xff\xc0")
        zero_height = data[:at + 5] + b"\0\0" + data[at + 7:]
        with self.assertRaises(s5.FieldError):
            s5.jpeg_dimensions(zero_height)
        self.assertEqual(s5.JPEGAssembler(max_frame=10).feed(data), [])

    def test_metric_math_distinguishes_duplicate_stall_and_gap(self):
        unique = [(0.05 + index / 15, str(index)) for index in range(45)]
        measured = s5.frame_metrics(unique, 0, 3)
        self.assertAlmostEqual(measured["complete_fps"], 15)
        self.assertAlmostEqual(measured["unique_fps"], 15)
        self.assertTrue(measured["last_3s_gate"]["passed"])
        duplicate = [(at, "same") for at, _ in unique]
        self.assertFalse(s5.frame_metrics(duplicate, 0, 3)["last_3s_gate"]["passed"])
        gap = [(at, digest) for at, digest in unique if not 1 < at < 1.7]
        self.assertFalse(s5.frame_metrics(gap, 0, 3)["last_3s_gate"]["passed"])
        self.assertFalse(s5.frame_metrics(unique, 0, 4)["last_3s_gate"]["passed"])
        self.assertFalse(s5.frame_metrics(unique[:10], 0, 1)["last_3s_gate"]["passed"])


class RedactionTests(unittest.TestCase):
    def test_opaque_response_values_hidden_public_commands_and_model_retained(self):
        self.assertEqual(s5.redact({"value": "response-secret", "value2": "response-secret-2"})["value"], "[redacted]")
        command = {"mode": "camcmd", "value": "capture"}
        self.assertEqual(s5.redact(command)["value"], "capture")
        camera = {"model": "DC-S5", "friendlyName": "DC-S5"}
        self.assertEqual(s5.redact(camera, s5.collect_secrets(camera))["model"], "DC-S5")

    def test_address_alias_uuid_and_quoted_text(self):
        value = {"macAddress": "aabbccddeeff", "USN": "private-upnp-id",
                 "note": "SSID='Private home network' GPSLatitude=1.234",
                 "uuid_path": "http://127.0.0.1/01234567-89ab-cdef-0123-456789abcdef/control"}
        text = json.dumps(s5.redact(value))
        for secret in ("aabbccddeeff", "private-upnp-id", "Private home network", "1.234", "01234567-89ab-cdef-0123-456789abcdef"):
            self.assertNotIn(secret, text)

    def test_packet_size_integer_keys_and_session_presence(self):
        value = s5.redact({"packet_sizes": {500: 30}, "session_received": True, "session_token": "private"})
        self.assertEqual(value["packet_sizes"], {500: 30})
        self.assertTrue(value["session_received"])
        self.assertEqual(value["session_token"], "[redacted]")

    def test_nested_secrets_mac_xml_query_and_gps(self):
        original = {"SSID": "secret-network", "password": "wifi-pass", "serialNumber": "SER123",
                    "session_token": "private-token", "gps": {"latitude": 1.234},
                    "nested": ["aa:bb:cc:dd:ee:ff", "<camrply><SerialNumber>SER123</SerialNumber></camrply>"],
                    "url": "http://127.0.0.1/cam.cgi?mode=accctrl&type=req_acc_e&value=private-response&value2=secret"}
        text = json.dumps(s5.redact(original, s5.collect_secrets(original)))
        for secret in ("secret-network", "wifi-pass", "SER123", "private-token", "1.234", "aa:bb:cc:dd:ee:ff", "private-response"):
            self.assertNotIn(secret, text)

    def test_report_excludes_raw_hex_and_images(self):
        with tempfile.TemporaryDirectory() as directory, contextlib.redirect_stdout(io.StringIO()):
            run = s5.Run(directory)
            s5.json_write(Path(directory) / "result.json", {"model": "DC-S5", "session_token": "private-token", "note": "private-token",
                                                          "serial_number": "PRIVATE-SERIAL", "control_url": "http://127.0.0.1/PRIVATE-SERIAL/control"})
            s5.json_write(Path(directory) / "raw" / "response.json", {"raw": "raw-secret"})
            s5.json_write(Path(directory) / "liveview" / "datagrams.json", {"hex": "unshared-hex"})
            (Path(directory) / "image.jpg").write_bytes(b"private-image")
            args = s5.build_parser().parse_args(["report", "--source", directory])
            report = s5.report(run, args).read_text()
            self.assertIn("DC-S5", report)
            for secret in ("private-token", "raw-secret", "unshared-hex", "private-image", "PRIVATE-SERIAL"):
                self.assertNotIn(secret, report)


class NetworkTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.mock = mock_camera.MockCamera(capture_delay=0.2).start()
        self.run = s5.Run(self.temp.name)
        self.camera = s5.Camera("127.0.0.1", 0.05, self.run, self.mock.port)

    def tearDown(self):
        self.mock.close()
        self.temp.cleanup()

    def test_capture_timeout_is_sent_once(self):
        with self.assertRaises(s5.FieldError) as caught:
            s5.capture_once(self.camera)
        self.assertEqual(caught.exception.code, s5.NETWORK)
        time.sleep(0.3)  # Long enough for a forbidden retry to reach the server.
        self.assertEqual(self.mock.capture_count, 1)
        self.assertEqual(len(self.mock.capture_paths), 1)

    def test_shoot_timeout_reconciles_without_second_capture(self):
        url = self.mock.base + "/Server0/CDS_control"
        baseline = s5.read_catalog(self.camera, url)
        path = Path(self.temp.name) / "baseline.json"
        s5.json_write(path, baseline)
        args = s5.build_parser().parse_args(["shoot", "--yes", "--baseline", str(path), "--download", "--wait-seconds", "2",
                                            "--poll-interval", "0.03", "--settle-seconds", "0.06"])
        with contextlib.redirect_stdout(io.StringIO()):
            s5.shoot(self.camera, args)
        self.assertEqual(self.mock.capture_count, 1)
        result = s5.json_read(Path(self.temp.name) / "shoot.json")
        self.assertEqual(result["capture_dispatches"], 1)
        self.assertIn("capture_error", result)
        self.assertTrue((Path(self.temp.name) / "phone-original.jpg").exists())

    def test_redirect_never_reaches_capture(self):
        with self.assertRaises(s5.FieldError):
            self.camera.request(self.mock.base + "/redirect")
        self.assertEqual(self.mock.capture_count, 0)

    def test_description_or_download_cannot_dispatch_a_command(self):
        command_url = self.mock.base + "/cam.cgi?mode=camcmd&value=capture"
        value = {"url": command_url, "size": None, "flag": "CAM_ORG", "transport": "http-get"}
        with self.assertRaises(s5.FieldError):
            s5.select_original({"resources": [value]}, self.camera)
        with self.assertRaises(s5.FieldError):
            s5.download_original(self.camera, value, Path(self.temp.name) / "bad.jpg")
        description = ("<root><device><service><controlURL>%s</controlURL></service></device></root>" % html.escape(command_url)).encode()
        with self.assertRaises(s5.FieldError):
            s5.parse_description(description, self.mock.base + "/description", self.camera)
        self.assertEqual(self.mock.capture_count, 0)

    def test_ip_scope_rejects_external_localhost_and_credentials(self):
        for url in ("http://example.com/", "http://localhost/", "http://127.0.0.2/", "https://127.0.0.1/", "http://user:pass@127.0.0.1/"):
            with self.subTest(url=url), self.assertRaises(s5.FieldError):
                self.camera.allowed_url(url)
        malicious = b"<root><URLBase>http://127.0.0.2/</URLBase></root>"
        with self.assertRaises(s5.FieldError):
            s5.parse_description(malicious, self.mock.base + "/description", self.camera)

    def test_explicit_user_agent_no_header_injection(self):
        camera = s5.Camera("127.0.0.1", 0.05, self.run, self.mock.port, "Owner-verified-fixture")
        camera.command("getstate")
        logs = list((Path(self.temp.name) / "raw").glob("*.json"))
        self.assertEqual(s5.json_read(logs[0])["request_headers"]["User-Agent"], "Owner-verified-fixture")
        with self.assertRaises(s5.FieldError):
            s5.Camera("127.0.0.1", 0.05, self.run, self.mock.port, "Bad\r\nX-Header: injection")

    def test_protocol_error_over_http_200(self):
        reply = self.camera.command("getsetting", "unsupported", check=False)
        self.assertFalse(reply["ok"])
        with self.assertRaises(s5.FieldError):
            self.camera.command("getsetting", "unsupported")

    def test_catalog_pagination_and_dual_new_match_refusal(self):
        url = self.mock.base + "/Server0/CDS_control"
        baseline = s5.read_catalog(self.camera, url, page_size=1)
        self.mock.photos["new-a"] = mock_camera.make_jpeg(100)
        self.mock.photos["new-b"] = mock_camera.make_jpeg(120)
        current = s5.read_catalog(self.camera, url, page_size=1)
        self.assertEqual(len(current["items"]), 3)
        with self.assertRaises(s5.FieldError) as caught:
            s5.new_originals(baseline, current, self.camera)
        self.assertEqual(caught.exception.code, s5.AMBIGUOUS)

    def test_existing_id_changed_cannot_be_new_capture(self):
        url = self.mock.base + "/Server0/CDS_control"
        baseline = s5.read_catalog(self.camera, url)
        current = json.loads(json.dumps(baseline))
        current["items"][0]["resources"][-1]["size"] += 1
        with self.assertRaises(s5.FieldError):
            s5.new_originals(baseline, current, self.camera)

    def test_partial_original_is_not_published(self):
        destination = Path(self.temp.name) / "original.jpg"
        item = s5.read_catalog(self.camera, self.mock.base + "/Server0/CDS_control")["items"][0]
        resource_value = s5.select_original(item, self.camera)
        resource_value["size"] += 1
        with self.assertRaises(s5.FieldError):
            s5.download_original(self.camera, resource_value, destination)
        self.assertFalse(destination.exists())
        self.assertEqual(list(Path(self.temp.name).glob(".s5-download-*")), [])

    def test_probe_does_not_auth_or_write(self):
        args = s5.build_parser().parse_args(["probe"])
        with contextlib.redirect_stdout(io.StringIO()):
            s5.probe(self.camera, args)
        paths = [request["path"] for request in self.mock.requests]
        self.assertTrue(paths)
        self.assertFalse(any("accctrl" in path or "camcmd" in path or "setsetting" in path for path in paths))

    def test_explicit_gen2_and_session_are_bound_to_selected_camera(self):
        profile = Path(self.temp.name) / "profile.json"
        s5.json_write(profile, {"camera_ip": "127.0.0.1", "verified_model": "DC-S5", "challenge_order": "big",
                               "value_words": ["01010101"], "value2_words": ["02020202"]})
        args = s5.build_parser().parse_args(["auth", "--flow", "gen2", "--gen2-profile", str(profile)])
        with contextlib.redirect_stdout(io.StringIO()):
            s5.auth(self.camera, args)
        auth_paths = [request["path"] for request in self.mock.requests if "mode=accctrl" in request["path"]]
        self.assertEqual(len(auth_paths), 2)
        self.assertIn("type=req_acc_g", auth_paths[0])
        self.assertIn("type=req_acc_e", auth_paths[1])
        self.assertEqual(self.camera.session, "PRIVATE-MOCK-TOKEN")
        other = s5.Camera("127.0.0.2", 0.05, self.run, self.mock.port)
        self.assertIsNone(other.session)

    def test_cyclic_container_refuses_complete_baseline(self):
        payload = soap("<DIDL-Lite><container id='0' parentID='0'/></DIDL-Lite>")
        with mock.patch.object(self.camera, "request", return_value=(payload, {})), self.assertRaises(s5.FieldError) as caught:
            s5.read_catalog(self.camera, self.mock.base + "/Server0/CDS_control")
        self.assertEqual(caught.exception.code, s5.AMBIGUOUS)

    def test_stream_stalls_during_intent_write_capture_is_blocked(self):
        args = s5.build_parser().parse_args(["shoot", "--yes", "--prebuffer-seconds", "3.2", "--port", "0", "--post-seconds", "0"])
        original_write = s5.json_write

        def stalled_write(path, value):
            original_write(path, value)
            if Path(path).name == "shoot.json" and value.get("status", "").startswith("dispatch intent"):
                self.mock.stop_stream()
                time.sleep(0.65)

        with mock.patch.object(s5, "json_write", side_effect=stalled_write), contextlib.redirect_stdout(io.StringIO()):
            with self.assertRaises(s5.FieldError) as caught:
                s5.shoot(self.camera, args)
        self.assertEqual(caught.exception.code, s5.GATE)
        self.assertEqual(self.mock.capture_count, 0)
        self.assertEqual(s5.json_read(Path(self.temp.name) / "shoot.json")["capture_dispatches"], 0)


def tcp_frame(source, sport, destination, dport, sequence, payload):
    import ipaddress
    tcp = struct.pack(">HHIIBBHHH", sport, dport, sequence, 0, 0x50, 0x18, 65535, 0, 0) + payload
    ip = struct.pack(">BBHHHBBH", 0x45, 0, 20 + len(tcp), 0, 0, 64, 6, 0)
    ip += ipaddress.IPv4Address(source).packed + ipaddress.IPv4Address(destination).packed
    return b"\x00" * 12 + b"\x08\x00" + ip + tcp


def pcap_fixture(frames):
    data = struct.pack("<IHHIIII", 0xa1b2c3d4, 2, 4, 0, 0, 65535, 1)
    for frame in frames:
        data += struct.pack("<IIII", 1, 0, len(frame), len(frame)) + frame
    return data


def pcapng_fixture(frames):
    def block(kind, body):
        body += b"\0" * ((-len(body)) % 4)
        size = len(body) + 12
        return struct.pack("<II", kind, size) + body + struct.pack("<I", size)
    data = block(0x0a0d0d0a, struct.pack("<IHHq", 0x1a2b3c4d, 1, 0, -1))
    data += block(1, struct.pack("<HHI", 1, 0, 65535))
    for frame in frames:
        data += block(6, struct.pack("<IIIII", 0, 0, 1, len(frame), len(frame)) + frame)
    return data


class PcapTests(unittest.TestCase):
    def test_optional_tshark_uses_supported_header_field(self):
        request_body = s5.browse_body("0", 0, 20).hex()
        response_body = soap(didl(resource("CAM_ORG"))).hex()
        request_lines = 'Content-Type: text/xml\\r\\n|SOAPAction: "%s#Browse"\\r\\n' % s5.CDS
        rows = ["\t".join(["1", "0", "POST", "http://127.0.0.1/Server0/CDS_control", "", "", request_body, request_lines]),
                "\t".join(["2", "0", "", "", "200", "1", response_body, ""])]
        completed = subprocess.CompletedProcess([], 0, ("\n".join(rows) + "\n").encode(), b"")
        with mock.patch.object(pcap.shutil, "which", return_value="fixture-tshark"), mock.patch.object(pcap.subprocess, "run", return_value=completed) as invoke:
            summary = pcap.tshark_summary("fixture.pcap", "127.0.0.1")
        self.assertEqual(summary["pairs"][0]["browse"]["number_returned"], 1)
        self.assertIn("http.request.line", invoke.call_args[0][0])
        self.assertNotIn("http.soapaction", invoke.call_args[0][0])

    def test_http_pairs_pcap_and_pcapng_redacted_auth(self):
        request = b"GET /cam.cgi?mode=accctrl&type=req_acc_e&value=SECRET&value2=SECRET2 HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n"
        body = b"ok,Fixture,remote,open,PRIVATE-TOKEN"
        response = b"HTTP/1.1 200 OK\r\nContent-Length: " + str(len(body)).encode() + b"\r\n\r\n" + body
        frames = [tcp_frame("127.0.0.2", 12345, "127.0.0.1", 80, 10, request[:30]),
                  tcp_frame("127.0.0.2", 12345, "127.0.0.1", 80, 40, request[30:]),
                  tcp_frame("127.0.0.1", 80, "127.0.0.2", 12345, 99, response)]
        for constructor in (pcap_fixture, pcapng_fixture):
            with tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / "capture.pcap"
                path.write_bytes(constructor(frames))
                summary = pcap.builtin_summary(path, "127.0.0.1")
                self.assertEqual(summary["pairs"][0]["protocol_result"], "ok")
                self.assertEqual(summary["pairs"][0]["http_status"], 200)
                text = json.dumps(summary)
                for secret in ("SECRET", "SECRET2", "PRIVATE-TOKEN"):
                    self.assertNotIn(secret, text)

    def test_retransmission_gap_and_conflict(self):
        self.assertEqual(pcap.reassemble([(10, 1, b"abc"), (10, 2, b"abc"), (13, 3, b"def")]), (b"abcdef", None))
        self.assertIsNotNone(pcap.reassemble([(10, 1, b"abc"), (14, 2, b"def")])[1])
        self.assertEqual(pcap.reassemble([(10, 1, b"abc"), (11, 2, b"XXX")])[0], b"")

    def test_chunked_protocol_error(self):
        body = b"<camrply><result>err-busy</result></camrply>"
        chunked = b"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\n\r\n" + ("%x\r\n" % len(body)).encode() + body + b"\r\n0\r\n\r\n"
        messages = pcap.http_messages(chunked)
        pair = pcap.summarize_pair({"start": "GET /cam.cgi?mode=getstate HTTP/1.1", "headers": {}, "body": b""}, messages[0])
        self.assertEqual(pair["protocol_result"], "err-busy")

    def test_soap_call_summary_has_counts_and_flags(self):
        response = {"status": 200, "headers": {}, "body": soap(didl(resource("CAM_ORG")))}
        request = {"start": "POST /Server0/CDS_control HTTP/1.1", "headers": {"soapaction": '"%s#Browse"' % s5.CDS}, "body": s5.browse_body("0", 0, 20)}
        item = pcap.summarize_pair(request, response)
        self.assertEqual(item["soap_calls"], ["Browse"])
        self.assertEqual(item["browse"]["resource_flags"], ["CAM_ORG"])

    def test_truncated_capture_fails_clearly(self):
        with self.assertRaises(pcap.s5.FieldError):
            list(pcap.packets(pcap_fixture([b"packet"])[:-1]))


if __name__ == "__main__":
    unittest.main()
