package cn.moment.lumix;

import android.hardware.usb.UsbDevice;
import android.hardware.usb.UsbManager;
import java.io.*;
import java.nio.file.Files;
import java.util.*;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Existing USB protocol and file-selection behavior, behind the shared interface. */
public final class UsbS5Transport implements CameraTransport {
    private final UsbS5 usb;
    private final Consumer<String> log;
    /** Handles and the newest Lumix sequence saved in this camera session. */
    private final Set<Integer> savedHandles=new HashSet<>();
    private int newestSavedSequence=-1;
    private String newestSavedName="";
    private record Handles(Set<Integer> values) implements Baseline {}
    private record Shot(int handle,String filename,long size,int sequence) {}
    /** {@code P} + folder + file, e.g. {@code P1010001.JPG}. A handle is not this order. */
    private static final Pattern LUMIX_NAME=Pattern.compile("(?i)^P(\\d{3})(\\d{4})\\.JPE?G$");
    static int lumixSequence(String filename) {
        if(filename==null) return -1;
        Matcher matcher=LUMIX_NAME.matcher(filename.trim());
        if(!matcher.matches()) return -1;
        return Integer.parseInt(matcher.group(1))*10000+Integer.parseInt(matcher.group(2));
    }
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
    public Baseline prepareCaptureBaseline() throws IOException {return new Handles(Collections.unmodifiableSet(new HashSet<>(usb.handles())));}
    public void clearCaptureEvents() {usb.clearCaptureEvents();}
    public void shutter() throws IOException {usb.shutter();}
    public void noteSaved(Original photo) {
        if(photo==null) return;
        if(photo.key() instanceof Integer handle) savedHandles.add(handle);
        int sequence=lumixSequence(photo.filename());
        if(sequence>newestSavedSequence) {newestSavedSequence=sequence;newestSavedName=photo.filename();}
    }
    public Original awaitNewJpeg(Baseline before,BooleanSupplier valid) throws Exception {
        Set<Integer> baseline=before==null?null:((Handles)before).values;
        log.accept(baseline==null?"快门前照片索引不可用":"快门前照片索引 "+baseline.size()+" 个");
        long deadline=now()+60_000_000,nextList=now();
        // Not-yet-JPEG objects stay here. A permanent skip used to drop the file still
        // being written and pair the previous JPEG instead.
        Set<Integer> pendingEvents=new HashSet<>(),holdFormat=new HashSet<>();
        Map<Integer,String> eventLogged=new HashMap<>();
        Shot previous=null;
        while(now()<deadline && valid.getAsBoolean()) {
            Integer eventHandle=usb.nextAdded();
            if(eventHandle!=null) {pendingEvents.add(eventHandle);holdFormat.remove(eventHandle);}
            boolean listDue=baseline!=null && now()>=nextList;
            for(Iterator<Integer> it=pendingEvents.iterator();it.hasNext();) {
                int handle=it.next();
                if(holdFormat.contains(handle) && baseline!=null && !listDue) continue;
                Ptp.ObjectInfo info;
                try {info=usb.objectInfo(handle);}
                catch(IOException e) {holdFormat.add(handle);logEvent(eventLogged,handle,"照片事件 句柄 "+handle+" 暂时读不到格式："+e.getMessage());continue;}
                logEvent(eventLogged,handle,String.format(Locale.ROOT,"照片事件 句柄 %d 格式 0x%04X 文件 %s",handle,info.format,info.filename));
                if(!info.jpeg()) {holdFormat.add(handle);continue;}
                holdFormat.remove(handle);
                if(baseline!=null && baseline.contains(handle)) {it.remove();continue;}
                if(savedHandles.contains(handle)) {log.accept("照片事件 句柄 "+handle+" 不选：本会话已保存");it.remove();continue;}
                String skip=sequenceSkip(info.filename);
                if(skip!=null) {log.accept("照片事件 句柄 "+handle+" 不选："+skip);it.remove();continue;}
                // One event can name an older object. Until this session has saved a photo,
                // only two identical listings may accept. A higher Lumix sequence than that
                // saved photo is the shutter just released.
                if(baseline==null || newestSavedSequence>=0) {
                    log.accept("本次照片选中句柄 "+handle+" "+info.filename+"：照片事件确认的新 JPEG");
                    return new Original(handle,info.filename,info.size);
                }
                it.remove();
            }
            if(listDue) {
                Shot chosen;
                try {chosen=listedShot(baseline);}
                catch(IOException e) {log.accept("照片索引暂不可用，继续等待："+e.getMessage());previous=null;nextList=now()+500_000;Thread.sleep(80);continue;}
                if(chosen!=null && previous!=null && chosen.handle==previous.handle && chosen.filename.equals(previous.filename)) {
                    log.accept("本次照片选中句柄 "+chosen.handle+" "+chosen.filename+"：连续两次索引一致，文件名序号最新");
                    return new Original(chosen.handle,chosen.filename,chosen.size);
                }
                previous=chosen;
                nextList=now()+1_000_000;
            }
            Thread.sleep(80);
        }
        if(!valid.getAsBoolean())throw new IOException("拍摄期间连接中断；请检查机身 SD 卡中的原片");
        throw new IOException(baseline==null
            ? "未找到本次 JPEG。未获得快门前照片索引，且相机未提供可确认的新照片事件；未使用旧文件，请重试"
            : "未找到本次 JPEG。请用单张拍摄和 JPEG/RAW+JPEG，确认 SD 卡可写；相机可能仍在写入，请重试");
    }
    private void logEvent(Map<Integer,String> seen,int handle,String message) {
        if(!message.equals(seen.put(handle,message))) log.accept(message);
    }
    /** Null when this filename is a Lumix JPEG newer than every photo saved this session. */
    private String sequenceSkip(String filename) {
        int sequence=lumixSequence(filename);
        if(sequence<0) return "不是 Lumix 文件名序号";
        if(newestSavedSequence>=0 && sequence<=newestSavedSequence) return "文件名序号不大于已保存的 "+(newestSavedName.isEmpty()?Integer.toString(newestSavedSequence):newestSavedName);
        return null;
    }
    /** Newest new JPEG, or null when this listing is not safe to pair. */
    private Shot listedShot(Set<Integer> baseline) throws IOException {
        List<Integer> handles=new ArrayList<>(usb.handles());
        handles.sort(Integer::compareUnsigned);
        List<Shot> choices=new ArrayList<>();
        StringBuilder line=new StringBuilder();
        for(int handle:handles) {
            if(baseline.contains(handle)) continue;
            Ptp.ObjectInfo info;
            try {info=usb.objectInfo(handle);}
            catch(IOException e) {log.accept("照片索引暂不可读 句柄 "+handle+"："+e.getMessage());continue;}
            if(line.length()>0) line.append('；');
            if(!info.jpeg()) {line.append(String.format(Locale.ROOT,"句柄 %d 格式 0x%04X 文件 %s（还不是 JPEG）",handle,info.format,info.filename));continue;}
            line.append("句柄 ").append(handle).append(' ').append(info.filename);
            if(savedHandles.contains(handle)) {line.append("（本会话已保存，跳过）");continue;}
            String skip=sequenceSkip(info.filename);
            if(skip!=null) {line.append('（').append(skip).append("，跳过）");continue;}
            choices.add(new Shot(handle,info.filename,info.size,lumixSequence(info.filename)));
        }
        log.accept(line.length()==0?"照片索引新增候选：（无）":"照片索引新增候选："+line);
        Shot best=null;
        for(Shot shot:choices) {
            if(best==null || shot.sequence>best.sequence) best=shot;
            else if(shot.sequence==best.sequence) {log.accept("多个候选文件名序号相同，不配对");return null;}
        }
        return best;
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
