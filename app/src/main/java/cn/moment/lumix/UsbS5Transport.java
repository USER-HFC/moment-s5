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
    /** Name+size of every saved photo; a backup-recording copy on the other card carries the same pair. */
    private final Set<String> savedCopies=new HashSet<>();
    private int newestSavedSequence=-1;
    private String newestSavedName="";
    private record Handles(Set<Integer> values) implements Baseline {}
    private record Shot(int handle,String filename,long size,int sequence,int storageId) {}
    /** A candidate and the rule that allowed it, for the diagnostic line. */
    private record Listed(Shot shot,String rule) {}
    /** {@code P}, or {@code _} in AdobeRGB, + folder + file, e.g. {@code P1010001.JPG} / {@code _1010001.JPG}. */
    private static final Pattern LUMIX_NAME=Pattern.compile("(?i)^[P_](\\d{3})(\\d{4})\\.JPE?G$");
    private static String copyKey(String filename,long size) {return filename+'\n'+size;}
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
        savedCopies.add(copyKey(photo.filename(),photo.size()));
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
                if(savedHandles.contains(handle) || savedCopies.contains(copyKey(info.filename,info.size))) {log.accept("照片事件 句柄 "+handle+" 不选：本会话已保存");it.remove();continue;}
                int sequence=lumixSequence(info.filename);
                if(sequence<0) {log.accept("照片事件 句柄 "+handle+" 不选：文件名不符合序号规则，等待两次索引一致");it.remove();continue;}
                if(newestSavedSequence>=0 && sequence<=newestSavedSequence) {log.accept("照片事件 句柄 "+handle+" 不选：文件名序号不大于已保存的 "+savedLabel());it.remove();continue;}
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
                Listed listed;
                try {listed=listedShot(baseline);}
                catch(IOException e) {log.accept("照片索引暂不可用，继续等待："+e.getMessage());previous=null;nextList=now()+500_000;Thread.sleep(80);continue;}
                Shot chosen=listed==null?null:listed.shot;
                if(chosen!=null && previous!=null && chosen.handle==previous.handle && chosen.filename.equals(previous.filename) && chosen.size==previous.size) {
                    log.accept("本次照片选中句柄 "+chosen.handle+" "+chosen.filename+"："+listed.rule);
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
    private String savedLabel() {return newestSavedName.isEmpty()?Integer.toString(newestSavedSequence):newestSavedName;}
    /** Newest new JPEG after merging backup-recording copies, or null when this listing is not safe to pair. */
    private Listed listedShot(Set<Integer> baseline) throws IOException {
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
            if(savedHandles.contains(handle) || savedCopies.contains(copyKey(info.filename,info.size))) {line.append("（本会话已保存，跳过）");continue;}
            choices.add(new Shot(handle,info.filename,info.size,lumixSequence(info.filename),info.storageId));
        }
        log.accept(line.length()==0?"照片索引新增候选：（无）":"照片索引新增候选："+line);
        List<Shot> unique=dedupeCopies(choices);
        if(unique==null || unique.isEmpty()) return null;
        if(unique.size()==1) {
            Shot only=unique.get(0);
            if(only.sequence<0) log.accept("照片索引只有 "+only.filename+"，文件名不符合序号规则；连续两次一致则按唯一新 JPEG 接受");
            return rollbackChecked(only,only.sequence<0?"只有一个新 JPEG（文件名不符合序号规则）":"文件名序号最新",false);
        }
        for(Shot shot:unique) if(shot.sequence<0) {log.accept("多个新 JPEG 中有文件名不符合序号规则，无法判断，不配对");return null;}
        Shot best=unique.get(0);
        for(Shot shot:unique) {
            if(shot.sequence>best.sequence) best=shot;
            else if(shot.sequence==best.sequence && !shot.filename.equals(best.filename)) {log.accept("多个候选文件名序号相同，不配对");return null;}
        }
        return rollbackChecked(best,"文件名序号最新",true);
    }
    /**
     * Same name and size on two cards is one photo; keep the smaller StorageID. A name with
     * different sizes is not a backup copy, so nothing in this listing is safe to pair.
     */
    private List<Shot> dedupeCopies(List<Shot> choices) {
        Map<String,List<Shot>> byName=new LinkedHashMap<>();
        for(Shot shot:choices) byName.computeIfAbsent(shot.filename,k->new ArrayList<>()).add(shot);
        List<Shot> unique=new ArrayList<>();
        for(List<Shot> copies:byName.values()) {
            long size=copies.get(0).size;
            StringBuilder handles=new StringBuilder();
            for(Shot shot:copies) {
                if(handles.length()>0) handles.append('/');
                handles.append(shot.handle);
                if(shot.size!=size) {
                    log.accept("同名 JPEG 大小不同，不配对："+copies.get(0).filename+" 句柄 "+handles+"，大小 "+size+"/"+shot.size);
                    return null;
                }
            }
            Shot keep=copies.get(0);
            for(Shot shot:copies) if(Integer.compareUnsigned(shot.storageId,keep.storageId)<0 || (shot.storageId==keep.storageId && Integer.compareUnsigned(shot.handle,keep.handle)<0)) keep=shot;
            if(copies.size()>1) log.accept("同名同大小的备份副本视为同一张照片："+keep.filename+" 句柄 "+handles+"，选 StorageID 较小的句柄 "+keep.handle);
            unique.add(keep);
        }
        return unique;
    }
    /** Two agreeing listings may accept a rollback only when it is the single new JPEG. */
    private Listed rollbackChecked(Shot chosen,String rule,boolean multiple) {
        if(chosen.sequence<0 || newestSavedSequence<0 || chosen.sequence>newestSavedSequence) return new Listed(chosen,"连续两次索引一致，"+rule);
        if(multiple) {log.accept("候选文件名序号不大于已保存的 "+savedLabel()+"，跳过");return null;}
        log.accept("照片索引只有 "+chosen.filename+"，序号不大于已保存的 "+savedLabel()+"；连续两次一致则按换卡/重置编号接受");
        return new Listed(chosen,"连续两次索引一致，只有一个新 JPEG；序号回退（可能换卡或重置编号），按唯一新文件接受");
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
            if(!info.jpeg())continue; // RAW of a RAW+JPEG pair is skipped
            // Backup recording stores the same name+size on both cards. The second event is the
            // same photo, so syncing it again would import one shutter twice.
            if(!savedCopies.add(copyKey(info.filename,info.size)))continue;
            return new Original(handle,info.filename,info.size);
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
