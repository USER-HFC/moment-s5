#!/usr/bin/env bash
# JAVA_HOME must point to JDK 17+. Supply Android API and RN 0.76.7 classes jars.
# Defaults use ignored .tools/android-all.jar and .tools/react-android.jar.
set -euo pipefail
cd "$(dirname "$0")/.."
compiler="${JAVA_HOME:+$JAVA_HOME/bin/}javac"
runtime="${JAVA_HOME:+$JAVA_HOME/bin/}java"
mkdir -p build/buildconfig-stub build/native-compile build/native-host-checks
"$compiler" -encoding UTF-8 -d build/buildconfig-stub tests/android-stubs/com/moments5rn/BuildConfig.java
classpath="${MOMENT_ANDROID_JAR:-.tools/android-all.jar}:${MOMENT_REACT_JAR:-.tools/react-android.jar}:build/buildconfig-stub"
sources=()
while IFS= read -r file; do sources+=("$file"); done < <(find app/src/main/java mobile/android/app/src/main/java/cn/moment/lumix -name '*.java' ! -name MainActivity.java)
"$compiler" -encoding UTF-8 -cp "$classpath" -d build/native-compile "${sources[@]}"
stubs=()
while IFS= read -r file; do stubs+=("$file"); done < <(find tests/android-stubs -name '*.java')
"$compiler" -encoding UTF-8 -cp "build/native-compile:$classpath" -d build/native-host-checks "${stubs[@]}" tests/NativeBugfixChecks.java
"$runtime" -cp "build/native-host-checks:build/native-compile:$classpath" cn.moment.lumix.NativeBugfixChecks
