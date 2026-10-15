#!/usr/bin/env python3
"""Check saved stills from DEMO or a self-authored mock, never real-camera proof.

Requires Pillow for decoded pixel comparison. Download/extract only this test
capture's directory and its MediaStore JPEG before running this check.
"""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageChops, ImageStat


def verify(media, source=None):
    meta = json.loads((media / "moment.json").read_text())
    assert meta["complete"] and meta["captureMode"] == "photo" and meta["mediaType"] == "photo"
    assert meta["frames"] == 0 and meta["durationUs"] == 0 and not meta["audio"] and not meta["hasPostFrames"]
    assert not any(p.suffix == ".mp4" or p.name == "MOMENT_MP.jpg" or p.name.endswith(".part") for p in media.iterdir()), "Still created video/partial files"
    original = (media / "original.jpg").read_bytes()
    if source is not None:
        assert original == source.read_bytes(), "Original differs from self-authored mock SD JPEG"
        assert meta["transport"] == "wifi" and meta["experimentalWifi"] and not meta["demo"]
    else:
        assert meta["demo"] and meta["transport"] == "demo", "A non-demo capture needs explicit source bytes"
    with Image.open(media / "original.jpg") as image:
        image.load()
        original_pixels = image.convert("RGB")
    rendered = meta["lutApplied"]
    derivative = media / ("rendered.jpg" if rendered else "original.jpg")
    with Image.open(derivative) as image:
        image.load()
        result_pixels = image.convert("RGB")
    assert original_pixels.size == result_pixels.size, "LUT derivative changed dimensions"
    delta = ImageStat.Stat(ImageChops.difference(original_pixels, result_pixels)).mean
    if rendered:
        assert meta["lutRequested"] == meta["lut"] and meta["lut"]
        assert max(delta) > 0.5, "Selected nonidentity test LUT made no visible pixel change"
    else:
        assert meta["lutRequested"] is None and meta["lut"] is None
        assert not (media / "rendered.jpg").exists(), "No-LUT still unexpectedly has a derivative"
        assert delta == [0, 0, 0]
    assert (media / "system-export.jpg").read_bytes() == derivative.read_bytes(), "MediaStore JPEG differs from selected still"
    return {
        "fixture_only": True, "mode": "photo", "demo": meta["demo"], "transport": meta["transport"],
        "lut": meta["lut"], "original_dimensions": original_pixels.size,
        "original_sha256": hashlib.sha256(original).hexdigest(),
        "export_sha256": hashlib.sha256(derivative.read_bytes()).hexdigest(),
        "original_equals_mock_sd": source is not None, "mean_pixel_delta_rgb": delta,
        "export_exact": True, "no_video_or_motion_container": True,
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--media", type=Path, required=True)
    parser.add_argument("--source", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    result = verify(args.media, args.source)
    args.out.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
