$ErrorActionPreference = 'Stop'
$projectDir = Split-Path -Parent $PSScriptRoot
$testOutput = Join-Path $projectDir 'build/moment-delete-checks'
New-Item -ItemType Directory -Force -Path $testOutput | Out-Null
& javac -encoding UTF-8 -d $testOutput `
  "$projectDir/app/src/main/java/cn/moment/lumix/MomentDeletion.java" `
  "$projectDir/tests/MomentDeletionChecks.java"
if($LASTEXITCODE -ne 0){throw 'javac failed'}
& java -cp $testOutput cn.moment.lumix.MomentDeletionChecks
if($LASTEXITCODE -ne 0){throw 'moment deletion checks failed'}
