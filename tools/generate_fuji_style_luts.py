#!/usr/bin/env python3
"""Generate original SDR Fuji-style approximations; no vendor LUTs or profiles.

Python 3.9+, standard library only. Run from any directory; --check compares the
bundled assets and Java catalog byte-for-byte without writing anything.
The math operates on display-encoded sRGB / Rec.709 RGB, not linear RGB or log.
"""

import argparse
import colorsys
import hashlib
import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "mobile/android/app/src/main/assets/luts"
CATALOG = ROOT / "mobile/android/app/src/main/java/cn/moment/lumix/BuiltInLutCatalog.java"
SIZE = 33
AUTHOR = "USER-HFC and Moment S5 contributors"
SOURCE = "tools/generate_fuji_style_luts.py"

# These are hand-authored artistic choices, not measured camera matching data.
# Hue bands are centered on red, yellow, green, cyan, blue and magenta (degrees).
# Their triangular weights overlap smoothly; neutral colors have no hue shift.
RECIPES = [
    dict(slug="provia-standard", label="Provia / Standard", contrast=0.22,
         saturation=1.06, black=0.0, white=1.0),
    dict(slug="velvia", label="Velvia", contrast=0.85, saturation=1.28,
         black=0.0, white=1.0, hue_saturation=[1.03, 1.0, 1.10, 1.0, 1.08, 1.0],
         hue_shift=[0.0, -2.0, -3.0, 0.0, 2.0, 0.0]),
    dict(slug="astia", label="Astia", contrast=0.08, saturation=1.01,
         black=0.006, white=0.985, hue_saturation=[0.98, 0.97, 1.0, 1.0, 1.0, 1.0],
         highlights=[0.006, 0.002, -0.004]),
    dict(slug="classic-chrome", label="Classic Chrome", contrast=0.58,
         saturation=0.76, black=0.012, white=0.987,
         hue_saturation=[1.09, 0.90, 0.92, 0.98, 0.92, 0.90],
         hue_shift=[0.0, -3.0, 6.0, 2.0, -6.0, 0.0],
         shadows=[-0.008, 0.001, 0.012], highlights=[0.012, 0.003, -0.008]),
    dict(slug="classic-negative", label="Classic Negative", contrast=0.90,
         saturation=0.86, black=0.008, white=0.985,
         hue_saturation=[1.12, 0.91, 0.88, 0.94, 0.95, 0.95],
         hue_shift=[-2.0, -5.0, 10.0, 3.0, -3.0, 0.0],
         shadows=[-0.014, 0.010, 0.006], highlights=[0.018, 0.001, -0.015]),
    dict(slug="eterna", label="Eterna", contrast=-0.25, saturation=0.73,
         black=0.025, white=0.955,
         shadows=[-0.006, 0.004, 0.010], highlights=[0.008, 0.002, -0.006]),
    dict(slug="acros", label="Acros", contrast=0.95, saturation=0.0,
         black=0.004, white=0.997, monochrome=[0.25, 0.65, 0.10]),
    dict(slug="pro-neg-standard", label="Pro Neg.Std", contrast=-0.08,
         saturation=0.91, black=0.006, white=0.992,
         hue_saturation=[0.99, 0.98, 1.0, 1.0, 1.0, 1.0],
         highlights=[0.004, 0.001, -0.003]),
]


def clamp(value):
    return max(0.0, min(1.0, value))


def tone(value, recipe):
    # Endpoint-preserving cubic S curve; these strengths keep it monotonic.
    curved = value + recipe["contrast"] * value * (1 - value) * (2 * value - 1)
    return recipe["black"] + (recipe["white"] - recipe["black"]) * curved


def hue_weights(hue):
    angle = hue * 360.0
    return [max(0.0, 1 - abs((angle - center + 180) % 360 - 180) / 60)
            for center in range(0, 360, 60)]


def transform(rgb, recipe):
    if "monochrome" in recipe:
        gray = tone(sum(c * w for c, w in zip(rgb, recipe["monochrome"])), recipe)
        return (gray, gray, gray)
    hue, saturation, value = colorsys.rgb_to_hsv(*rgb)
    weights = hue_weights(hue)
    hue += sum(w * shift for w, shift in zip(weights, recipe.get("hue_shift", [0] * 6))) * saturation / 360
    saturation *= recipe["saturation"] * sum(
        w * scale for w, scale in zip(weights, recipe.get("hue_saturation", [1] * 6)))
    # Saturation is capped before RGB conversion to prevent out-of-gamut nodes.
    colored = colorsys.hsv_to_rgb(hue % 1.0, clamp(saturation), value)
    curved = tuple(tone(c, recipe) for c in colored)
    # Display-encoded brightness only guides the tint, not a scene luminance.
    brightness = sum(c * w for c, w in zip(curved, (0.2126, 0.7152, 0.0722)))
    shadow_weight = 4 * brightness * (1 - brightness) ** 2
    highlight_weight = 4 * brightness ** 2 * (1 - brightness)
    return tuple(clamp(c + shadow_weight * shadow + highlight_weight * highlight)
                 for c, shadow, highlight in zip(curved, recipe.get("shadows", [0] * 3),
                                                 recipe.get("highlights", [0] * 3)))


def cube(recipe):
    title = "Fuji 风格 · " + recipe["label"]
    lines = [
        "# Original, unofficial artistic approximation; not a Fujifilm LUT.",
        "# Input/output: display-encoded SDR sRGB / Rec.709 RGB, full range [0,1].",
        "# No log conversion, grain, halation or camera calibration is included.",
        "# Copyright (c) 2026 " + AUTHOR + "; SPDX-License-Identifier: MIT",
        "# Source: " + SOURCE,
        'TITLE "' + title + '"',
        "LUT_3D_SIZE 33", "DOMAIN_MIN 0 0 0", "DOMAIN_MAX 1 1 1",
    ]
    # .cube / LutEngine enumeration: red fastest, then green, then blue.
    for blue in range(SIZE):
        for green in range(SIZE):
            for red in range(SIZE):
                rgb = transform(tuple(c / (SIZE - 1) for c in (red, green, blue)), recipe)
                lines.append(" ".join(f"{c:.6f}" for c in rgb))
    return ("\n".join(lines) + "\n").encode("utf-8")


def java_catalog(presets):
    entries = []
    for preset in presets:
        quote = lambda value: json.dumps(value, ensure_ascii=False)
        entries.append("        new Entry(" + ", ".join([
            quote(preset["id"]), quote(preset["name"]), quote(preset["file"]),
            str(preset["bytes"]) + "L", quote(preset["sha256"]),
        ]) + ")")
    source = """package cn.moment.lumix;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;

/** Generated by tools/generate_fuji_style_luts.py; do not edit by hand. MIT. */
public final class BuiltInLutCatalog {
    public static final String ID_PREFIX = "builtin:";
    public static final class Entry {
        public final String id, name, assetName, sha256;
        public final long bytes;
        private Entry(String id, String name, String assetName, long bytes, String sha256) {
            this.id = id; this.name = name; this.assetName = assetName; this.bytes = bytes; this.sha256 = sha256;
        }
    }
    public static final List<Entry> ENTRIES = Collections.unmodifiableList(Arrays.asList(
%s
    ));
    private BuiltInLutCatalog() {}
    public static boolean isBuiltIn(String id) { return id != null && id.startsWith(ID_PREFIX); }
    public static Entry find(String id) {
        for (Entry entry : ENTRIES) if (entry.id.equals(id)) return entry;
        return null;
    }
}
""" % ",\n".join(entries)
    return source.encode("utf-8")


def outputs():
    files, presets = {}, []
    for recipe in RECIPES:
        filename = "fuji-style-" + recipe["slug"] + ".cube"
        data = cube(recipe)
        files[ASSETS / filename] = data
        presets.append(dict(id="builtin:" + recipe["slug"], name="Fuji 风格 · " + recipe["label"],
                            file=filename, gridSize=SIZE, bytes=len(data),
                            sha256=hashlib.sha256(data).hexdigest(), builtIn=True, readOnly=True))
    manifest = dict(schema=1, author=AUTHOR, license="MIT", licenseFile="LICENSE.txt", source=SOURCE,
                    generatorSha256=hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
                    input="display-encoded SDR sRGB / Rec.709 RGB, full range [0,1]",
                    unofficial=True, calibrated=False, recipes=RECIPES, presets=presets)
    files[ASSETS / "manifest.json"] = (json.dumps(manifest, ensure_ascii=False, indent=2) + "\n").encode("utf-8")
    files[ASSETS / "LICENSE.txt"] = (ROOT / "third_party/fuji-style-LICENSE.txt").read_bytes()
    files[CATALOG] = java_catalog(presets)
    return files


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="verify committed outputs without writing")
    args = parser.parse_args()
    files = outputs()
    if args.check:
        mismatches = [str(path.relative_to(ROOT)) for path, data in files.items()
                      if not path.is_file() or path.read_bytes() != data]
        expected_cubes = {path.name for path in files if path.suffix == ".cube"}
        mismatches += [str(path.relative_to(ROOT)) for path in ASSETS.glob("*.cube")
                       if path.name not in expected_cubes]
        if mismatches:
            parser.exit(1, "LUT outputs differ; regenerate:\n" + "\n".join(mismatches) + "\n")
    else:
        for path, data in files.items():
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)
    total = sum(len(data) for path, data in files.items() if path.parent == ASSETS)
    print(f"{'Verified' if args.check else 'Generated'} {len(RECIPES)} original 33-grid LUTs ({total:,} asset bytes)")


if __name__ == "__main__":
    main()
