#!/usr/bin/env python3
"""Run the actual isolated CLI end to end against loopback; save public evidence."""
import argparse
import datetime
import importlib.util
import json
from pathlib import Path
import subprocess
import sys

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("mock_camera", HERE / "mock_camera.py")
mock_camera = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mock_camera)
s5 = mock_camera.s5


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--evidence", default="evidence/s5-wifi-mock")
    parser.add_argument("--seconds", type=float, default=5)
    parser.add_argument("--framing", choices=("datagram", "sequence"), default="datagram")
    args = parser.parse_args()
    evidence = Path(args.evidence)
    evidence.mkdir(parents=True, exist_ok=True)
    run = Path("s5-field-runs") / ("mock-" + datetime.datetime.now().strftime("%Y%m%d-%H%M%S-%f"))
    run.mkdir(parents=True, mode=0o700)
    camera = mock_camera.MockCamera(framing=args.framing).start()
    results, transcript = [], []
    base = [sys.executable, "-I", str(HERE / "s5wifi.py"), "--camera-ip", "127.0.0.1",
            "--http-port", str(camera.port), "--timeout", "2", "--out", str(run)]
    framing = (["--framing", "sequence", "--header-bytes", "2", "--sequence-offset", "0"]
               if args.framing == "sequence" else [])

    def execute(arguments):
        command = base + arguments
        completed = subprocess.run(command, capture_output=True, text=True, timeout=60)
        result = {"command": arguments, "exit_code": completed.returncode}
        results.append(result)
        transcript.append("$ python3 -I tools/s5-wifi/s5wifi.py [loopback options] " + " ".join(arguments)
                          + "\nexit=" + str(completed.returncode) + "\n" + completed.stdout + completed.stderr)
        print(arguments[0] + ": " + str(completed.returncode), flush=True)
        if completed.returncode:
            raise RuntimeError(arguments[0] + " failed: " + completed.stderr)

    try:
        execute(["discover", "--ssdp-port", str(camera.ssdp_port), "--ssdp-seconds", "0.2"])
        execute(["auth", "--flow", "legacy"])
        execute(["probe"])
        execute(["liveview", "--seconds", str(args.seconds), "--port", "0"] + framing)
        execute(["catalog", "--page-size", "1"])
        execute(["shoot", "--yes", "--baseline", str(run / "baseline.json"), "--download", "--prebuffer-seconds", str(args.seconds),
                 "--post-seconds", "0.2", "--port", "0", "--settle-seconds", "0.2", "--poll-interval", "0.1"] + framing)
        if camera.capture_count != 1:
            raise RuntimeError("Mock observed %d captures, expected exactly one" % camera.capture_count)
        sd = run / "sd-copy.jpg"
        sd.write_bytes(camera.photos["fixture-0001"])
        execute(["verify", "--sd", str(sd), "--phone", str(run / "phone-original.jpg")])
        execute(["report", "--source", str(run), "--report-to", str(evidence / "REPORT.redacted.md")])
        manifest = s5.json_read(run / "prebuffer" / "manifest.json")
        if not manifest["frames"] or not all(frame["relative_to_capture_ms"] < 0 for frame in manifest["frames"]):
            raise RuntimeError("Prebuffer contains no frames or a post-shutter frame")
        summary = {"mock_only": True, "physical_camera_tested": False, "passed": True, "python": sys.version.split()[0],
                   "framing": args.framing, "capture_count": camera.capture_count, "commands": results,
                   "prebuffer_frames": len(manifest["frames"]), "pre_only": True,
                   "liveview_gate": s5.json_read(run / "liveview.json")["last_3s_gate"],
                   "sd_byte_match": s5.json_read(run / "verify.json")["passed"], "recorded_utc": s5.utc_now()}
        s5.json_write(evidence / "smoke-summary.json", s5.redact(summary))
        (evidence / "smoke-output.redacted.txt").write_text("\n\n".join(transcript), encoding="utf-8")
        print("PASS: loopback smoke; redacted evidence in " + str(evidence))
        return 0
    except (RuntimeError, subprocess.TimeoutExpired, s5.FieldError) as exc:
        s5.json_write(evidence / "smoke-summary.json", {"mock_only": True, "passed": False, "error": str(exc), "commands": results})
        (evidence / "smoke-output.redacted.txt").write_text("\n\n".join(transcript), encoding="utf-8")
        print("FAIL: " + str(exc), file=sys.stderr)
        return 1
    finally:
        camera.close()


if __name__ == "__main__":
    sys.exit(main())
