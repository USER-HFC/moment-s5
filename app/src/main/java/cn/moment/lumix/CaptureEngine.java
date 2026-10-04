package cn.moment.lumix;

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
        /** Called when a capture directory is kept for diagnostics but the workflow failed. */
        default void failed(File directory,String message) {}
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
    private volatile LutEngine lut;
    /** Object handles captured during session preparation, before a shutter tap. */
    private volatile Set<Integer> preparedHandles;
    /** Changes whenever the camera session is replaced or disconnected. */
    private volatile long sessionEpoch;
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
    public synchronized void setLut(LutEngine value) {lut=value;ring.clear();log(value==null?"LUT 已关闭，正在重建预缓存":"LUT 已启用："+value.title+"，正在重建预缓存");}
    public String lutTitle() {LutEngine value=lut;return value==null?null:value.title;}
    public boolean demoMode() {return demo;}
    public boolean canRemoteCapture() {return active && !busy && !shuttingDown;}
    /** Single shot saved by the camera; no download and never an automatic retry. */
    public void remoteShutter() {
        if(!canRemoteCapture()) {listener.status("相机未连接或正在处理拍摄",false);return;}
        busy=true;
        worker.execute(()-> {
            try {
                if(!active) throw new IOException("相机已断开，未触发快门");
                if(!demo) {
                    if(camera==null) throw new IOException("相机已断开，未触发快门");
                    camera.shutter();
                }
                String result=demo?"演示：遥控快门已触发（未连接机身）":"遥控指令已完成 · 请在机身确认照片";
                log(result);listener.status(result,false);
            } catch(Exception e) {fail(e);}
            finally {ring.clear();busy=false;}
        });
    }
    public void connect(UsbManager manager,UsbDevice device) {
        worker.execute(()-> {
            disconnectNow();listener.status("正在打开 S5 USB 会话…",false);
            try {
                camera=new UsbS5(manager,device,this::log);camera.open();
                // Read the object list while still preparing the session. A slow
                // list must never sit between the user's tap and the shutter.
                try {
                    preparedHandles=Collections.unmodifiableSet(new HashSet<>(camera.handles()));
                    log("已准备快门前照片索引："+preparedHandles.size()+" 个句柄");
                } catch(IOException e) {
                    preparedHandles=null;
                    log("快门前照片索引暂不可用，将仅接受快门后的照片事件："+e.getMessage());
                }
                if(camera.closed()) throw new IOException("照片索引读取使 USB 会话失效，请重新连接相机");
                camera.clearCaptureEvents();
                active=true;demo=false;listener.exposure(camera.exposure());startPolling();
            }
            catch(Exception e) {if(camera!=null) camera.close();camera=null;active=false;fail(e);}
        });
    }
    public void demo() {
        if(busy) {listener.status("正在保存实况，请稍候",false);return;}
        worker.execute(()-> {disconnectNow();preparedHandles=null;demo=true;active=true;log("进入演示：全部图像由 App 生成，不代表 S5 实测");listener.exposure("演示素材 · 无相机连接");startPolling();});
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
        if(bytes!=null) {LutEngine filter=lut;if(filter!=null)try{bytes=filter.applyJpeg(bytes);}catch(IOException e){log("LUT 取景套用失败："+e.getMessage());}long t=now();ring.add(t,bytes);listener.frame(bytes,ring.durationUs(),demo);}
    }
    public boolean ready() {return active && !busy && !ring.preCaptureWindow(now()).isEmpty();}
    public void capture() {
        // Freeze the button boundary before queueing any work. The worker may be
        // delayed by a prior USB operation, but the clip must remain pre-tap.
        long shutterUs=now();
        UsbS5 cameraAtTap=camera;
        boolean demoAtTap=demo;
        long captureEpoch=sessionEpoch;
        List<FrameRing.Frame> pre=ring.preCaptureWindow(shutterUs);
        if(!active || busy || (!demoAtTap && cameraAtTap==null) || pre.isEmpty()) {listener.status("请等待预缓存填满，并确认取景持续更新",false);return;}
        Set<Integer> baseline=preparedHandles;
        busy=true;
        worker.execute(()-> {
            File dir=null;
            try {
                if(!sameSession(captureEpoch,cameraAtTap,demoAtTap)) throw new IOException("相机已断开，尚未触发快门");
                List<FrameRing.Frame> fs=pre;
                long from=shutterUs-FrameRing.PRE_CAPTURE_US,to=shutterUs;
                short[] capturedAudio=null;
                AudioRing recording=microphone;
                // Snapshot audio before the shutter command can block or age out the ring.
                if(recording!=null)try{capturedAudio=recording.slice(from,to);}catch(IOException e){log(e.getMessage());}
                short[] audioSamples=capturedAudio;
                if(!demoAtTap) cameraAtTap.clearCaptureEvents();
                listener.status("正在拍摄 · 已保留快门前 3 秒",false);
                if(!demoAtTap) cameraAtTap.shutter();
                if(!sameSession(captureEpoch,cameraAtTap,demoAtTap)) throw new IOException("拍摄期间连接中断；请检查机身 SD 卡中的原片");
                dir=store.create();byte[] still;
                String filename;
                if(demoAtTap) {still=demoFrame(shutterUs,2400,1600);filename="DEMO.jpg";}
                else {
                    listener.status("动态已缓存 · 正在接收原尺寸照片",false);
                    int handle=waitForJpeg(baseline,captureEpoch,cameraAtTap);Ptp.ObjectInfo info=cameraAtTap.objectInfo(handle);filename=info.filename;
                    if(info.size>64*1024*1024L) throw new IOException("照片超过当前 64 MB 接收上限");
                    still=cameraAtTap.object(handle);
                    if(still.length!=info.size && info.size!=0) throw new IOException("原片长度不符，未生成实况文件");
                    // Refresh the next button boundary after this transfer. This
                    // USB index read is deliberately after the shutter and can
                    // never delay the current capture.
                    try {preparedHandles=Collections.unmodifiableSet(new HashSet<>(cameraAtTap.handles()));}
                    catch(IOException e) {preparedHandles=null;log("下一次拍摄的照片索引暂不可用："+e.getMessage());}
                }
                LutEngine filter=lut;
                // Keep the camera bytes immutable; rendered.jpg is an explicit derivative.
                Files.write(new File(dir,"original.jpg").toPath(),still);
                if(filter!=null) Files.write(new File(dir,"original-camera.jpg").toPath(),still);
                boolean lutApplied=false;
                if(filter!=null){
                    try { Files.write(new File(dir,"rendered.jpg").toPath(),filter.applyJpeg(still)); lutApplied=true; }
                    catch(IOException e) { log("LUT 原片套用失败，保留相机原片："+e.getMessage()); }
                }
                JSONObject meta=new JSONObject();meta.put("schema",1);meta.put("demo",demoAtTap);meta.put("source",filename);
                meta.put("createdAt",System.currentTimeMillis());meta.put("frames",fs.size());meta.put("maxGapMs",Math.max(FrameRing.maxGap(fs),to-fs.get(fs.size()-1).us)/1000);
                meta.put("captureMode","pre-only");meta.put("hasPostFrames",false);meta.put("audio",audioSamples!=null);meta.put("shutterTimeBasis","button-tap pre-shutter buffer snapshot; exposure time is approximate");
                meta.put("lut",lutApplied?filter.title:JSONObject.NULL);meta.put("lutApplied",lutApplied);
                // The still marker uses the last encoded sample, never an out-of-range end timestamp.
                long stillUs=((long)Math.ceil((to-from)*VideoEncoder.FPS/1_000_000.0)-1)*1_000_000L/VideoEncoder.FPS;
                meta.put("stillUs",stillUs);meta.put("shutterOffsetUs",shutterUs-from);meta.put("durationUs",to-from);
                meta.put("motionQuality","USB preview, not camera-recorded video");
                meta.put("complete",false);meta.put("error","合成尚未完成，已接收的原片可以分享");
                MomentStore.metadata(dir,meta);
                File finalDir=dir; final boolean rendered=lutApplied;
                listener.status("原片已接收 · 正在合成实况",false);
                exporter.execute(()-> {
                    try {
                        VideoEncoder.encode(fs,from,to,new File(finalDir,"motion.mp4"));
                        if(audioSamples!=null){
                            File withAudio=new File(finalDir,"with-audio.mp4");
                            AudioMux.add(audioSamples,new File(finalDir,"motion.mp4"),withAudio);
                            Files.move(withAudio.toPath(),new File(finalDir,"motion.mp4").toPath(),java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                        }
                        MotionPhoto.write(new File(finalDir,rendered?"rendered.jpg":"original.jpg"),new File(finalDir,"motion.mp4"),new File(finalDir,"MOMENT_MP.jpg"),stillUs);
                        meta.put("complete",true);meta.remove("error");MomentStore.metadata(finalDir,meta);listener.saved(finalDir);
                        log("已合成 "+fs.size()+" 帧，最长取景间隔 "+FrameRing.maxGap(fs)/1000+" ms");
                        listener.status("实况已保存",false);
                    } catch(Exception e) {saveFailure(finalDir,meta,e);listener.failed(finalDir,e.getMessage());fail(e);}
                    finally {busy=false;ring.clear();}
                });
            } catch(Exception e) {if(dir!=null) {saveFailure(dir,new JSONObject(),e);listener.failed(dir,e.getMessage());}busy=false;ring.clear();fail(e);}
        });
    }
    private void saveFailure(File dir,JSONObject meta,Exception error) {
        try {meta.put("complete",false);meta.put("error",error.getMessage());MomentStore.metadata(dir,meta);} catch(Exception ex) {log("失败记录写入失败："+ex.getMessage());}
    }
    private int waitForJpeg(Set<Integer> baseline,long epoch,UsbS5 session) throws Exception {
        // The S5 may finish writing a high-resolution JPEG well after the shutter
        // response. Keep polling the object list when a safe baseline exists.
        // Without it, only an event observed after clearCaptureEvents() is safe;
        // selecting the highest old handle can pair the wrong still.
        long deadline=now()+60_000_000;Set<Integer> rejected=new HashSet<>();Set<Integer> pendingEvents=new HashSet<>();long nextList=now();
        while(now()<deadline && sameSession(epoch,session,false)) {
            Integer eventHandle=session.nextAdded();
            if(eventHandle!=null) pendingEvents.add(eventHandle);
            for(Iterator<Integer> it=pendingEvents.iterator();it.hasNext();) {
                int handle=it.next();
                try {
                    Ptp.ObjectInfo info=session.objectInfo(handle);
                    if(info.jpeg() && (baseline==null || !baseline.contains(handle))) return handle;
                    rejected.add(handle);it.remove();
                } catch(IOException e) {log("收到照片事件但暂时无法读取索引 "+handle+"："+e.getMessage());}
            }
            if(baseline!=null && now()>=nextList) {
                Set<Integer> handles;
                try {handles=session.handles();}
                catch(IOException e) {log("照片索引暂不可用，继续等待："+e.getMessage());nextList=now()+500_000;Thread.sleep(80);continue;}
                Set<Integer> jpegHandles=new HashSet<>();
                for(int h:handles) {
                    if(rejected.contains(h) || (baseline!=null && baseline.contains(h))) continue;
                    try {
                        Ptp.ObjectInfo info=session.objectInfo(h);
                        if(!info.jpeg()) {rejected.add(h);continue;}
                        jpegHandles.add(h);
                    } catch(IOException e) {log("照片索引暂不可读 "+h+"："+e.getMessage());}
                }
                Integer newest=FrameRing.newestFreshHandle(jpegHandles,baseline);
                if(newest!=null) return newest;
                nextList=now()+1_000_000;
            }
            Thread.sleep(80);
        }
        if(!sameSession(epoch,session,false)) throw new IOException("拍摄期间连接中断；请检查机身 SD 卡中的原片");
        throw new IOException(baseline==null
                ? "未找到本次 JPEG。未获得快门前照片索引，且相机未提供可确认的新照片事件；未使用旧文件，请重试"
                : "未找到本次 JPEG。请用单张拍摄和 JPEG/RAW+JPEG，确认 SD 卡可写；相机可能仍在写入，请重试");
    }
    private boolean sameSession(long epoch,UsbS5 expected,boolean expectedDemo) {
        return active && sessionEpoch==epoch && (expectedDemo ? demo : expected!=null && camera==expected && !expected.closed());
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
        sessionEpoch++;active=false;demo=false;preparedHandles=null;if(polling!=null) polling.cancel(false);polling=null;
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
