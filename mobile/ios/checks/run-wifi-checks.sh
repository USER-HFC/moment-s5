#!/usr/bin/env bash
# Compiles the iOS Wi-Fi protocol parser for macOS and runs the vectors shared with tests/WifiS5Checks.java.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
out="${TMPDIR:-/tmp}/moment-wifi-checks"
mkdir -p "$out"
xcrun swiftc -O -o "$out/wifi-checks" "$here/../MomentS5RN76/Lumix/WifiProtocol.swift" "$here/main.swift"
"$out/wifi-checks" "$here/../../../tests/fixtures/s5-wifi"
