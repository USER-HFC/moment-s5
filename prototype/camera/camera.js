'use strict';
const icons = {
  back:'<path d="m14 6-6 6 6 6"/>',
  grid:'<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M9.3 4v16M14.7 4v16M4 9.3h16M4 14.7h16"/>',
  focus:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><circle cx="12" cy="12" r="3"/>',
  mic:'<rect x="9" y="2" width="6" height="12" rx="3"/><path d="M6 10v2a6 6 0 0 0 12 0v-2M12 18v4m-3 0h6"/>',
  usb:'<path d="M12 21V3m-2 2 2-3 2 3M12 16l-5-4V8m5 4 5-4V6"/><circle cx="7" cy="7" r="1"/><path d="M16 3h3v3h-3z"/>',
  rotate:'<path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5m-4 8a8 8 0 0 0 14 3l3-3m0 5v-5h-5"/>',
  expand:'<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  timer:'<circle cx="12" cy="13" r="8"/><path d="M9 2h6m-3 7v4l2 2m3-10 2-2"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
};
const $ = id => document.getElementById(id);
function drawIcons(root=document) { root.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">'+icons[node.dataset.icon]+'</svg>'; }); }
drawIcons();
const params = new URLSearchParams(location.search);
if (params.has('fullscreen')) document.body.classList.add('fullscreen');
if (params.has('review')) document.body.classList.add('review');
const state = {portrait:false, mode:'monitor', ratio:1.5, grid:true, audio:false, delay:10, lut:'original', connected:true, captures:[], timer:null, deadline:0};
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
  const canonicalWidth=portrait?height:width, canonicalHeight=portrait?width:height;
  camera.style.width=canonicalWidth+'px';camera.style.height=canonicalHeight+'px';
  camera.style.transform=portrait?'translateX('+width+'px) rotate(90deg)':'none';
  camera.classList.toggle('portrait',portrait);
  $('rotate').querySelector('span').textContent=portrait?'转为横屏':'转为竖屏';
  fitFrame();
}
function fitFrame() {
  const width = Math.min(view.clientWidth, view.clientHeight*state.ratio);
  frame.style.width=width+'px';frame.style.height=(width/state.ratio)+'px';
}
new ResizeObserver(fitFrame).observe(view);
addEventListener('resize',layout);
$('device').addEventListener('change',layout);
$('rotate').addEventListener('click',()=>{state.portrait=!state.portrait;layout();});
layout();
function toast(message) {clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>{$('toast').hidden=true;},2400);}
function stopTimer() {clearInterval(state.timer);state.timer=null;$('countdown').hidden=true;$('shutter').classList.remove('counting');$('shutter').setAttribute('aria-label','拍摄演示照片');}
function setMode(mode) {
  stopTimer();state.mode=mode;
  document.querySelectorAll('[data-mode]').forEach(button=>{const selected=button.dataset.mode===mode;button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));});
  $('mode-badge').textContent={monitor:'MONITOR',timer:'TIMER',motion:'MOTION · 3s'}[mode];
  $('buffer-info').hidden=mode!=='motion';$('delay-open').hidden=mode!=='timer';
  $('shutter-note').textContent={monitor:'机身照片',timer:state.delay+'秒延时',motion:'动态照片'}[mode];
}
document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>setMode(button.dataset.mode)));
$('grid-toggle').addEventListener('click',()=>{state.grid=!state.grid;$('composition-grid').hidden=!state.grid;$('grid-toggle').classList.toggle('active',state.grid);$('grid-toggle').setAttribute('aria-pressed',String(state.grid));});
$('audio-toggle').addEventListener('click',()=>{state.audio=!state.audio;$('audio-toggle').classList.toggle('active',state.audio);$('audio-toggle').setAttribute('aria-pressed',String(state.audio));toast(state.audio?'环境声已开启 · 交互演示':'环境声已关闭');});
$('ratio-toggle').addEventListener('click',()=>{state.ratio=state.ratio===1.5?16/9:1.5;const label=state.ratio===1.5?'3:2':'16:9';$('ratio-label').textContent=label;$('frame-info').textContent='S5 · '+label;fitFrame();});
function closePanel(){panel.close();if(lastFocus)lastFocus.focus();}
function showPanel(title, content) {lastFocus=document.activeElement;$('panel-title').textContent=title;$('panel-content').replaceChildren();$('panel-content').innerHTML=content;drawIcons(panel);panel.showModal();}
$('panel-close').addEventListener('click',closePanel);
panel.addEventListener('cancel',()=>{if(lastFocus)lastFocus.focus();});
$('home').addEventListener('click',()=>{
  showPanel('相机工作台','<p class="panel-copy">瞬间 Lumix · 演示原型</p><div class="menu-list"><button data-go="monitor">实时监看</button><button data-go="timer">定时遥控</button><button data-go="motion">动态照片</button><button data-go="album">本地相册</button></div>');
  panel.querySelectorAll('[data-go]').forEach(button=>button.onclick=()=>{closePanel();if(button.dataset.go==='album')openAlbum();else setMode(button.dataset.go);});
});
const looks={original:{name:'原色',className:''},warm:{name:'暖调胶片',className:'warm'},cool:{name:'冷调清透',className:'cool'}};
$('lut-open').addEventListener('click',()=>{
  showPanel('LUT 风格','<p class="panel-copy">选择后回到取景。原片保留，风格效果为 CSS 示意。</p><div class="lut-list">'+Object.entries(looks).map(([id,look])=>'<button class="lut-card '+(state.lut===id?'selected':'')+'" data-look="'+id+'"><img class="'+look.className+'" src="scene.png" alt="">'+look.name+'</button>').join('')+'</div><div class="panel-actions"><button id="import-lut">导入 LUT</button></div><p class="note" id="lut-import-note">正式版可导入 LUMIX Lab .cube / .zip；此处只演示选择文件流程，不解析文件。</p><input type="file" id="lut-file" accept=".cube,.zip" hidden>');
  panel.querySelectorAll('[data-look]').forEach(button=>button.onclick=()=>{state.lut=button.dataset.look;$('scene').className=looks[state.lut].className;$('lut-badge').hidden=state.lut==='original';$('lut-badge').textContent=looks[state.lut].name;$('lut-open').classList.toggle('active',state.lut!=='original');closePanel();});
  $('import-lut').onclick=()=>$('lut-file').click();
  $('lut-file').onchange=()=>{const file=$('lut-file').files[0];if(file)$('lut-import-note').textContent='已选择 '+file.name+'（原型未解析或应用）';};
});
$('focus-open').addEventListener('click',()=>{
  showPanel('对焦控制','<p class="panel-copy">镜头对焦操作入口。原型仅显示对焦反馈，不控制镜头。</p><div class="choices"><button class="choice" data-focus="远">远对焦</button><button class="choice" data-focus="AF">自动对焦</button><button class="choice" data-focus="近">近对焦</button></div>');
  panel.querySelectorAll('[data-focus]').forEach(button=>button.onclick=()=>{$('focus-info').textContent=button.dataset.focus;closePanel();toast('对焦反馈 · 演示');});
});
$('focus-target').addEventListener('click',()=>{$('focus-info').textContent='AF';toast('自动对焦 · 演示');});
$('delay-open').addEventListener('click',()=>{
  showPanel('快门延时','<p class="panel-copy">点按时长后回到取景，按快门开始；再次按快门取消。</p><div class="choices">'+[2,5,10,30].map(value=>'<button class="choice '+(value===state.delay?'selected':'')+'" data-delay="'+value+'">'+value+'秒</button>').join('')+'</div>');
  panel.querySelectorAll('[data-delay]').forEach(button=>button.onclick=()=>{stopTimer();state.delay=Number(button.dataset.delay);$('delay-label').textContent=state.delay+'s';$('shutter-note').textContent=state.delay+'秒延时';closePanel();});
});
function capture() {
  stopTimer();state.captures.unshift({mode:state.mode,lut:state.lut,time:new Date().toLocaleTimeString()});$('photo-count').textContent=state.captures.length;
  $('capture-mark').hidden=false;setTimeout(()=>{$('capture-mark').hidden=true;},700);
  toast(state.mode==='motion'?'演示动态照片已加入相册 · 非真实视频':'演示照片已加入相册');
}
$('shutter').addEventListener('click',()=>{
  if(!state.connected){toast('演示连接已断开，请点 USB 图标连接');return;}
  if(state.timer){stopTimer();toast('倒计时已取消');return;}
  if(state.mode!=='timer'){capture();return;}
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
  showPanel('本地相册',state.captures.length?'<p class="panel-copy">本次原型会话的演示照片，刷新页面后清空。</p><div class="album-grid">'+state.captures.slice(0,9).map(photo=>'<figure><img src="scene.png" class="'+looks[photo.lut].className+'" alt="演示照片"><figcaption>'+photo.time+' · '+(photo.mode==='motion'?'动态演示':'演示照片')+'</figcaption></figure>').join('')+'</div>':'<p class="panel-copy">还没有演示照片。关闭面板，按一下快门试试。</p>');
}
$('album-open').addEventListener('click',openAlbum);
