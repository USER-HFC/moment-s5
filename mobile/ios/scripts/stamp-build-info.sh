#!/bin/sh
# Stamps the built Info.plist with the same version as the Android app, plus build time and commit,
# so About and the diagnostics header read the same on both platforms. Runs as the last build phase.
set -eu

PLIST="${TARGET_BUILD_DIR}/${INFOPLIST_PATH}"
GRADLE="${SRCROOT}/../android/app/build.gradle"
BUDDY=/usr/libexec/PlistBuddy

name=$(sed -n 's/^[[:space:]]*versionName[[:space:]]*"\(.*\)".*/\1/p' "$GRADLE" | head -n 1)
code=$(sed -n 's/^[[:space:]]*versionCode[[:space:]]*\([0-9][0-9]*\).*/\1/p' "$GRADLE" | head -n 1)
if [ -z "$name" ] || [ -z "$code" ]; then
  echo "error: versionName or versionCode not found in $GRADLE" >&2
  exit 1
fi
# CFBundleShortVersionString must be numeric (0.8.0); the full name keeps the beta suffix.
short=$(printf '%s' "$name" | sed 's/[^0-9.].*$//')
built=$(date '+%Y-%m-%d %H:%M')
git=$(git -C "$SRCROOT" rev-parse --short HEAD 2>/dev/null || echo "")

set_key() {
  "$BUDDY" -c "Set :$1 $2" "$PLIST" 2>/dev/null || "$BUDDY" -c "Add :$1 string $2" "$PLIST"
}
set_key CFBundleShortVersionString "$short"
set_key CFBundleVersion "$code"
set_key MomentVersionName "$name"
set_key MomentBuiltAt "$built"
set_key MomentGit "$git"
echo "Stamped $name ($code) $built $git"
