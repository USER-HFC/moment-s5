package cn.moment.lumix;

import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbManager;
import java.io.*;
import java.nio.file.Files;
import java.util.*;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

/** Existing USB protocol and file-selection behavior, behind the shared interface. */
public final class UsbS5Transport implements CameraTransport {
    private final UsbS5 usb;
    private final Consumer<String> log;
    private record Handles(Set<Integer> values) implements Baseline {}
    public UsbS5Transport(UsbManager manager,UsbDevice device,Consumer<String> log) throws IOException {
        usb=new UsbS5(manager,device,log);this.log=log;
    }
    /** Same monotonic microsecond clock as CaptureEngine.now(). */
    private static long now() {return android.os.SystemClock.elapsedRealtimeNanos()/1000;}
    public String kind() {return "usb";}
    public void open() throws IOException {usb.open();}
    public Preview preview() throws IOException {byte[] bytes=usb.preview();return bytes==null?null:new Preview(bytes,now());}
    public Capabilities capabilities() {return new Capabilities(true,true,true);}
    public void autofocus() throws IOException {usb.autofocus();}
    public void focus(boolean far) throws IOException {usb.focus(far);}
    public String exposure() {return usb.exposure();}
    public boolean exposureChanged() {return usb.exposureChanged();}
    public void clearExposureChanged() {usb.clearExposureChanged();}
    public Baseline prepareCaptureBaseline() throws IOException {return new Handles(Collections.unmodifiableSet(new HashSet<>(usb.handles())));}
    public void clearCaptureEvents() {usb.clearCaptureEvents();}
    public void shutter() throws IOException {usb.shutter();}
    public Original awaitNewJpeg(Baseline before,BooleanSupplier valid) throws Exception {
        Set<Integer> baseline=before==null?null:((Handles)before).values;
        long deadline=now()+60_000_000,nextList=now();
        Set<Integer> rejected=new HashSet<>(),pendingEvents=new HashSet<>();
        while(now()<deadline && valid.getAsBoolean()) {
            Integer eventHandle=usb.nextAdded();if(eventHandle!=null)pendingEvents.add(eventHandle);
            for(Iterator<Integer> it=pendingEvents.iterator();it.hasNext();) {
                int handle=it.next();
                try {Ptp.ObjectInfo info=usb.objectInfo(handle);
                    if(info.jpeg() && (baseline==null || !baseline.contains(handle)))return new Original(handle,info.filename,info.size);
                    rejected.add(handle);it.remove();
                } catch(IOException e) {log.accept("收到照片事件但暂时无法读取索引 "+handle+"："+e.getMessage());}
            }
            if(baseline!=null && now()>=nextList) {
                Set<Integer> handles;
                try {handles=usb.handles();}
                catch(IOException e) {log.accept("照片索引暂不可用，继续等待："+e.getMessage());nextList=now()+500_000;Thread.sleep(80);continue;}
                Set<Integer> jpegHandles=new HashSet<>();
                for(int handle:handles) {
                    if(rejected.contains(handle)||baseline.contains(handle))continue;
                    try {if(!usb.objectInfo(handle).jpeg()){rejected.add(handle);continue;}jpegHandles.add(handle);}
                    catch(IOException e) {log.accept("照片索引暂不可读 "+handle+"："+e.getMessage());}
                }
                Integer newest=FrameRing.newestFreshHandle(jpegHandles,baseline);
                if(newest!=null){Ptp.ObjectInfo info=usb.objectInfo(newest);return new Original(newest,info.filename,info.size);}
                nextList=now()+1_000_000;
            }
            Thread.sleep(80);
        }
        if(!valid.getAsBoolean())throw new IOException("拍摄期间连接中断；请检查机身 SD 卡中的原片");
        throw new IOException(baseline==null
            ? "未找到本次 JPEG。未获得快门前照片索引，且相机未提供可确认的新照片事件；未使用旧文件，请重试"
            : "未找到本次 JPEG。请用单张拍摄和 JPEG/RAW+JPEG，确认 SD 卡可写；相机可能仍在写入，请重试");
    }
    public void downloadOriginal(Original original,File destination) throws IOException {
        if(original.size()>64*1024*1024L)throw new IOException("照片超过当前 64 MB 接收上限");
        byte[] bytes=usb.object((Integer)original.key());
        if(original.size()!=0 && bytes.length!=original.size())throw new IOException("原片长度不符，未生成实况文件");
        Files.write(destination.toPath(),bytes);
    }
    public boolean reportsNewPhotos(){return usb.hasEvents();}
    public Original nextCameraPhoto(Baseline before,Set<Object> saved) throws IOException {
        Set<Integer> known=before==null?Set.of():((Handles)before).values;
        for(Integer handle;(handle=usb.nextAdded())!=null;) {
            if(known.contains(handle) || saved.contains(handle))continue; // e.g. a second event for a photo already saved
            Ptp.ObjectInfo info=usb.objectInfo(handle);
            if(info.jpeg())return new Original(handle,info.filename,info.size); // RAW of a RAW+JPEG pair is skipped
        }
        return null;
    }
    public Baseline withPhoto(Baseline before,Original photo) {
        Set<Integer> values=new HashSet<>(before==null?Set.of():((Handles)before).values);values.add((Integer)photo.key());
        return new Handles(Collections.unmodifiableSet(values));
    }
    public boolean closed(){return usb.closed();}
    public void abort(){usb.abort();}
    public void close(){usb.close();}
}
