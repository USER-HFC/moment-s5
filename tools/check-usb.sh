#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
compiler="${JAVA_HOME:+$JAVA_HOME/bin/}javac"
runtime="${JAVA_HOME:+$JAVA_HOME/bin/}java"
source_dir=app/src/main/java/cn/moment/lumix
mkdir -p build/usb-checks
"$compiler" -encoding UTF-8 -d build/usb-checks tests/android-stubs/android/hardware/usb/*.java tests/android-stubs/android/os/SystemClock.java "$source_dir/Ptp.java" "$source_dir/UsbS5.java" tests/UsbPtpChecks.java
"$runtime" -cp build/usb-checks cn.moment.lumix.UsbPtpChecks
