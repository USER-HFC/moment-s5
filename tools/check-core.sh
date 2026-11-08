#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p build/core-checks
compiler="${JAVA_HOME:+$JAVA_HOME/bin/}javac"
runtime="${JAVA_HOME:+$JAVA_HOME/bin/}java"
source_dir=app/src/main/java/cn/moment/lumix
"$compiler" -encoding UTF-8 -d build/core-checks "$source_dir/Ptp.java" "$source_dir/FrameRing.java" "$source_dir/MotionPhoto.java" "$source_dir/MomentDeletion.java" "$source_dir/LutImport.java" "$source_dir/MomentFacts.java" "$source_dir/JpegExif.java" "$source_dir/VolumeShutter.java" tests/CoreChecks.java tests/MomentDeletionChecks.java tests/LutImportChecks.java tests/VolumeShutterChecks.java
for suite in CoreChecks MomentDeletionChecks LutImportChecks VolumeShutterChecks; do
  "$runtime" -cp build/core-checks "cn.moment.lumix.$suite"
done
