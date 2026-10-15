#!/usr/bin/env python3
"""Loopback-only fixture adapter for release APK smoke tests, never a real S5.

Serves cam.cgi on 18080 and the same mock's DLNA handler on 60606. On a rooted
test AVD only, use adb reverse for 18080 / 60606 and redirect 10.0.2.2's
80 / 18080 / 60606 connections to those local listeners with iptables.
This avoids a privileged host listener while the release UI uses a plain IP.
The fixture
description declares DC-S5 to exercise the production model gate; manufacturer,
firmware, original EXIF and saved state still identify a self-authored mock.
No app endpoint, authentication, network-binding or debug guard is bypassed.
"""
import argparse
import importlib.util
import json
from pathlib import Path
import threading

spec = importlib.util.spec_from_file_location("mock_camera", Path(__file__).with_name("mock_camera.py"))
mock = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mock)


class ReleaseFixture(mock.MockCamera):
    def description(self):
        return super().description().replace("<modelName>MOCK-DC-S5</modelName>", "<modelName>DC-S5</modelName>")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()
    output = Path(args.out)
    output.mkdir(parents=True, exist_ok=True, mode=0o700)
    camera = ReleaseFixture(http_port=18080, ssdp_port=11988, advertise_host="10.0.2.2")
    try:
        dlna = mock.ThreadingHTTPServer(("127.0.0.1", 60606), camera.handler())
    except BaseException:
        camera.server.server_close()
        camera.ssdp.close()
        raise
    dlna_thread = threading.Thread(target=dlna.serve_forever, daemon=True)
    camera.start()
    dlna_thread.start()
    print(json.dumps({"mock_only": True, "release_fixture": True, "base": camera.base,
                      "dlna_port": 60606, "description_model": "DC-S5"}), flush=True)
    try:
        while not camera.quit.wait(.2):
            pass
    except KeyboardInterrupt:
        pass
    finally:
        camera.close()
        dlna.shutdown()
        dlna.server_close()
        dlna_thread.join(timeout=2)
        for name, data in camera.photos.items():
            (output / (name + ".JPG")).write_bytes(data)
        mock.s5.json_write(output / "mock-state.json", {
            "mock_only": True, "release_fixture": True, "description_model": "DC-S5",
            "capture_count": camera.capture_count, "capture_paths": camera.capture_paths,
            "requests": camera.requests,
        })


if __name__ == "__main__":
    main()
