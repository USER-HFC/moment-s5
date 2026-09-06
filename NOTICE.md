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
