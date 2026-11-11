#!/usr/bin/env bash
# Compiles the iOS USB transport (PTP parsing and photo pairing) for macOS and drives it with a fake Lumix.
# ImageCaptureCore itself is not involved: UsbDevices.swift needs a real iPhone and camera.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
src="$here/../MomentS5RN76/Lumix"
out="${TMPDIR:-/tmp}/moment-usb-checks"
mkdir -p "$out"
xcrun swiftc -O -o "$out/usb-checks" "$src/CameraTransport.swift" "$src/UsbPtp.swift" "$src/UsbTransport.swift" "$here/usb/main.swift"
"$out/usb-checks"
