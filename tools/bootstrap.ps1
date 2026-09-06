param([string]$ToolDir = (Join-Path (Split-Path $PSScriptRoot -Parent) '.tools'))
$ErrorActionPreference='Stop'
$projectDir=Split-Path $PSScriptRoot -Parent
if(!(Get-Command java -ErrorAction SilentlyContinue)){throw 'Install JDK 17 and make java/javac available before running this script.'}
$ToolDir=[IO.Path]::GetFullPath($ToolDir)
New-Item -ItemType Directory -Force $ToolDir | Out-Null
$sdkDir=Join-Path $ToolDir 'sdk'
$cliDir=Join-Path $ToolDir 'cli'
$sdkManager=Join-Path $cliDir 'cmdline-tools/bin/sdkmanager.bat'
if(!(Test-Path -LiteralPath $sdkManager)){
    $zip=Join-Path $ToolDir 'commandline-tools.zip'
    Invoke-WebRequest -Uri 'https://dl.google.com/android/repository/commandlinetools-win-11076708_latest.zip' -OutFile $zip
    if((Get-FileHash -Algorithm SHA256 -LiteralPath $zip).Hash -ne '4D6931209EEBB1BFB7C7E8B240A6A3CB3AB24479EA294F3539429574B1EEC862'){throw 'Android command-line tools checksum mismatch'}
    Expand-Archive -LiteralPath $zip -DestinationPath $cliDir
}
Write-Host 'Review and accept the Android SDK licenses when prompted.'
& $sdkManager "--sdk_root=$sdkDir" 'platforms;android-35' 'build-tools;34.0.0' 'platform-tools'
if($LASTEXITCODE -ne 0){throw 'SDK installation failed'}
$env:ANDROID_HOME=$sdkDir
& "$projectDir/gradlew.bat" -p $projectDir :app:assembleDebug :app:lintDebug
if($LASTEXITCODE -ne 0){throw 'Build failed'}
Write-Host "APK: $projectDir/app/build/outputs/apk/debug/app-debug.apk"
