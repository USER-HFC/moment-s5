'use strict';
const icons = cameraIcons;
const $ = id => document.getElementById(id);
function drawIcons(root=document) { root.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">'+icons[node.dataset.icon]+'</svg>'; }); }
drawIcons();
const params = new URLSearchParams(location.search);
if (params.has('fullscreen')) document.body.classList.add('fullscreen');
if (params.has('review')) document.body.classList.add('review');
const state = {portrait:false, motion:false, timerEnabled:false, ratio:1.5, grid:true, audio:false, focus:'AFS', delay:10, lut:'original', connected:true, captures:[], timer:null, deadline:0};
const shell=$('device-shell'), camera=$('camera'), view=$('view-area'), frame=$('image-frame'), panel=$('panel');
let lastFocus=null, toastTimer;
function layout() {
  const fullscreen = document.body.classList.contains('fullscreen') || (innerWidth<=700 && !document.body.classList.contains('review'));
  const [long, short] = $('device').value.split(',').map(Number);
  const portrait = fullscreen ? innerHeight>innerWidth : state.portrait;
  let width, height;
  if (fullscreen) {width=innerWidth;height=innerHeight;}
  else {
    const naturalWidth=portrait?short:long, naturalHeight=portrait?long:short;
    const scale=Math.min(1, (document.querySelector('.preview-desk').clientWidth-64)/naturalWidth);
    width=naturalWidth*scale;height=naturalHeight*scale;
  }
  shell.style.width=width+'px';shell.style.height=height+'px';
  camera.style.width=width+'px';camera.style.height=height+'px';
  camera.style.transform='none';
  camera.classList.toggle('portrait',portrait);
  $('rotate').querySelector('span').textContent=portrait?'转为横屏':'转为竖屏';
  fitFrame();
}
function fitFrame() {
  const ratio = camera.classList.contains('portrait') ? 1/state.ratio : state.ratio;
  const width = Math.min(view.clientWidth, view.clientHeight*ratio);
  frame.style.width=width+'px';frame.style.height=(width/ratio)+'px';
}
new ResizeObserver(fitFrame).observe(view);
addEventListener('resize',layout);
$('device').addEventListener('change',layout);
$('rotate').addEventListener('click',()=>{state.portrait=!state.portrait;layout();});
layout();
function toast(message) {clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>{$('toast').hidden=true;},2400);}
function stopTimer() {clearInterval(state.timer);state.timer=null;$('countdown').hidden=true;$('shutter').classList.remove('counting');$('shutter').setAttribute('aria-label','拍摄演示照片');}
function updateFeatureState() {
  $('motion-toggle').classList.toggle('active',state.motion);$('motion-toggle').setAttribute('aria-checked',String(state.motion));
  $('timer-toggle').classList.toggle('active',state.timerEnabled);$('timer-toggle').setAttribute('aria-checked',String(state.timerEnabled));
  $('buffer-info').hidden=!state.motion;$('delay-open').hidden=!state.timerEnabled;
  $('shutter-note').textContent=state.timerEnabled?state.delay+'秒延时':state.motion?'动态照片':'机身照片';
}
function toggleFeature(name) { if(name==='motion') state.motion=!state.motion; else {state.timerEnabled=!state.timerEnabled;if(!state.timerEnabled) stopTimer();} updateFeatureState(); toast((name==='motion'?'动态照片':'定时')+(name==='motion'?state.motion?'已开启':'已关闭':state.timerEnabled?'已开启':'已关闭')); }
$('motion-toggle').addEventListener('click',()=>toggleFeature('motion'));
$('timer-toggle').addEventListener('click',()=>toggleFeature('timer'));
updateFeatureState();
$('grid-toggle').addEventListener('click',()=>{state.grid=!state.grid;$('composition-grid').hidden=!state.grid;$('grid-toggle').classList.toggle('active',state.grid);$('grid-toggle').setAttribute('aria-pressed',String(state.grid));});
$('audio-toggle').addEventListener('click',()=>{state.audio=!state.audio;$('audio-toggle').classList.toggle('active',state.audio);$('audio-toggle').setAttribute('aria-pressed',String(state.audio));toast(state.audio?'环境声已开启 · 交互演示':'环境声已关闭');});
$('ratio-toggle').addEventListener('click',()=>{state.ratio=state.ratio===1.5?16/9:1.5;const label=state.ratio===1.5?'3:2':'16:9';$('ratio-label').textContent=label;fitFrame();});
function closePanel(){panel.close();if(lastFocus)lastFocus.focus();}
function showPanel(title, content) {lastFocus=document.activeElement;$('panel-title').textContent=title;$('panel-content').replaceChildren();$('panel-content').innerHTML=content;drawIcons(panel);panel.showModal();}
$('panel-close').addEventListener('click',closePanel);
panel.addEventListener('cancel',()=>{if(lastFocus)lastFocus.focus();});
const looks={original:{name:'原色',className:''},warm:{name:'暖调胶片',className:'warm'},cool:{name:'冷调清透',className:'cool'}};
$('lut-open').addEventListener('click',()=>{
  showPanel('LUT 风格','<p class="panel-copy">选择后回到取景。原片保留，风格效果为 CSS 示意。</p><div class="lut-list">'+Object.entries(looks).map(([id,look])=>'<button class="lut-card '+(state.lut===id?'selected':'')+'" data-look="'+id+'"><img class="'+look.className+'" src="scene.png" alt="">'+look.name+'</button>').join('')+'</div><div class="panel-actions"><button id="import-lut">导入 LUT</button></div><p class="note" id="lut-import-note">正式版可导入 LUMIX Lab .cube / .zip；此处只演示选择文件流程，不解析文件。</p><input type="file" id="lut-file" accept=".cube,.zip" hidden>');
  panel.querySelectorAll('[data-look]').forEach(button=>button.onclick=()=>{state.lut=button.dataset.look;$('scene').className=looks[state.lut].className;$('lut-badge').hidden=state.lut==='original';$('lut-badge').textContent=looks[state.lut].name;$('lut-open').classList.toggle('active',state.lut!=='original');closePanel();});
  $('import-lut').onclick=()=>$('lut-file').click();
  $('lut-file').onchange=()=>{const file=$('lut-file').files[0];if(file)$('lut-import-note').textContent='已选择 '+file.name+'（原型未解析或应用）';};
});
function setFocus(id, label) {
  state.focus=label; $('focus-info').textContent=label;
  document.querySelectorAll('.focus-control').forEach(button=>{const active=button.id===id;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
  toast(label==='AFS'?'自动对焦 · AFS':label==='MF'?'手动对焦 · 演示':'自动对焦 · '+label);
}
$('focus-auto').addEventListener('click',()=>setFocus('focus-auto','AFS'));
$('focus-far').addEventListener('click',()=>setFocus('focus-far','MF'));
$('focus-near').addEventListener('click',()=>setFocus('focus-near','MF'));
$('focus-target').addEventListener('click',()=>setFocus('focus-auto','AFS'));
$('delay-open').addEventListener('click',()=>{
  showPanel('快门延时','<p class="panel-copy">点按时长后回到取景，按快门开始；再次按快门取消。</p><div class="choices">'+[2,5,10,30].map(value=>'<button class="choice '+(value===state.delay?'selected':'')+'" data-delay="'+value+'">'+value+'秒</button>').join('')+'</div>');
  panel.querySelectorAll('[data-delay]').forEach(button=>button.onclick=()=>{stopTimer();state.delay=Number(button.dataset.delay);$('delay-label').textContent=state.delay+'s';updateFeatureState();closePanel();});
});
function capture() {
  stopTimer();state.captures.unshift({motion:state.motion,lut:state.lut,time:new Date().toLocaleTimeString()});$('photo-count').textContent=state.captures.length;
  $('capture-mark').hidden=false;setTimeout(()=>{$('capture-mark').hidden=true;},700);
  toast(state.motion?'演示动态照片已加入相册 · 非真实视频':'演示照片已加入相册');
}
$('shutter').addEventListener('click',()=>{
  if(!state.connected){toast('演示连接已断开，请点 USB 图标连接');return;}
  if(state.timer){stopTimer();toast('倒计时已取消');return;}
  if(!state.timerEnabled){capture();return;}
  state.deadline=performance.now()+state.delay*1000;$('countdown').hidden=false;$('countdown').textContent=state.delay;$('shutter').classList.add('counting');$('shutter').setAttribute('aria-label','取消倒计时');
  state.timer=setInterval(()=>{const seconds=Math.ceil((state.deadline-performance.now())/1000);if(seconds<=0)capture();else $('countdown').textContent=seconds;},100);
});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopTimer();});
$('connection-open').addEventListener('click',()=>{
  showPanel('相机连接','<div class="connection-row">LUMIX S5 · '+(state.connected?'演示已连接':'演示未连接')+'</div><p class="panel-copy">H5 不访问 USB 相机。正式版使用 USB-C 数据线，机身设为 PC (Tether)。</p><div class="panel-actions"><button id="demo-connect">'+(state.connected?'断开演示连接':'连接演示相机')+'</button></div>');
  $('demo-connect').onclick=()=>{state.connected=!state.connected;stopTimer();document.querySelector('.status-dot').style.background=state.connected?'var(--green)':'var(--muted)';closePanel();toast(state.connected?'演示相机已连接':'演示相机已断开');};
});
function openAlbum(){
  stopTimer();
  showPanel('本地相册',state.captures.length?'<p class="panel-copy">本次原型会话的演示照片，刷新页面后清空。</p><div class="album-grid">'+state.captures.slice(0,9).map(photo=>'<figure><img src="scene.png" class="'+looks[photo.lut].className+'" alt="演示照片"><figcaption>'+photo.time+' · '+(photo.motion?'动态演示':'演示照片')+'</figcaption></figure>').join('')+'</div>':'<p class="panel-copy">还没有演示照片。关闭面板，按一下快门试试。</p>');
}
$('album-open').addEventListener('click',openAlbum);
