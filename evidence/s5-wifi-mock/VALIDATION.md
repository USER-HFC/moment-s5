# Task G — DC-S5 Wi-Fi toolkit validation

The field toolkit is in [tools/s5-wifi](../../tools/s5-wifi/README.md); all implementation and fixtures are independently authored under the repository MIT license. No app code changed, no real camera was connected, and nothing was pushed.

Validation on this Mac with system Python 3.9.6:

- `python3 -I -m unittest discover tools/s5-wifi`: 41 tests pass; [output](unit-tests.txt).
- `python3 -I tools/s5-wifi/run_mock_smoke.py`: all eight CLI stages exit 0; [summary](smoke-summary.json), [redacted output](smoke-output.redacted.txt), [full redacted report](REPORT.redacted.md).
- The same end-to-end flow with `--framing sequence --header-bytes 2` passes; [summary](sequence-smoke-summary.json). This is the mock's measured framing, not an assertion about S5 packets.
- Each smoke observes exactly one server capture, saves a gated pre-shutter-only frame manifest, downloads one uniquely new original resource and verifies its bytes against the mock SD JPEG.
- Tests exercise HTTP-200 protocol errors, explicit gen2 CSV/session/profile handling, SOAP→DIDL parsing and recursive pagination, RAW/thumbnail/resource ambiguity, UDP JPEG validation and sequence loss, metric math, redaction, redirect/IP/command-URL confinement, incomplete-download cleanup, a timed-out capture without retry, and a stalled prebuffer that blocks capture.
- A self-authored sample JPEG was also decoded to PNG by macOS `sips`; no third-party image fixture is included.

The optional tshark adapter is covered with a self-authored subprocess fixture and documented Wireshark fields; tshark is not installed on this Mac. Stdlib pcap and pcapng parsing are tested without it.

Physical T1–T5 remain to be run by the owner. S5 2.9 gen2 response parameters must come from a verified local S5 profile/current response; no G9II constants are shipped. UDP fragmentation must be measured before choosing sequence framing. The toolkit measures pre-only acquisition and original-byte feasibility; Motion Photo encoding, sustained T6–T9 behavior and BLE writes are outside this task. The Chinese guide prepares official Sync Wi-Fi and Android HCI captures for T10.

After setting JPEG L, single capture, Auto Transfer OFF and Remote Shooting & View, join the camera AP (or use the same router) and run these first five commands individually, replacing the IP before command 2:

```sh
cd /Users/murder/orca/workspaces/moment-s5/scan-bugfix
export CAMERA_IP=192.168.54.1 RUN="$PWD/s5-field-runs/$(date +%Y%m%d-%H%M%S)"
python3 -I tools/s5-wifi/s5wifi.py --camera-ip "$CAMERA_IP" --out "$RUN" discover
python3 -I tools/s5-wifi/s5wifi.py --camera-ip "$CAMERA_IP" --out "$RUN" probe
python3 -I tools/s5-wifi/s5wifi.py --camera-ip "$CAMERA_IP" --out "$RUN" liveview --seconds 60 --port 49152
```

Stop on an access error and follow the guide's explicit authentication branch; no registration is automatically attempted. Then follow its catalog → confirmed single shoot → SD verify → report procedure. Share only a reviewed redacted report; raw captures, tokens, bugreports, GPS and real photos stay in gitignored private run directories.
