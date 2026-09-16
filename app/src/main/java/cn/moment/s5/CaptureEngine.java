package cn.moment.s5;

import android.content.Context;
import android.graphics.*;
import android.hardware.usb.*;
import android.os.SystemClock;
import org.json.JSONObject;
import java.io.*;
import java.nio.file.Files;
import java.util.*;
import java.util.concurrent.*;

public final class CaptureEngine {
    public interface Listener {
        void status(String message,boolean ready);
        void frame(byte[] jpeg,long bufferedUs,boolean demo);
        void saved(File directory);
        void log(String message);
        void exposure(String value);
    }
    private final Listener listener;
    private final MomentStore store;
    private final ScheduledExecutorService worker=Executors.newSingleThreadScheduledExecutor();
    private final ExecutorService exporter=Executors.newSingleThreadExecutor();
    private final FrameRing ring=new FrameRing(4_500_000,32*1024*1024);
    private volatile UsbS5 camera;
    private volatile AudioRing microphone;
    private volatile boolean audioEnabled;
    private volatile boolean demo,busy,shuttingDown;
    private volatile boolean active;
    private ScheduledFuture<?> polling;
    private final List<String> logs=Collections.synchronizedList(new ArrayList<>());
    public CaptureEngine(Context c,Listener listener) {store=new MomentStore(c);this.listener=listener;}
    private void log(String s) {
        synchronized(logs) {logs.add(String.format(Locale.US,"%d %s",SystemClock.elapsedRealtime(),s));if(logs.size()>250) logs.remove(0);}
        listener.log(s);
    }
    public String diagnostics() {synchronized(logs){return String.join("\n",logs);}}
    public boolean busy() {return busy;}
    public void audio(boolean enabled) {audioEnabled=enabled;worker.execute(()->{stopAudio();if(active)startAudio();});}
    public boolean audioEnabled() {return audioEnabled;}
    private synchronized void startAudio() {if(audioEnabled){try{microphone=new AudioRing();microphone.start();log("环境声录制已开启");}catch(Exception e){stopAudio();log("收音不可用，本次为无声："+e.getMessage());}}}
    public synchronized void stopAudio() {if(microphone!=null){microphone.close();microphone=null;}}
    public boolean canFocus() {return active && !demo && !busy && camera!=null;}
    public boolean active() {return active;}
    public void connect(UsbManager manager,UsbDevice device) {
        worker.execute(()-> {
            disconnectNow();listener.status("正在打开 S5 USB 会话…",false);
            try {camera=new UsbS5(manager,device,this::log);camera.open();active=true;demo=false;listener.exposure(camera.exposure());startPolling();}
            catch(Exception e) {if(camera!=null) camera.close();camera=null;active=false;fail(e);}
        });
    }
    public void demo() {
        if(busy) {listener.status("正在保存实况，请稍候",false);return;}
        worker.execute(()-> {disconnectNow();demo=true;active=true;log("进入演示：全部图像由 App 生成，不代表 S5 实测");listener.exposure("演示素材 · 无相机连接");startPolling();});
    }
    private void startPolling() {
        startAudio();
        ring.clear();listener.status(demo?"演示模式 · 正在预缓存":"已连接 · 正在预缓存",false);
        polling=worker.scheduleWithFixedDelay(()-> {
            if(!active || busy) return;
            try {grab();} catch(Exception e) {disconnectNow();fail(e);}
        },0,75,TimeUnit.MILLISECONDS);
    }
    private void grab() throws Exception {
        byte[] bytes=demo?demoFrame(now(),960,640):(camera==null?null:camera.preview());
        if(bytes!=null) {long t=now();ring.add(t,bytes);listener.frame(bytes,ring.durationUs(),demo);}
    }
    public boolean ready() {return active && !busy && !ring.preCaptureWindow(now()).isEmpty();}
    public void capture() {
        if(!ready()) {listener.status("请等待预缓存填满，并确认取景持续更新",false);return;}
        busy=true;
        worker.execute(()-> {
            File dir=null;
            try {
                if(!active) throw new IOException("相机已断开");
                Set<Integer> baseline=null;
                if(!demo) {
                    listener.status("正在准备拍摄 · 读取照片索引",false);
                    long indexStart=now();
                    try {baseline=camera.handles();} catch(IOException e) {log("文件列表读取不可用，将使用事件："+e.getMessage());}
                    log("照片索引读取耗时 "+(now()-indexStart)/1000+" ms");
                }
                long shutterUs=now();List<FrameRing.Frame> pre=ring.preCaptureWindow(shutterUs);
                if(pre.isEmpty()) {
                    log("拍摄准备使预缓存过期，继续取景后再触发快门");
                    listener.status("正在补齐快门前动态 · 请保持构图",false);
                    long warmupDeadline=now()+8_000_000;
                    while(pre.isEmpty() && active && now()<warmupDeadline) {
                        grab();shutterUs=now();pre=ring.preCaptureWindow(shutterUs);
                        if(pre.isEmpty()) Thread.sleep(65);
                    }
                }
                if(!active) throw new IOException("相机已断开，尚未触发快门");
                if(pre.isEmpty()) throw new IOException("取景持续不足，尚未触发快门；请检查实时画面并分享连接诊断");
                if(!demo) camera.clearCaptureEvents();
                listener.status("正在拍摄 · 保留快门前后瞬间",false);
                if(!demo) camera.shutter();
                long deadline=shutterUs+1_500_000;
                while(now()<deadline && active) {grab();Thread.sleep(65);}
                if(!active) throw new IOException("拍摄期间连接中断；请检查机身 SD 卡中的原片");
                List<FrameRing.Frame> fs=new ArrayList<>(pre);fs.addAll(ring.slice(shutterUs+1,deadline));
                short[] capturedAudio=null;
                AudioRing recording=microphone;
                if(recording!=null)try{capturedAudio=recording.slice(shutterUs-FrameRing.PRE_CAPTURE_US,deadline);}catch(IOException e){log(e.getMessage());}
                short[] audioSamples=capturedAudio;
                boolean hasPost=fs.get(fs.size()-1).us>shutterUs+200_000;
                dir=store.create();byte[] still;
                String filename;
                if(demo) {still=demoFrame(shutterUs,2400,1600);filename="DEMO.jpg";}
                else {
                    listener.status("动态已缓存 · 正在接收原尺寸照片",false);
                    int handle=waitForJpeg(baseline);Ptp.ObjectInfo info=camera.objectInfo(handle);filename=info.filename;
                    if(info.size>64*1024*1024L) throw new IOException("照片超过当前 64 MB 接收上限");
                    still=camera.object(handle);
                    if(still.length!=info.size && info.size!=0) throw new IOException("原片长度不符，未生成实况文件");
                }
                Files.write(new File(dir,"original.jpg").toPath(),still);
                JSONObject meta=new JSONObject();meta.put("schema",1);meta.put("demo",demo);meta.put("source",filename);
                meta.put("createdAt",System.currentTimeMillis());meta.put("frames",fs.size());meta.put("maxGapMs",Math.max(FrameRing.maxGap(fs),deadline-fs.get(fs.size()-1).us)/1000);
                meta.put("hasPostFrames",hasPost);meta.put("audio",audioSamples!=null);meta.put("shutterTimeBasis","USB command dispatch; exposure time is approximate");
                long from=shutterUs-FrameRing.PRE_CAPTURE_US,to=deadline;
                long stillUs=Math.round((shutterUs-from)*VideoEncoder.FPS/1_000_000.0)*1_000_000L/VideoEncoder.FPS;
                meta.put("stillUs",stillUs);meta.put("shutterOffsetUs",shutterUs-from);meta.put("durationUs",to-from);
                meta.put("motionQuality","USB preview, not camera-recorded video");
                meta.put("complete",false);meta.put("error","合成尚未完成，已接收的原片可以分享");
                MomentStore.metadata(dir,meta);
                File finalDir=dir;
                listener.status("原片已接收 · 正在合成实况",false);
                exporter.execute(()-> {
                    try {
                        VideoEncoder.encode(fs,from,to,new File(finalDir,"motion.mp4"));
                        if(audioSamples!=null){
                            File withAudio=new File(finalDir,"with-audio.mp4");
                            AudioMux.add(audioSamples,new File(finalDir,"motion.mp4"),withAudio);
                            Files.move(withAudio.toPath(),new File(finalDir,"motion.mp4").toPath(),java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                        }
                        MotionPhoto.write(new File(finalDir,"original.jpg"),new File(finalDir,"motion.mp4"),new File(finalDir,"MOMENT_MP.jpg"),stillUs);
                        meta.put("complete",true);meta.remove("error");MomentStore.metadata(finalDir,meta);listener.saved(finalDir);
                        log("已合成 "+fs.size()+" 帧，最长取景间隔 "+FrameRing.maxGap(fs)/1000+" ms");
                        listener.status(hasPost?"实况已保存":"已保存 · 快门后取景中断，动态末尾有停顿",false);
                    } catch(Exception e) {saveFailure(finalDir,meta,e);fail(e);}
                    finally {busy=false;ring.clear();}
                });
            } catch(Exception e) {if(dir!=null) saveFailure(dir,new JSONObject(),e);busy=false;ring.clear();fail(e);}
        });
    }
    private void saveFailure(File dir,JSONObject meta,Exception error) {
        try {meta.put("complete",false);meta.put("error",error.getMessage());MomentStore.metadata(dir,meta);} catch(Exception ex) {log("失败记录写入失败："+ex.getMessage());}
    }
    private int waitForJpeg(Set<Integer> baseline) throws Exception {
        long deadline=now()+20_000_000;Set<Integer> checked=new HashSet<>();long nextList=now()+500_000;
        while(now()<deadline && active) {
            Integer handle=camera.nextAdded();
            if(handle!=null && checked.add(handle)) {if(camera.objectInfo(handle).jpeg()) return handle;}
            if(baseline!=null && now()>=nextList) {
                for(int h:camera.handles()) if(!baseline.contains(h) && checked.add(h) && camera.objectInfo(h).jpeg()) return h;
                nextList=now()+1_000_000;
            }
            Thread.sleep(80);
        }
        throw new IOException("未找到本次 JPEG。请用单张拍摄和 JPEG/RAW+JPEG，确认 SD 卡可写");
    }
    public void focus(int direction) {
        if(!active || busy || demo) return;
        worker.execute(()-> {try {if(camera!=null) {if(direction==0) camera.autofocus();else camera.focus(direction>0);}} catch(Exception e) {fail(e);}});
    }
    public void refreshExposure() {if(active && !busy && camera!=null) worker.execute(()-> {if(camera!=null) listener.exposure(camera.exposure());});}
    public void disconnect() {worker.execute(this::disconnectNow);}
    public void detach() {UsbS5 c=camera;if(c!=null)c.abort();worker.execute(()->{disconnectNow();listener.status("USB 已拔出 · 照片保留在机身或本机",false);});}
    private void disconnectNow() {
        stopAudio();
        active=false;demo=false;if(polling!=null) polling.cancel(false);polling=null;
        if(camera!=null) camera.close();camera=null;ring.clear();
    }
    private void fail(Exception e) {log(e.getClass().getSimpleName()+": "+e.getMessage());listener.status(e.getMessage()==null?"发生错误，请查看连接诊断":e.getMessage(),false);}
    public void shutdown() {if(shuttingDown)return;shuttingDown=true;worker.execute(this::disconnectNow);worker.shutdown();exporter.shutdown();}
    static long now() {return SystemClock.elapsedRealtimeNanos()/1000;}
    static byte[] demoFrame(long us,int width,int height) {
        Bitmap b=Bitmap.createBitmap(width,height,Bitmap.Config.ARGB_8888);Canvas c=new Canvas(b);Paint p=new Paint(Paint.ANTI_ALIAS_FLAG);
        p.setShader(new LinearGradient(0,0,width,height,0xff779482,0xff182c2c,Shader.TileMode.CLAMP));c.drawRect(0,0,width,height,p);p.setShader(null);
        float t=(us%8_000_000)/8_000_000f,x=width*(.18f+.64f*t);
        p.setColor(0xffe3d9b7);c.drawCircle(width*.7f,height*.25f,height*.11f,p);
        p.setColor(0xff2b4942);c.drawOval(-width*.2f,height*.4f,width*.8f,height*1.4f,p);
        p.setColor(0xff112c29);c.drawOval(width*.3f,height*.55f,width*1.3f,height*1.4f,p);
        p.setColor(0xffd6f58b);c.drawCircle(x,height*.55f+(float)Math.sin(t*Math.PI*2)*height*.08f,height*.026f,p);
        p.setColor(0xffeff3e9);p.setTextSize(height*.036f);p.setTypeface(Typeface.create("sans-serif",Typeface.NORMAL));
        c.drawText("MOMENT / SYNTHETIC DEMO",width*.06f,height*.12f,p);
        ByteArrayOutputStream out=new ByteArrayOutputStream();b.compress(Bitmap.CompressFormat.JPEG,90,out);b.recycle();return out.toByteArray();
    }
}
