#!/usr/bin/env python3
"""Verify self-authored mock E2E media without claiming real-camera compatibility."""
import argparse
import hashlib
import importlib.util
import json
from pathlib import Path
import struct


def boxes(data, start=0, end=None):
    end = len(data) if end is None else end
    while start < end:
        assert start + 8 <= end, "Truncated MP4 box"
        length, kind = struct.unpack_from(">I4s", data, start)
        header = 8
        if length == 1:
            length = struct.unpack_from(">Q", data, start + 8)[0]
            header = 16
        if length == 0:
            length = end - start
        assert length >= header and start + length <= end, "Invalid MP4 box size"
        yield kind, start + header, start + length
        start += length


def child(data, parent, kind):
    matches = [box for box in boxes(data, parent[1], parent[2]) if box[0] == kind]
    assert len(matches) == 1, "Expected one " + kind.decode("ascii")
    return matches[0]


def verify(media, mock_run):
    spec = importlib.util.spec_from_file_location("s5wifi", Path(__file__).with_name("s5wifi.py"))
    s5 = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(s5)
    meta = json.loads((media / "moment.json").read_text())
    state = json.loads((mock_run / "mock-state.json").read_text())
    assert state["mock_only"] and state["capture_count"] == 1 and len(state["capture_paths"]) == 1
    assert meta["complete"] and meta["demo"] is False and meta["experimentalWifi"]
    assert meta["transport"] == "wifi" and meta["captureMode"] == "pre-only" and meta["hasPostFrames"] is False
    assert meta["durationUs"] == 3_000_000 and meta["maxGapMs"] <= 500
    original = (media / "original.jpg").read_bytes()
    assert original == (mock_run / meta["source"]).read_bytes(), "Original differs from mock SD bytes"
    dimensions = s5.jpeg_dimensions(original)
    video = (media / "motion.mp4").read_bytes()
    motion = (media / "MOMENT_MP.jpg").read_bytes()
    assert motion[:4] == b"\xff\xd8\xff\xe1" and motion.endswith(video)
    segment_length = int.from_bytes(motion[4:6], "big")
    assert motion[:2] + motion[4 + segment_length:-len(video)] == original, "Primary JPEG changed"
    xmp = motion[6:4 + segment_length]
    assert ('Item:Length="%d"' % len(video)).encode() in xmp
    assert ('Camera:MotionPhotoPresentationTimestampUs="%d"' % meta["stillUs"]).encode() in xmp
    root = (b"root", 0, len(video))
    moov = child(video, root, b"moov")
    mdia = child(video, child(video, moov, b"trak"), b"mdia")
    mdhd = child(video, mdia, b"mdhd")
    offset = mdhd[1]
    if video[offset] == 0:
        timescale, duration = struct.unpack_from(">II", video, offset + 12)
    else:
        timescale = struct.unpack_from(">I", video, offset + 20)[0]
        duration = struct.unpack_from(">Q", video, offset + 24)[0]
    stbl = child(video, child(video, mdia, b"minf"), b"stbl")
    stsd = child(video, stbl, b"stsd")
    entry = next(boxes(video, stsd[1] + 8, stsd[2]))
    assert entry[0] == b"avc1", "Expected AVC video"
    width, height = struct.unpack_from(">HH", video, entry[1] + 24)
    stts = child(video, stbl, b"stts")
    count = struct.unpack_from(">I", video, stts[1] + 4)[0]
    samples = sum(struct.unpack_from(">II", video, stts[1] + 8 + i * 8)[0] for i in range(count))
    assert abs(duration / timescale - 3.0) <= 0.1 and 0 <= meta["stillUs"] < 3_000_000
    exported = media / "system-export.jpg"
    assert exported.read_bytes() == motion, "System-album export differs"
    return {"mock_only": True, "capture_count": 1, "original_equals_mock_sd": True,
            "original_sha256": hashlib.sha256(original).hexdigest(), "original_dimensions": dimensions,
            "primary_jpeg_unchanged": True, "embedded_mp4_unchanged": True, "export_unchanged": True,
            "video_codec": "avc1", "video_width": width, "video_height": height,
            "video_samples": samples, "video_duration_seconds": duration / timescale,
            "pre_frames": meta["frames"], "max_gap_ms": meta["maxGapMs"], "still_us": meta["stillUs"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--media", type=Path, required=True)
    parser.add_argument("--mock-run", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    result = verify(args.media, args.mock_run)
    args.out.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
