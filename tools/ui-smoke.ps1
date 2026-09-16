param([string]$Adb = '', [string]$Serial = 'emulator-5554', [string]$EvidenceDir = '')
$ErrorActionPreference='Stop'
$projectDir=Split-Path $PSScriptRoot -Parent
if(!$Adb){$Adb=Join-Path (Split-Path $projectDir -Parent) 'work/android-tools/sdk/platform-tools/adb.exe'}
if($Serial -notlike 'emulator-*'){throw 'This visual smoke check changes screen settings; run it only on an emulator.'}
$evidence=if($EvidenceDir){$EvidenceDir}else{Join-Path $projectDir 'evidence'}
New-Item -ItemType Directory -Force $evidence | Out-Null
function Device([string[]]$Commands){ & $Adb -s $Serial @Commands; if($LASTEXITCODE -ne 0){throw "adb failed: $Commands"} }
function Tree {
    Device @('shell','uiautomator','dump','/sdcard/moment-ui.xml') | Out-Null
    [xml]((Device @('shell','cat','/sdcard/moment-ui.xml')) -join '')
}
function FindText([string]$Label){ (Tree).SelectNodes('//node') | Where-Object { $_.text -eq $Label -or $_.GetAttribute('content-desc') -eq $Label } | Select-Object -Last 1 }
function ScrollPanel([bool]$Down){
    $scroll=(Tree).SelectNodes('//node[@class="android.widget.ScrollView"]') | Select-Object -Last 1
    if(!$scroll){return}
    $r=[regex]::Matches($scroll.bounds,'\d+')|ForEach-Object{[int]$_.Value}
    $x=[string][int](($r[0]+$r[2])/2);$top=[string]($r[1]+30);$bottom=[string]($r[3]-30)
    if($Down){Device @('shell','input','swipe',$x,$bottom,$x,$top,'250') | Out-Null}
    else {Device @('shell','input','swipe',$x,$top,$x,$bottom,'250') | Out-Null}
}
function TapNode($Node){
    if(!$Node){throw 'UI element missing'}
    $values=[regex]::Matches($Node.bounds,'\d+') | ForEach-Object {[int]$_.Value}
    Device @('shell','input','tap',[string][int](($values[0]+$values[2])/2),[string][int](($values[1]+$values[3])/2)) | Out-Null
}
function Tap([string]$Label){
    $node=FindText $Label
    for($i=0;!$node -and $i -lt 4;$i++){ScrollPanel $true;$node=FindText $Label}
    TapNode $node
}
function Shot([string]$Name){
    Start-Sleep -Milliseconds 400
    Device @('shell','screencap','-p',"/sdcard/$Name.png") | Out-Null
    Device @('pull',"/sdcard/$Name.png",(Join-Path $evidence "$Name.png")) | Out-Null
}
Device @('shell','am','force-stop','cn.moment.s5') | Out-Null
Device @('shell','am','start','-W','-n','cn.moment.s5/.MainActivity') | Out-Null
foreach($label in @('监看','定时遥控','动态照片','相册')){if(!(FindText $label)){throw "Home entry missing: $label"}}
Shot '01-home'
Tap '监看';Shot '02-monitor'
Tap '连接相机'; if(!(FindText '尚未发现 S5')){throw 'Missing-device state not shown'}; Tap '关闭';Tap '首页'
Tap '动态照片';Tap '体验实况演示';Tap '进入演示';ScrollPanel $false;ScrollPanel $false
$ready=$false
for($i=0;$i -lt 10;$i++){
    $tree=Tree
    $shutter=$tree.SelectNodes('//node') | Where-Object { $_.GetAttribute('content-desc') -eq '拍摄实况照片，保留快门前三秒' }
    if($shutter.enabled -eq 'true'){$ready=$true;break}
}
if(!$ready){throw 'Demo prebuffer never became ready'}
Shot '03-demo-live';TapNode $shutter
$complete=$false
for($i=0;$i -lt 18;$i++){if(FindText '实况已保存'){$complete=$true;break}}
if(!$complete){throw 'UI capture did not complete'}
Tap '首页';Tap '相册';Shot '04-library'
$item=(Tree).SelectNodes('//node[@clickable="true"]') | Where-Object {$_.text.StartsWith('[演示]')} | Select-Object -First 1
TapNode $item
if(!(FindText '播放 / 停止实况')){throw 'Playback control missing'}
Shot '05-still'
$photo=(Tree).SelectNodes('//node') | Where-Object {$_.GetAttribute('content-desc') -eq '实况静态照片，长按播放动态'}
Tap '播放 / 停止实况';Start-Sleep -Milliseconds 650;Shot '06-playing'
# Hold gesture and release must return to the still; the explicit play button is the accessible alternative.
$v=[regex]::Matches($photo.bounds,'\d+')|ForEach-Object{[int]$_.Value};$x=[string][int](($v[0]+$v[2])/2);$y=[string][int](($v[1]+$v[3])/2)
Device @('shell','input','swipe',$x,$y,$x,$y,'1200') | Out-Null
Shot '07-hold-released'
Tap '首页';Tap '定时遥控';Shot '08-timer'
Tap '开始倒计时';Shot '09-countdown';Tap '取消倒计时'
if(!(FindText '倒计时已取消')){throw 'Countdown cancellation missing'}
try {
    Device @('shell','settings','put','system','accelerometer_rotation','0') | Out-Null
    Device @('shell','settings','put','system','user_rotation','1') | Out-Null
    Tap '首页';Tree | Out-Null;Shot '10-home-landscape'
    Device @('shell','settings','put','system','user_rotation','0') | Out-Null
    Device @('shell','wm','size','1080x1920') | Out-Null
    Device @('shell','wm','density','480') | Out-Null
    Device @('shell','settings','put','system','font_scale','1.5') | Out-Null
    Device @('shell','settings','put','global','animator_duration_scale','0') | Out-Null
    Tree | Out-Null;Shot '11-small-large-text-home'
    Tap '监看';Tree | Out-Null;Shot '12-small-large-text-monitor'
} finally {
    Device @('shell','wm','size','reset') | Out-Null;Device @('shell','wm','density','reset') | Out-Null
    Device @('shell','settings','put','system','font_scale','1.0') | Out-Null
    Device @('shell','settings','put','global','animator_duration_scale','1') | Out-Null
    Device @('shell','settings','put','system','user_rotation','0') | Out-Null
    Device @('shell','settings','put','system','accelerometer_rotation','1') | Out-Null
}
'PASS landscape UI: four home entries, monitor, connection error, pre-only motion capture, album playback/hold, timer cancellation, small screen and large text screenshots'
