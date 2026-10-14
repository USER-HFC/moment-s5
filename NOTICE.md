# Third-party attribution

The Panasonic PTP constants, command sequences, property layouts, and live-view header interpretation in `UsbS5.java` / `Ptp.java` were adapted from **tethr** by Baku Hashimoto.

Source: https://github.com/baku89/tethr
Pinned reference: `53a51329d7bb9b8386912e9b7719e2d1c09ea4f2`.
Adaptations: native Android USB transport, bounded parsing, event subscription before capture, no firmware commands, no automatic session reset, no file deletion, deadline-based transactions, independent photo transfer and preview window.

The MIT License (MIT)

Copyright (c) 2021 Baku Hashimoto

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

Motion Photo serialization follows Google's public specification: https://developer.android.com/media/platform/motion-photo-format . This project includes no Panasonic SDK DLLs, firmware, fonts, or cloud services. Android SDK/Gradle are build tools and are not shipped inside the app.

## Gradle Wrapper

The repository includes the generated Gradle 8.9 wrapper scripts and wrapper JAR for reproducible builds. These are distributed under Apache License 2.0, independently of this project's MIT license. A copy is included at `third_party/gradle-LICENSE.txt`.

Copyright 2015 the original author or authors (wrapper scripts).
Source: https://github.com/gradle/gradle/tree/v8.9.0

## Built-in Fuji-style LUT approximations

The eight `.cube` assets in `mobile/android/app/src/main/assets/luts/` are **original, unofficial artistic approximations** by USER-HFC and Moment S5 contributors, licensed under MIT. They contain no Fujifilm official LUTs, camera profiles, or data copied from third-party LUT collections. Their names describe an intended style, not a calibrated match to a Fujifilm camera.

| Asset | Display name | Source / license |
| --- | --- | --- |
| `fuji-style-provia-standard.cube` | Fuji 风格 · Provia / Standard | Original generator / MIT |
| `fuji-style-velvia.cube` | Fuji 风格 · Velvia | Original generator / MIT |
| `fuji-style-astia.cube` | Fuji 风格 · Astia | Original generator / MIT |
| `fuji-style-classic-chrome.cube` | Fuji 风格 · Classic Chrome | Original generator / MIT |
| `fuji-style-classic-negative.cube` | Fuji 风格 · Classic Negative | Original generator / MIT |
| `fuji-style-eterna.cube` | Fuji 风格 · Eterna | Original generator / MIT |
| `fuji-style-acros.cube` | Fuji 风格 · Acros | Original generator / MIT |
| `fuji-style-pro-neg-standard.cube` | Fuji 风格 · Pro Neg.Std | Original generator / MIT |

Repository: https://github.com/USER-HFC/moment-s5 . Reproducible source: [`tools/generate_fuji_style_luts.py`](tools/generate_fuji_style_luts.py). The bundled `manifest.json` records every recipe, the generator SHA-256 and each asset SHA-256. License: [`third_party/fuji-style-LICENSE.txt`](third_party/fuji-style-LICENSE.txt), also copied into the APK's `luts/LICENSE.txt`. The reviewed external repositories and rejection reasons are recorded in [`third_party/fuji-style-SOURCES.txt`](third_party/fuji-style-SOURCES.txt); none of their code or assets is bundled.

Input/output is full-range, display-encoded **SDR sRGB / Rec.709 RGB**, intended for normal JPEG/preview images with a standard camera photo style. These are artistic look transforms operating on encoded values, not a conversion between the differing sRGB and Rec.709 transfer functions. They do not convert V-Log, F-Log, HDR or RAW, and do not simulate grain, halation or spatial effects. `original.jpg` remains the camera's untouched JPEG; the look applies to live view and `rendered.jpg` through the existing LUT pipeline.

FUJIFILM and the film-simulation names are trademarks of their respective owners. This project and these presets are not affiliated with, endorsed by, or produced by Fujifilm.

Regenerate: `python3 tools/generate_fuji_style_luts.py`; verify generated outputs: `python3 tools/generate_fuji_style_luts.py --check`. Run the production parser/interpolation and pixel-loop checks with a JDK using `python3 tools/check_bundled_luts.py` (or `--java-home /path/to/jdk`). The host check uses test-only Android graphics substitutes backed by ImageIO, including immutable decoded bitmaps; it does not exercise Android codecs or device behavior.

## Experimental Wi-Fi implementation

`CameraTransport`, `UsbS5Transport`, `WifiCameraHttp`, `WifiS5Protocol`, `WifiS5Transport`, the Android network manager, connection components and Wi-Fi test fixtures are independently authored for this repository under its MIT license. Protocol facts and validation boundaries are documented in `docs/research/wireless-connection.md`; no GPL or unlicensed implementation or camera packet capture was copied. The host JPEG fixtures and emulator media are generated by this repository's own mock encoder, not a camera image or third-party asset. Original DC-S5 firmware 2.9 remains unverified.
