$ErrorActionPreference = 'Stop'
$projectDir = Split-Path $PSScriptRoot -Parent
$testOutput = Join-Path $projectDir 'build/core-checks'
New-Item -ItemType Directory -Force -Path $testOutput | Out-Null
$sourceDir = Join-Path $projectDir 'app/src/main/java/cn/moment/lumix'
& javac -encoding UTF-8 -d $testOutput "$sourceDir/Ptp.java" "$sourceDir/FrameRing.java" "$sourceDir/MotionPhoto.java" "$projectDir/tests/CoreChecks.java"
if ($LASTEXITCODE -ne 0) { throw 'Core compile failed' }
& java -cp $testOutput cn.moment.lumix.CoreChecks
if ($LASTEXITCODE -ne 0) { throw 'Core checks failed' }
