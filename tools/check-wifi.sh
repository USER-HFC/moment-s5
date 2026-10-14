#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
compiler="${JAVA_HOME:+$JAVA_HOME/bin/}javac"
runtime="${JAVA_HOME:+$JAVA_HOME/bin/}java"
source_dir=app/src/main/java/cn/moment/lumix
mkdir -p build/wifi-checks
"$compiler" -encoding UTF-8 -d build/wifi-checks "$source_dir/CameraTransport.java" "$source_dir/WifiCameraHttp.java" "$source_dir/WifiS5Protocol.java" "$source_dir/WifiS5Transport.java" "$source_dir/FrameRing.java" tests/WifiS5Checks.java
"$runtime" -cp build/wifi-checks cn.moment.lumix.WifiS5Checks
