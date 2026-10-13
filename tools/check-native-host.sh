#!/usr/bin/env bash
# JAVA_HOME must point to JDK 17+. Supply Android API and RN 0.76.7 classes jars.
# Defaults use ignored .tools/android-all.jar and .tools/react-android.jar.
set -euo pipefail
cd "$(dirname "$0")/.."
compiler="${JAVA_HOME:+$JAVA_HOME/bin/}javac"
runtime="${JAVA_HOME:+$JAVA_HOME/bin/}java"
classpath="${MOMENT_ANDROID_JAR:-.tools/android-all.jar}:${MOMENT_REACT_JAR:-.tools/react-android.jar}"
mkdir -p build/native-compile build/native-host-checks
sources=()
while IFS= read -r file; do sources+=("$file"); done < <(rg --files app/src/main/java mobile/android/app/src/main/java/cn/moment/lumix -g '*.java' -g '!MainActivity.java')
"$compiler" -encoding UTF-8 -cp "$classpath" -d build/native-compile "${sources[@]}"
stubs=()
while IFS= read -r file; do stubs+=("$file"); done < <(rg --files tests/android-stubs -g '*.java')
"$compiler" -encoding UTF-8 -cp "build/native-compile:$classpath" -d build/native-host-checks "${stubs[@]}" tests/NativeBugfixChecks.java
"$runtime" -cp "build/native-host-checks:build/native-compile:$classpath" cn.moment.lumix.NativeBugfixChecks
