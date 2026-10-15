#!/usr/bin/env python3
"""Recheck this task's synthetic captures / exports and actual playback screenshots."""
import hashlib
import importlib.util
import json
from pathlib import Path
import struct

from PIL import Image, ImageChops, ImageStat

BASE = Path(__file__).resolve().parent
REPO = BASE.parents[1]


def module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    result = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(result)
    return result


still = module("still_checks", REPO / "tools/check_still_media.py")
mp4 = module("mp4_checks", REPO / "tools/s5-wifi/check_mock_motion.py")
still_result = still.verify(BASE / "still-lut-media")
(BASE / "still-lut-check.json").write_text(json.dumps(still_result, indent=2) + "\n")

media = BASE / "motion-media"
meta = json.loads((media / "moment.json").read_text())
assert meta["demo"] and meta["complete"] and meta["captureMode"] == "pre-only"
assert not meta["hasPostFrames"] and meta["durationUs"] == 3_000_000 and meta["maxGapMs"] <= 500
video = (media / "motion.mp4").read_bytes()
motion = (media / "MOMENT_MP.jpg").read_bytes()
original = (media / "original.jpg").read_bytes()
rendered = (media / "rendered.jpg").read_bytes()
assert (media / "original-camera.jpg").read_bytes() == original
assert meta["lutApplied"] and meta["lut"] == "Fuji 风格 · Classic Chrome"
assert motion[:4] == b"\xff\xd8\xff\xe1" and motion.endswith(video)
segment = int.from_bytes(motion[4:6], "big")
assert motion[:2] + motion[4 + segment:-len(video)] == rendered
assert (media / "system-export.jpg").read_bytes() == motion
assert ('Camera:MotionPhotoPresentationTimestampUs="%d"' % meta["stillUs"]).encode() in motion[6:4 + segment]
root = (b"root", 0, len(video))
moov = mp4.child(video, root, b"moov")
mdia = mp4.child(video, mp4.child(video, moov, b"trak"), b"mdia")
mdhd = mp4.child(video, mdia, b"mdhd")
assert video[mdhd[1]] == 0
timescale, duration = struct.unpack_from(">II", video, mdhd[1] + 12)
assert abs(duration / timescale - 3) < .1
stbl = mp4.child(video, mp4.child(video, mdia, b"minf"), b"stbl")
stsd = mp4.child(video, stbl, b"stsd")
entry = next(mp4.boxes(video, stsd[1] + 8, stsd[2]))
assert entry[0] == b"avc1"
width, height = struct.unpack_from(">HH", video, entry[1] + 24)
stts = mp4.child(video, stbl, b"stts")
count = struct.unpack_from(">I", video, stts[1] + 4)[0]
samples = sum(struct.unpack_from(">II", video, stts[1] + 8 + i * 8)[0] for i in range(count))
motion_result = {
    "fixture_only": True, "demo": True, "lut": meta["lut"], "capture_mode": "pre-only",
    "duration_seconds": duration / timescale, "codec": "avc1", "video_dimensions": [width, height],
    "samples": samples, "pre_frames": meta["frames"], "max_gap_ms": meta["maxGapMs"], "still_us": meta["stillUs"],
    "camera_original_preserved": True, "primary_matches_lut_rendered_jpeg": True,
    "embedded_video_unchanged": True, "system_export_exact": True,
    "motion_sha256": hashlib.sha256(motion).hexdigest(),
}
(BASE / "motion-check.json").write_text(json.dumps(motion_result, indent=2) + "\n")

# Compare only the photo/video area; headers and auto-hiding controls cannot cause a pass.
region = (0, 850, 1080, 1600)
with Image.open(BASE / "20a-motion-playing.png") as first, Image.open(BASE / "20b-motion-playing.png") as second:
    delta = ImageChops.difference(first.convert("RGB").crop(region), second.convert("RGB").crop(region))
    changed = sum(pixel != (0, 0, 0) for pixel in delta.getdata())
    assert changed > 1000
    playback_result = {"region": region, "changed_pixels": changed, "mean_rgb_delta": ImageStat.Stat(delta).mean, "different_during_hold": True}
(BASE / "playback-pixels.json").write_text(json.dumps(playback_result, indent=2) + "\n")
print(json.dumps({"still": still_result, "motion": motion_result, "playback": playback_result}, indent=2))
