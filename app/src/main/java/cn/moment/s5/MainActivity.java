package cn.moment.s5;

import android.app.*;
import android.content.*;
import android.content.res.Configuration;
import android.content.res.ColorStateList;
import android.graphics.*;
import android.graphics.drawable.*;
import android.hardware.usb.*;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.widget.*;
import org.json.JSONObject;
import java.io.*;
import java.nio.file.Files;
import java.text.SimpleDateFormat;
import java.util.*;
import java.util.concurrent.*;

public final class MainActivity extends Activity implements CaptureEngine.Listener {
    private static final int BG=0xff101210,SURFACE=0xff1b201b,TEXT=0xffedf0e7,MUTED=0xffb0b9ab,ACCENT=0xffd6f58b;
    private static final String USB_PERMISSION="cn.moment.s5.USB_PERMISSION";
    private CaptureEngine engine;
    private MomentStore store;
    private UsbManager usb;
    private LinearLayout root,body;
    private PreviewView preview;
    private TextView status,bufferText,exposure;
    private ProgressBar progress;
    private Button shutter;
    private final List<Button> focusButtons=new ArrayList<>();
    private VideoView video;
    private File detail;
    private String page="camera",statusValue="接上 S5，让照片多留住三秒。",exposureValue="USB-C 直连 · PC(Tether)";
    private boolean destroyed,foreground,playing;
    private final Handler main=new Handler(Looper.getMainLooper());
    private final ExecutorService io=Executors.newSingleThreadExecutor();
    private long lastUi;
    private final BroadcastReceiver receiver=new BroadcastReceiver() {
        @Override public void onReceive(Context c,Intent intent) {
            UsbDevice device=intent.getParcelableExtra(UsbManager.EXTRA_DEVICE);
            if(USB_PERMISSION.equals(intent.getAction())) {
                if(!foreground) return;
                if(device!=null && intent.getBooleanExtra(UsbManager.EXTRA_PERMISSION_GRANTED,false)) engine.connect(usb,device);
                else status("USB 访问未授权。可以重新点“连接相机”。",false);
            } else if(UsbManager.ACTION_USB_DEVICE_DETACHED.equals(intent.getAction()) && device!=null && UsbS5.candidate(device)) engine.detach();
        }
    };
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);usb=(UsbManager)getSystemService(USB_SERVICE);store=new MomentStore(this);engine=new CaptureEngine(this,this);
        IntentFilter f=new IntentFilter(USB_PERMISSION);f.addAction(UsbManager.ACTION_USB_DEVICE_DETACHED);
        registerReceiver(receiver,f,Context.RECEIVER_NOT_EXPORTED);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if(state!=null) page=state.getString("page","camera");render();
    }
    @Override protected void onStart() {super.onStart();foreground=true;if(detail!=null && video==null)render();else if(status!=null)status.setText(statusValue);main.post(tick);}
    private final Runnable tick=new Runnable(){@Override public void run(){if(destroyed || !foreground)return;
        if(shutter!=null){boolean ready=engine.ready();shutter.setEnabled(ready);shutter.setAlpha(ready?1:.45f);}
        for(Button b:focusButtons){b.setEnabled(engine.canFocus());b.setAlpha(engine.canFocus()?1:.45f);}
        main.postDelayed(this,400);
    }};
    @Override public void onRequestPermissionsResult(int request,String[] permissions,int[] results) {
        super.onRequestPermissionsResult(request,permissions,results);
        if(request==9){boolean allowed=results.length>0 && results[0]==android.content.pm.PackageManager.PERMISSION_GRANTED;engine.audio(allowed);toast(allowed?"环境声已开启":"继续使用无声实况");render();}
    }
    @Override protected void onStop() {foreground=false;main.removeCallbacks(tick);stopPlayback();io.execute(engine::stopAudio);engine.disconnect();statusValue="已暂停连接 · 回到拍摄页可重新连接";super.onStop();}
    @Override protected void onDestroy() {destroyed=true;unregisterReceiver(receiver);engine.shutdown();io.shutdown();super.onDestroy();}
    @Override public void onConfigurationChanged(Configuration c) {super.onConfigurationChanged(c);render();}
    @Override public void onSaveInstanceState(Bundle out) {out.putString("page",page);super.onSaveInstanceState(out);}
    @Override public void onBackPressed() {if(detail!=null) {detail=null;page="library";render();} else if(!page.equals("camera")){page="camera";render();} else super.onBackPressed();}
    private void render() {
        stopPlayback();preview=null;status=null;bufferText=null;exposure=null;progress=null;shutter=null;focusButtons.clear();
        root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setBackgroundColor(BG);root.setPadding(dp(20),dp(12),dp(20),0);
        root.setOnApplyWindowInsetsListener((v,insets)-> {
            android.graphics.Insets i=insets.getInsets(WindowInsets.Type.systemBars()|WindowInsets.Type.displayCutout());int top=i.top,bottom=i.bottom;
            root.setPadding(dp(20),top+dp(12),dp(20),bottom);return insets;
        });
        LinearLayout header=row();TextView title=text("瞬间",27,TEXT);title.setTypeface(Typeface.create("sans-serif-medium",Typeface.NORMAL));header.addView(title,new LinearLayout.LayoutParams(0,-2,1));
        TextView wordmark=text("S5 / MOMENT",12,ACCENT);wordmark.setTypeface(Typeface.MONOSPACE);header.addView(wordmark);root.addView(header);
        ScrollView scroll=new ScrollView(this);scroll.setFillViewport(false);scroll.setClipToPadding(false);scroll.setPadding(0,dp(16),0,dp(12));
        body=column();scroll.addView(body);root.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));
        if(detail!=null) detailPage();else switch(page) {case "library" -> libraryPage();case "connect" -> connectionPage();default -> cameraPage();}
        LinearLayout nav=row();for(String[] item:new String[][]{{"camera","拍摄"},{"library","片刻"},{"connect","连接"}}) {
            Button b=button(item[1],item[0].equals(page),()-> {detail=null;page=item[0];render();});nav.addView(b,weighted(dp(56)));
        }
        root.addView(nav);setContentView(root);root.requestApplyInsets();
    }
    private void cameraPage() {
        LinearLayout tag=row();tag.addView(text("LIVE PHOTO",12,ACCENT),new LinearLayout.LayoutParams(0,-2,1));tag.addView(text("1.5s  +  1.5s",12,MUTED));body.addView(tag);space(12);
        preview=new PreviewView(this);body.addView(preview,new LinearLayout.LayoutParams(-1,-2));space(12);
        exposure=text(exposureValue,13,MUTED);exposure.setTypeface(Typeface.MONOSPACE);body.addView(exposure);
        space(20);bufferText=text("快门前缓存  0.0 / 1.5 秒",14,TEXT);body.addView(bufferText);
        progress=new ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal);progress.setMax(1500);progress.setProgressTintList(ColorStateList.valueOf(ACCENT));
        body.addView(progress,new LinearLayout.LayoutParams(-1,dp(8)));space(8);
        status=text(statusValue,14,MUTED);status.setAccessibilityLiveRegion(View.ACCESSIBILITY_LIVE_REGION_POLITE);body.addView(status);space(16);
        LinearLayout controls=row();
        for(int i=-1;i<=1;i++){final int direction=i;Button b=button(i<0?"近焦":i>0?"远焦":"自动对焦",false,()->engine.focus(direction));
            b.setEnabled(engine.canFocus());b.setAlpha(engine.canFocus()?1:.45f);focusButtons.add(b);controls.addView(b,weighted(dp(52)));}
        body.addView(controls);space(16);
        LinearLayout capture=row();capture.setGravity(Gravity.CENTER);
        shutter=button("实况\n快门",true,()-> {engine.capture();shutter.setEnabled(false);shutter.setAlpha(.45f);});
        shutter.setContentDescription("拍摄实况照片，保留快门前后各一秒半");shutter.setTextSize(16);shutter.setBackground(ripple(ACCENT,dp(50)));shutter.setEnabled(engine.ready());shutter.setAlpha(engine.ready()?1:.45f);
        capture.addView(shutter,new LinearLayout.LayoutParams(dp(100),dp(100)));body.addView(capture);space(16);
        body.addView(button("连接相机",false,this::connect));
        body.addView(button("体验实况演示",false,()->new AlertDialog.Builder(this).setTitle("体验完整拍摄流程")
            .setMessage("演示使用程序生成的风景与移动光点，能够真实合成、回放和导出实况文件，但不代表 S5 已连接或通过兼容性测试。")
            .setPositiveButton("进入演示",(d,w)->engine.demo()).setNegativeButton("取消",null).show()));
        space(8);body.addView(text("原片来自 S5，动态来自 USB 取景。\n可在连接页开启手机环境声。",12,MUTED));
    }
    private void connectionPage() {
        body.addView(text("一根线，留住瞬间。",24,TEXT));space(12);
        body.addView(text("OPPO Find X8  →  USB-C 数据线  →  LUMIX S5",14,ACCENT));space(20);
        card("01  手机","在设置中搜索并打开 OTG。数据线需要支持文件传输，不只是充电。");
        card("02  相机","USB 模式选择 PC(Tether)，使用单张拍摄，画质设为 JPEG 或 RAW+JPEG，确认 SD 卡可写。");
        card("03  连接","点击下方按钮并允许 USB 访问。等待预缓存填满，再按 App 的实况快门。");
        body.addView(button("连接相机",true,this::connect));body.addView(button("断开连接",false,()-> {engine.disconnect();status("已断开连接",false);}));
        body.addView(button("刷新曝光参数",false,engine::refreshExposure));space(16);
        Switch microphone=new Switch(this);microphone.setText("录制手机环境声");microphone.setTextColor(TEXT);microphone.setTextSize(16);microphone.setMinHeight(dp(52));microphone.setChecked(engine.audioEnabled());
        microphone.setOnCheckedChangeListener((view,on)->{
            if(on && checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)!=android.content.pm.PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{android.Manifest.permission.RECORD_AUDIO},9);
            else engine.audio(on);
        });body.addView(microphone);body.addView(text("仅在 App 前台连接或演示时收音，切到后台会停止。声音来自手机，取景传输延迟可能影响同步。",12,MUTED));space(16);
        body.addView(text("连接诊断",18,TEXT));space(8);
        StringBuilder devices=new StringBuilder();for(UsbDevice d:usb.getDeviceList().values()) devices.append(String.format(Locale.US,"USB %04X:%04X · %s\n",d.getVendorId(),d.getProductId(),UsbS5.candidate(d)?"Panasonic PTP":"非目标设备"));
        TextView log=text((devices.length()==0?"尚未发现 USB 设备\n":devices.toString())+engine.diagnostics(),12,MUTED);log.setTextIsSelectable(true);body.addView(log);
        body.addView(button("分享诊断记录",false,()-> {
            try {File d=new File(store.root,"diagnostics");if(!d.isDirectory() && !d.mkdirs()) throw new IOException("目录创建失败");
                File f=new File(d,"diagnostics.txt");Files.write(f.toPath(),("Moment S5 0.1.0\nAndroid "+Build.VERSION.RELEASE+" / "+Build.MANUFACTURER+" "+Build.MODEL+"\n"+devices+engine.diagnostics()).getBytes(java.nio.charset.StandardCharsets.UTF_8));share(f);
            } catch(Exception e){error(e);}
        }));space(12);
        body.addView(text("驱动基于开源 tethr；初代 S5 2.9 与 Find X8 的兼容性需真机验证。程序不包含固件更新、删除照片或服务模式指令。",12,MUTED));
    }
    private void card(String title,String copy) {
        LinearLayout card=column();card.setPadding(dp(16),dp(16),dp(16),dp(16));card.setBackground(shape(SURFACE,dp(16)));card.addView(text(title,16,TEXT));card.addView(text(copy,14,MUTED));
        body.addView(card);space(12);
    }
    private void connect() {
        if(engine.busy()) {toast("正在保存实况，请稍候");return;}
        List<UsbDevice> devices=new ArrayList<>();for(UsbDevice d:usb.getDeviceList().values()) if(UsbS5.candidate(d)) devices.add(d);
        if(devices.isEmpty()) {statusValue="未发现 S5 · 检查 OTG、数据线和 PC(Tether)";new AlertDialog.Builder(this).setTitle("尚未发现 S5")
            .setMessage("确认 OPPO 已开启 OTG，使用数据线直连相机，并在 S5 选择 PC(Tether)。不需要采集卡。")
            .setPositiveButton("查看连接步骤",(a,b)->{page="connect";detail=null;render();}).setNegativeButton("关闭",null).show();return;}
        if(devices.size()>1) {toast("请仅连接一台 S5");return;}
        UsbDevice d=devices.get(0);page="camera";detail=null;render();
        if(usb.hasPermission(d)) engine.connect(usb,d);
        else {
            Intent intent=new Intent(USB_PERMISSION).setPackage(getPackageName());
            int flags=PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_MUTABLE;
            usb.requestPermission(d,PendingIntent.getBroadcast(this,0,intent,flags));
        }
    }
    private void libraryPage() {
        List<File> moments=store.list();body.addView(text("留下的片刻",25,TEXT));space(8);body.addView(text(moments.size()+" 个瞬间 · 全部保存在本机",14,MUTED));space(20);
        if(moments.isEmpty()) {card("还没有实况照片","连接 S5 拍下第一张，或在拍摄页体验演示。演示作品会始终带有明确标记。");return;}
        for(File d:moments) {
            try {
                JSONObject m=MomentStore.metadata(d);String date=new SimpleDateFormat("MM月dd日  HH:mm:ss",Locale.CHINA).format(new Date(m.optLong("createdAt",d.lastModified())));
                Button b=button((m.optBoolean("demo")?"[演示]  ":"")+date+"\n"+(m.optBoolean("complete")?"实况 · 长按回放":"合成未完成 · 检查原片"),false,()-> {detail=d;render();});
                b.setGravity(Gravity.START|Gravity.CENTER_VERTICAL);b.setMinHeight(dp(80));body.addView(b);space(8);
            } catch(Exception e) {body.addView(text("无法读取记录："+d.getName(),12,MUTED));}
        }
    }
    private void detailPage() {
        File d=detail;
        try {
            JSONObject m=MomentStore.metadata(d);body.addView(button("返回片刻",false,()->{detail=null;page="library";render();}));space(12);
            body.addView(text(m.optBoolean("demo")?"演示 · 一瞬之间":"一瞬之间",25,TEXT));space(12);
            FrameLayout frame=new FrameLayout(this);int height=Math.round((getResources().getDisplayMetrics().widthPixels-dp(40))*2f/3);
            if(getResources().getConfiguration().orientation==Configuration.ORIENTATION_LANDSCAPE)height=Math.min(height,Math.round(getResources().getDisplayMetrics().heightPixels*.45f));
            HoldPhotoView photo=new HoldPhotoView(this);photo.setScaleType(ImageView.ScaleType.FIT_CENTER);photo.setContentDescription("实况静态照片，长按播放动态");
            BitmapFactory.Options o=new BitmapFactory.Options();o.inJustDecodeBounds=true;BitmapFactory.decodeFile(new File(d,"original.jpg").getPath(),o);
            o.inSampleSize=1;while(o.outWidth/o.inSampleSize>1600) o.inSampleSize*=2;o.inJustDecodeBounds=false;
            photo.setImageBitmap(BitmapFactory.decodeFile(new File(d,"original.jpg").getPath(),o));
            video=new VideoView(this);video.setVisibility(View.INVISIBLE);video.setVideoPath(new File(d,"motion.mp4").getPath());
            frame.addView(video,new FrameLayout.LayoutParams(-1,-1,Gravity.CENTER));frame.addView(photo,new FrameLayout.LayoutParams(-1,-1));body.addView(frame,new LinearLayout.LayoutParams(-1,height));
            Runnable play=()-> {if(!m.optBoolean("complete") || video==null)return;playing=true;photo.setAlpha(1f);video.setVisibility(View.VISIBLE);video.seekTo(0);video.start();};
            Runnable stop=()-> {if(video!=null){video.pause();video.seekTo(0);video.setVisibility(View.INVISIBLE);}photo.setAlpha(1f);playing=false;};
            photo.hold(play,stop);
            video.setOnInfoListener((player,what,extra)->{if(what==android.media.MediaPlayer.MEDIA_INFO_VIDEO_RENDERING_START && playing)photo.setAlpha(0f);return false;});
            video.setOnCompletionListener(v->stop.run());video.setOnErrorListener((v,what,extra)->{stop.run();toast("视频回放失败 "+what);return true;});
            space(12);body.addView(text("长按照片，回到这一刻。",14,MUTED));
            body.addView(button("播放 / 停止实况",true,()->{if(playing)stop.run();else play.run();}));space(12);
            long gap=m.optLong("maxGapMs");
            body.addView(text(m.optInt("frames")+" 帧 · "+(m.optBoolean("audio")?"含环境声":"无声")+" · 最长帧间隔 "+gap+" ms",13,MUTED));
            if(gap>300 || !m.optBoolean("hasPostFrames",true)) body.addView(text("取景有停顿：播放保留原始时间，停顿期间显示上一帧。",13,0xffffd197));
            if(!m.optBoolean("complete")) body.addView(text(m.optString("error","合成尚未完成"),14,0xffffd197));
            Button export=button("保存到系统相册",true,()-> {toast("正在导出…");io.execute(()->{try{MomentStore.export(this,d);main.post(()->toast("已保存到 DCIM/MomentS5；相册识别情况需实测"));}catch(Exception e){main.post(()->error(e));}});});
            export.setEnabled(m.optBoolean("complete"));body.addView(export);
            body.addView(button("分享实况文件",false,()->share(new File(d,"MOMENT_MP.jpg"))));
            body.addView(button("分享原片 JPEG",false,()->share(new File(d,"original.jpg"))));
            body.addView(button("分享动态视频",false,()->share(new File(d,"motion.mp4"))));space(12);
            body.addView(text("导出使用 Android Motion Photo 格式。发送渠道可能只保留静态图；传入 iPhone 不会自动变成 Apple Live Photo。",12,MUTED));
        } catch(Exception e) {body.addView(text("无法读取："+e.getMessage(),14,TEXT));}
    }
    private void share(File file) {
        if(!file.isFile()) {toast("文件尚未生成");return;}
        Uri uri=ShareProvider.uri(this,file);String mime=file.getName().endsWith(".mp4")?"video/mp4":file.getName().endsWith(".jpg")?"image/jpeg":"text/plain";
        Intent i=new Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM,uri).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        i.setClipData(ClipData.newRawUri(file.getName(),uri));startActivity(Intent.createChooser(i,"分享片刻"));
    }
    private void stopPlayback() {if(video!=null){video.setOnCompletionListener(null);video.setOnInfoListener(null);video.stopPlayback();video=null;}playing=false;}
    @Override public void status(String message,boolean ready) {main.post(()-> {if(destroyed)return;statusValue=message;if(status!=null)status.setText(message);if(shutter!=null){shutter.setEnabled(ready);shutter.setAlpha(ready?1:.45f);}});}
    @Override public void frame(byte[] jpeg,long bufferedUs,boolean demo) {
        long t=SystemClock.elapsedRealtime();if(t-lastUi<90 || destroyed)return;lastUi=t;
        BitmapFactory.Options o=new BitmapFactory.Options();o.inSampleSize=1;
        Bitmap b=BitmapFactory.decodeByteArray(jpeg,0,jpeg.length,o);
        main.post(()-> {if(destroyed || preview==null){if(b!=null)b.recycle();return;}preview.image(b);
            if(progress!=null)progress.setProgress((int)Math.min(1500,bufferedUs/1000));
            if(bufferText!=null)bufferText.setText(getString(R.string.buffer_status,demo?"演示 · ":"",Math.min(1.5,bufferedUs/1_000_000.0)));
            if(shutter!=null){boolean r=engine.ready();shutter.setEnabled(r);shutter.setAlpha(r?1:.45f);}
        });
    }
    @Override public void saved(File directory) {main.post(()-> {if(!destroyed && foreground){toast("实况已保存，可以到“片刻”长按回放");if(page.equals("library"))render();}});}
    @Override public void log(String message) {android.util.Log.i("MomentS5",message);}
    @Override public void exposure(String value) {main.post(()-> {exposureValue=value;if(exposure!=null)exposure.setText(value);});}
    private void error(Exception e) {new AlertDialog.Builder(this).setTitle("暂未完成").setMessage(e.getMessage()).setPositiveButton("知道了",null).show();}
    private void toast(String text) {if(!destroyed)Toast.makeText(this,text,Toast.LENGTH_LONG).show();}
    private LinearLayout column() {LinearLayout l=new LinearLayout(this);l.setOrientation(LinearLayout.VERTICAL);return l;}
    private LinearLayout.LayoutParams weighted(int height){LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(0,height,1);p.setMargins(dp(4),0,dp(4),0);return p;}
    private LinearLayout row() {LinearLayout l=new LinearLayout(this);l.setOrientation(LinearLayout.HORIZONTAL);l.setGravity(Gravity.CENTER_VERTICAL);return l;}
    private TextView text(String value,int sp,int color) {TextView t=new TextView(this);t.setText(value);t.setTextSize(sp);t.setTextColor(color);t.setLineSpacing(dp(3),1);t.setPadding(0,dp(2),0,dp(2));return t;}
    private Button button(String label,boolean primary,Runnable action) {
        Button b=new Button(this);b.setText(label);b.setAllCaps(false);b.setTextSize(14);b.setTextColor(primary?BG:TEXT);b.setMinHeight(dp(52));
        b.setPadding(dp(12),dp(8),dp(12),dp(8));b.setBackground(ripple(primary?ACCENT:SURFACE,dp(14)));
        LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.setMargins(dp(3),dp(4),dp(3),dp(4));b.setLayoutParams(p);b.setOnClickListener(v->action.run());return b;
    }
    private GradientDrawable shape(int color,int radius) {GradientDrawable d=new GradientDrawable();d.setColor(color);d.setCornerRadius(radius);return d;}
    private RippleDrawable ripple(int color,int radius) {return new RippleDrawable(ColorStateList.valueOf(0x335e7650),shape(color,radius),null);}
    private void space(int n) {View v=new View(this);body.addView(v,new LinearLayout.LayoutParams(1,dp(n)));}
    private int dp(float n) {return Math.round(n*getResources().getDisplayMetrics().density);}
}
