#!/bin/sh
set -eu
project_dir=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
test_output="$project_dir/build/scope-checks"
source_dir="$project_dir/app/src/main/java/cn/moment/lumix"
mkdir -p "$test_output"
"${JAVA_HOME:+$JAVA_HOME/bin/}javac" -encoding UTF-8 -d "$test_output" "$source_dir/ScopeAnalyzer.java" "$source_dir/ScopeCadence.java" "$project_dir/tests/ScopeAnalyzerChecks.java"
"${JAVA_HOME:+$JAVA_HOME/bin/}java" -cp "$test_output" cn.moment.lumix.ScopeAnalyzerChecks
