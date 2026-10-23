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
import java.util.concurrent.atomic.AtomicLong;

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
    private volatile CameraTransport camera;
    private volatile String transport="usb";
    private volatile String exposureValue="";
    private volatile long exposureReadUs;
    private volatile AudioRing microphone;
    private volatile boolean audioEnabled;
    private volatile boolean demo,busy,shuttingDown;
    private volatile boolean active;
    private volatile LutEngine lut;
    /** Object handles captured during session preparation, before a shutter tap. */
    private volatile CameraTransport.Baseline preparedHandles;
    /** Changes whenever the camera session is replaced or disconnected. */
    private final AtomicLong sessionEpoch=new AtomicLong();
    private ScheduledFuture<?> polling;
    private final List<String> logs=Collections.synchronizedList(new ArrayList<>());
    /** Stable accctrl identity, so the body recognises this install after it was approved once. */
    private final File wifiClientId;
    public CaptureEngine(Context c,Listener listener) {store=new MomentStore(c);this.listener=listener;wifiClientId=new File(c.getFilesDir(),"wifi-client-id");}
    private void log(String s) {
        synchronized(logs) {logs.add(String.format(Locale.US,"%d %s",SystemClock.elapsedRealtime(),s));if(logs.size()>250) logs.remove(0);}
        listener.log(s);
    }
    public String diagnostics() {synchronized(logs){return String.join("\n",logs);}}
    public boolean busy() {return busy;}
    public void audio(boolean enabled) {audioEnabled=enabled;if(!enabled)stopAudio();if(!worker.isShutdown())worker.execute(()->{stopAudio();if(active)startAudio();});}
    public boolean audioEnabled() {return audioEnabled;}
    private synchronized void startAudio() {if(audioEnabled && active && !shuttingDown){try{microphone=new AudioRing();microphone.start();log("环境声录制已开启");}catch(Exception e){stopAudio();log("收音不可用，本次为无声："+e.getMessage());}}}
    public synchronized void stopAudio() {if(microphone!=null){microphone.close();microphone=null;}}
    public boolean canFocus() {return active && !demo && !busy && camera!=null;}
    public String transportKind() {return demo?"demo":transport;}
    public boolean supportsAutofocus() {return camera!=null && camera.capabilities().autofocus();}
    public boolean supportsManualFocus() {return camera!=null && camera.capabilities().manualFocus();}
    public String exposureValue() {if(!active)return "";if(demo)return "演示素材 · 无相机连接";CameraTransport current=camera;return current!=null && "wifi".equals(current.kind())?current.exposure():exposureValue;}
    /** Cached reads only: neither a JS state request nor a preview event issues camera I/O. */
    public long exposureAgeMs() {
        if(!active || demo)return -1;
        CameraTransport current=camera;
        long sampled=current!=null && "wifi".equals(current.kind())?current.exposureUpdatedAtUs():exposureReadUs;
        return sampled<=0?-1:Math.max(0,now()-sampled)/1000;
    }
    public boolean active() {return active;}
    public synchronized void setLut(LutEngine value) {if(busy)throw new IllegalStateException("拍摄处理中，请稍后再切换 LUT");lut=value;ring.clear();log(value==null?"LUT 已关闭，正在重建预缓存":"LUT 已启用："+value.title+"，正在重建预缓存");}
    public String lutTitle() {LutEngine value=lut;return value==null?null:value.title;}
    public boolean demoMode() {return demo;}
    public boolean canRemoteCapture() {return active && !busy && !shuttingDown;}
    /** Single shot saved by the camera; no download and never an automatic retry. */
    public synchronized void remoteShutter() {
        if(!canRemoteCapture()) {listener.status("相机未连接或正在处理拍摄",false);return;}
        busy=true;
        long epoch=sessionEpoch.get();CameraTransport session=camera;boolean synthetic=demo;
        // A remote shot can appear in the index later. The old baseline is no longer safe.
        preparedHandles=null;
        worker.execute(()-> {
            String result=null;Exception failure=null;
            try {
                if(!sameSession(epoch,session,synthetic)) throw new IOException("相机已断开，未触发快门");
                if(!synthetic) {
                    CameraTransport.Baseline before=session.freshBaselineRequired()?session.prepareCaptureBaseline():null;
                    if(!sameSession(epoch,session,false))throw new IOException("相机已断开，未触发快门");
                    session.shutter();
                    if(session.freshBaselineRequired()){session.awaitNewJpeg(before,()->sameSession(epoch,session,false));session.completeWithoutDownload();}
                }
                result=synthetic?"演示：遥控快门已触发（未连接机身）":"遥控指令已完成 · 请在机身确认照片";
                log(result);
            } catch(Exception e) {failure=e;}
            finally {ring.clear();busy=false;}
            if(failure!=null)fail(failure);else listener.status(result,false);
        });
    }
    public void connect(UsbManager manager,UsbDevice device) {
        connectTransport(()->new UsbS5Transport(manager,device,this::log),"usb","正在打开 S5 USB 会话…");
    }
    public void connectWifi(WifiCameraHttp.Route route,String endpoint,int port,boolean debug) {
        connectTransport(()->new WifiS5Transport(route,endpoint,port,debug,WifiS5Protocol.clientId(wifiClientId),this::log,CaptureEngine::now),"wifi","正在连接 Wi-Fi（实验）· 请在机身确认…");
    }
    private interface TransportFactory {CameraTransport create() throws Exception;}
    private void connectTransport(TransportFactory factory,String kind,String message) {
        if(busy || shuttingDown) {listener.status("正在保存实况，请稍候",false);return;}
        long requestedEpoch=sessionEpoch.get();
        worker.execute(()-> {
            if(busy || shuttingDown || requestedEpoch!=sessionEpoch.get()) return;
            disconnectNow();transport=kind;listener.status(message,false);
            long connectingEpoch=sessionEpoch.get();
            try {
                camera=factory.create();
                if(connectingEpoch!=sessionEpoch.get()) throw new IOException("相机连接已取消");
                camera.open();
                // Read the object list while still preparing the session. A slow
                // list must never sit between the user's tap and the shutter.
                try {
                    preparedHandles=camera.prepareCaptureBaseline();
                    log("已准备快门前照片索引");
                } catch(IOException e) {
                    if(camera.freshBaselineRequired())throw new IOException("Wi-Fi 未能建立完整快门前目录基线；未发送快门："+e.getMessage(),e);
                    preparedHandles=null;
                    log("快门前照片索引暂不可用，将仅接受快门后的照片事件："+e.getMessage());
                }
                if(camera.closed() || connectingEpoch!=sessionEpoch.get()) throw new IOException("相机会话已失效或连接已取消，请重新连接相机");
                camera.clearCaptureEvents();
                active=true;demo=false;exposureValue=camera.exposure();exposureReadUs=now();listener.exposure(exposureValue);
                if(camera.closed() || connectingEpoch!=sessionEpoch.get()) throw new IOException("相机连接已取消");
                startPolling();
            }
            catch(Exception e) {if(camera!=null) camera.close();camera=null;active=false;fail(e);}
        });
    }
    public void demo() {
        if(busy || shuttingDown) {listener.status("正在保存实况，请稍候",false);return;}
        long requestedEpoch=sessionEpoch.get();
        worker.execute(()-> {if(busy || shuttingDown || requestedEpoch!=sessionEpoch.get())return;disconnectNow();preparedHandles=null;demo=true;active=true;log("进入演示：全部图像由 App 生成，不代表 S5 实测");listener.exposure("演示素材 · 无相机连接");startPolling();});
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
        CameraTransport.Preview frame=demo?new CameraTransport.Preview(demoFrame(now(),960,640),now()):(camera==null?null:camera.preview());
        if(frame!=null) {byte[] bytes=frame.jpeg();LutEngine filter=lut;if(filter!=null)try{bytes=filter.applyJpeg(bytes);}catch(IOException e){log("LUT 取景套用失败："+e.getMessage());}synchronized(this){if(!active || busy || filter!=lut)return;ring.add(frame.receivedUs(),bytes);listener.frame(bytes,ring.durationUs(),demo);}}
    }
    public boolean ready() {return active && !busy && !ring.preCaptureWindow(now()).isEmpty();}
    public void capture() {capture(true);}
    /** Retrieve this shutter's JPEG without requiring preview frames or creating video. */
    public void captureStill() {capture(false);}
    private synchronized void capture(boolean motion) {
        // Freeze the button boundary before queueing any work. The worker may be
        // delayed by a prior USB operation, but the clip must remain pre-tap.
        long shutterUs=now();
        CameraTransport cameraAtTap=camera;
        boolean demoAtTap=demo;
        LutEngine filter=lut;
        long captureEpoch=sessionEpoch.get();
        List<FrameRing.Frame> pre=motion?ring.preCaptureWindow(shutterUs):Collections.emptyList();
        if(!active || busy || shuttingDown || (!demoAtTap && cameraAtTap==null) || (motion && pre.isEmpty())) {listener.status(motion?"请等待预缓存填满，并确认取景持续更新":"相机未连接或正在处理拍摄",false);return;}
        CameraTransport.Baseline baseline=preparedHandles;
        busy=true;
        worker.execute(()-> {
            File dir=null;JSONObject meta=new JSONObject();
            try {
                if(!sameSession(captureEpoch,cameraAtTap,demoAtTap)) throw new IOException("相机已断开，尚未触发快门");
                List<FrameRing.Frame> fs=pre;
                long from=shutterUs-FrameRing.PRE_CAPTURE_US,to=shutterUs;
                short[] capturedAudio=null;
                AudioRing recording=motion?microphone:null;
                // Snapshot audio before the shutter command can block or age out the ring.
                if(recording!=null)try{capturedAudio=recording.slice(from,to);}catch(IOException e){log(e.getMessage());}
                short[] audioSamples=capturedAudio;
                CameraTransport.Baseline captureBaseline=baseline;
                if(!demoAtTap && cameraAtTap.freshBaselineRequired())captureBaseline=cameraAtTap.prepareCaptureBaseline();
                if(!sameSession(captureEpoch,cameraAtTap,demoAtTap))throw new IOException("相机已断开，尚未触发快门");
                if(!demoAtTap) cameraAtTap.clearCaptureEvents();
                listener.status(motion?"正在拍摄 · 已保留快门前 3 秒":"正在拍摄照片",false);
                if(!demoAtTap) cameraAtTap.shutter();
                if(!sameSession(captureEpoch,cameraAtTap,demoAtTap)) throw new IOException("拍摄期间连接中断；请检查机身 SD 卡中的原片");
                dir=store.create();meta.put("schema",1);meta.put("demo",demoAtTap);
                meta.put("createdAt",System.currentTimeMillis());meta.put("captureMode",motion?"pre-only":"photo");
                meta.put("mediaType",motion?"motion":"photo");meta.put("lutRequested",filter==null?JSONObject.NULL:filter.title);
                meta.put("lut",JSONObject.NULL);meta.put("lutApplied",false);meta.put("complete",false);
                meta.put("frames",pre.size());meta.put("durationUs",motion?FrameRing.PRE_CAPTURE_US:0);meta.put("audio",false);meta.put("hasPostFrames",false);
                meta.put("transport",demoAtTap?"demo":cameraAtTap.kind());
                meta.put("experimentalWifi",!demoAtTap && cameraAtTap.kind().equals("wifi"));
                String filename;
                File original=new File(dir,"original.jpg");
                if(demoAtTap) {Files.write(original.toPath(),demoFrame(shutterUs,2400,1600));filename="DEMO.jpg";}
                else {
                    listener.status(motion?"动态已缓存 · 正在接收原尺寸照片":"正在接收原尺寸照片",false);
                    CameraTransport.Original source=cameraAtTap.awaitNewJpeg(captureBaseline,()->sameSession(captureEpoch,cameraAtTap,false));filename=source.filename();
                    meta.put("source",filename);MomentStore.metadata(dir,meta);
                    File part=new File(dir,"original.jpg.part");
                    try {
                        cameraAtTap.downloadOriginal(source,part);
                        Files.move(part.toPath(),original.toPath(),java.nio.file.StandardCopyOption.ATOMIC_MOVE);
                    } finally {Files.deleteIfExists(part.toPath());}
                    // Refresh the next button boundary after this transfer. This
                    // USB index read is deliberately after the shutter and can
                    // never delay the current capture.
                    try {preparedHandles=cameraAtTap.prepareCaptureBaseline();}
                    catch(IOException e) {preparedHandles=null;log("下一次拍摄的照片索引暂不可用："+e.getMessage());}
                }
                meta.put("source",filename);MomentStore.metadata(dir,meta);
                // Keep the camera bytes immutable; rendered.jpg is an explicit derivative.
                boolean lutApplied=false;
                if(filter!=null){
                    byte[] still=Files.readAllBytes(original.toPath());
                    if(motion)Files.write(new File(dir,"original-camera.jpg").toPath(),still);
                    File part=new File(dir,"rendered.jpg.part");
                    try {
                        Files.write(part.toPath(),filter.applyJpeg(still));
                        Files.move(part.toPath(),new File(dir,"rendered.jpg").toPath(),java.nio.file.StandardCopyOption.ATOMIC_MOVE);
                        lutApplied=true;
                    }
                    catch(IOException e) {if(!motion)throw new IOException("LUT 处理失败，原片已保留："+e.getMessage(),e);log("LUT 原片套用失败，保留相机原片："+e.getMessage());}
                    finally {Files.deleteIfExists(part.toPath());}
                }
                meta.put("schema",1);meta.put("demo",demoAtTap);meta.put("source",filename);
                meta.put("frames",fs.size());meta.put("maxGapMs",motion?Math.max(FrameRing.maxGap(fs),to-fs.get(fs.size()-1).us)/1000:0);
                meta.put("hasPostFrames",false);meta.put("audio",audioSamples!=null);meta.put("shutterTimeBasis",motion?"button-tap pre-shutter buffer snapshot; exposure time is approximate":"button-tap request; camera exposure time is approximate");
                meta.put("lut",lutApplied?filter.title:JSONObject.NULL);meta.put("lutApplied",lutApplied);
                if(!motion) {
                    meta.put("durationUs",0);meta.put("complete",true);meta.remove("error");MomentStore.metadata(dir,meta);
                    ring.clear();busy=false;listener.saved(dir);listener.status("照片已保存",false);return;
                }
                // The still marker uses the last encoded sample, never an out-of-range end timestamp.
                long stillUs=((long)Math.ceil((to-from)*VideoEncoder.FPS/1_000_000.0)-1)*1_000_000L/VideoEncoder.FPS;
                meta.put("stillUs",stillUs);meta.put("shutterOffsetUs",shutterUs-from);meta.put("durationUs",to-from);
                meta.put("transport",demoAtTap?"demo":cameraAtTap.kind());
                meta.put("experimentalWifi",!demoAtTap && cameraAtTap.kind().equals("wifi"));
                meta.put("motionQuality",demoAtTap?"synthetic demo":cameraAtTap.kind().equals("wifi")?"experimental unverified Wi-Fi preview, not camera-recorded video":"USB preview, not camera-recorded video");
                meta.put("complete",false);meta.put("error","合成尚未完成，已接收的原片可以分享");
                MomentStore.metadata(dir,meta);
                File finalDir=dir; final boolean rendered=lutApplied;
                listener.status("原片已接收 · 正在合成实况",false);
                exporter.execute(()-> {
                    Exception failure=null;
                    try {
                        VideoEncoder.encode(fs,from,to,new File(finalDir,"motion.mp4"));
                        if(audioSamples!=null){
                            File withAudio=new File(finalDir,"with-audio.mp4");
                            AudioMux.add(audioSamples,new File(finalDir,"motion.mp4"),withAudio);
                            Files.move(withAudio.toPath(),new File(finalDir,"motion.mp4").toPath(),java.nio.file.StandardCopyOption.REPLACE_EXISTING);
                        }
                        MotionPhoto.write(new File(finalDir,rendered?"rendered.jpg":"original.jpg"),new File(finalDir,"motion.mp4"),new File(finalDir,"MOMENT_MP.jpg"),stillUs);
                        meta.put("complete",true);meta.remove("error");MomentStore.metadata(finalDir,meta);
                    } catch(Exception e) {saveFailure(finalDir,meta,e);failure=e;}
                    finally {ring.clear();busy=false;}
                    // Observers must see the completed state when the result event arrives.
                    if(failure!=null) {listener.failed(finalDir,failure.getMessage());fail(failure);}
                    else {listener.saved(finalDir);log("已合成 "+fs.size()+" 帧，最长取景间隔 "+FrameRing.maxGap(fs)/1000+" ms");listener.status("实况已保存",false);}
                });
            } catch(Exception e) {if(dir!=null)saveFailure(dir,meta,e);ring.clear();busy=false;if(dir!=null)listener.failed(dir,e.getMessage());fail(e);}
        });
    }
    private void saveFailure(File dir,JSONObject meta,Exception error) {
        try {meta.put("complete",false);meta.put("error",error.getMessage()==null?"照片处理失败，已接收的原片保留":error.getMessage());MomentStore.metadata(dir,meta);} catch(Exception ex) {log("失败记录写入失败："+ex.getMessage());}
    }
    private boolean sameSession(long epoch,CameraTransport expected,boolean expectedDemo) {
        return active && sessionEpoch.get()==epoch && (expectedDemo ? demo : expected!=null && camera==expected && !expected.closed());
    }
    public void focus(int direction) {
        if(!active || busy || demo) return;
        worker.execute(()-> {try {if(camera!=null) {if(direction==0) camera.autofocus();else camera.focus(direction>0);}} catch(Exception e) {fail(e);}});
    }
    public void refreshExposure() {
        CameraTransport current=camera;long epoch=sessionEpoch.get();
        if(active && !busy && current!=null && !worker.isShutdown())worker.execute(()-> {
            if(busy || !sameSession(epoch,current,false))return;
            String value=current.exposure();
            if(sameSession(epoch,current,false)){exposureValue=value;exposureReadUs=now();listener.exposure(value);}
        });
    }
    public void disconnect() {
        // Invalidate queued shutters and unblock USB reads before waiting for the worker.
        sessionEpoch.incrementAndGet();active=false;demo=false;preparedHandles=null;exposureValue="";exposureReadUs=0;
        CameraTransport c=camera;if(c!=null)c.abort();stopAudio();
        if(!worker.isShutdown())worker.execute(()->disconnectNow(false));
    }
    public void detach() {if(!"usb".equals(transport))return;disconnect();if(!worker.isShutdown())worker.execute(()->listener.status("USB 已拔出 · 照片保留在机身或本机",false));}
    private void disconnectNow() {
        disconnectNow(true);
    }
    private void disconnectNow(boolean invalidate) {
        stopAudio();
        if(invalidate)sessionEpoch.incrementAndGet();active=false;demo=false;preparedHandles=null;exposureValue="";exposureReadUs=0;if(polling!=null) polling.cancel(false);polling=null;
        if(camera!=null) camera.close();camera=null;ring.clear();
    }
    private void fail(Exception e) {log(e.getClass().getSimpleName()+": "+e.getMessage());listener.status(e.getMessage()==null?"发生错误，请查看连接诊断":e.getMessage(),false);}
    public synchronized void shutdown() {if(shuttingDown)return;shuttingDown=true;disconnect();worker.shutdown();exporter.shutdown();}
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
