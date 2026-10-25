package cn.moment.lumix;

import android.hardware.usb.*;
import java.io.*;
import java.nio.ByteBuffer;
import java.util.*;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;

/** Host checks against the fake bulk transport in tests/android-stubs; no physical S5 claim. */
public final class UsbPtpChecks {
    private static int checks;
    private interface Action {void run() throws Exception;}
    private static void check(boolean value,String message){checks++;if(!value)throw new AssertionError(message);}
    private static void expectIo(Action action,String message) throws Exception {try{action.run();throw new AssertionError(message);}catch(IOException expected){checks++;}}
    private static byte[] container(int type,int code,int tx,byte[] payload){
        return Ptp.le(new byte[12+payload.length]).putInt(12+payload.length).putShort((short)type).putShort((short)code).putInt(tx).put(payload).array();
    }
    private static byte[] join(byte[] a,byte[] b){byte[] out=Arrays.copyOf(a,a.length+b.length);System.arraycopy(b,0,out,a.length,b.length);return out;}
    private static void ptpString(ByteArrayOutputStream out,String value) throws IOException {
        out.write(value.length()+1);out.write(value.getBytes(java.nio.charset.StandardCharsets.UTF_16LE));out.write(0);out.write(0);
    }
    private static byte[] description(String model) throws IOException {
        ByteArrayOutputStream out=new ByteArrayOutputStream();out.write(new byte[8]);out.write(0);out.write(new byte[2+5*4]);
        ptpString(out,"Panasonic");ptpString(out,model);ptpString(out,"2.9");return out.toByteArray();
    }
    /** Every operation answers OK; GetDeviceInfo also returns a DC-S5 dataset. */
    private static UsbManager manager() throws IOException {return manager("DC-S5");}
    private static UsbManager manager(String model) throws IOException {
        UsbManager manager=new UsbManager();byte[] info=description(model);
        manager.connection.respond=command->{ByteBuffer bytes=Ptp.le(command);int op=bytes.getShort(6)&65535,tx=bytes.getInt(8);
            if((bytes.getShort(4)&65535)==2) return new byte[0]; // the host's data phase gets no reply of its own
            byte[] ok=container(3,0x2001,tx,new byte[0]);
            return op==0x1001?join(container(2,op,tx,info),ok):ok;
        };return manager;
    }
    private static UsbS5 open(UsbManager manager) throws IOException {UsbS5 camera=new UsbS5(manager,new UsbDevice(),s->{});camera.open();return camera;}
    private static byte[] value(int code,int size,int value){
        ByteBuffer b=Ptp.le(new byte[8+size]).putInt(code).putInt(size);if(size==2)b.putShort((short)value);else b.putInt(value);return b.array();
    }
    /** ListProperty descriptor with a one-word header, so the current value sits at offset 12. */
    private static byte[] descriptor(int code,int size,int value){
        ByteBuffer b=Ptp.le(new byte[12+size]).putInt(code).putInt(1).putInt(code);if(size==2)b.putShort((short)value);else b.putInt(value);return b.array();
    }
    private static void timeouts() throws Exception {
        UsbManager manager=manager();UsbS5 camera=open(manager);
        manager.connection.slowReads=3;long started=System.nanoTime();camera.shutter();
        check(!camera.closed() && (System.nanoTime()-started)/1_000_000>=600,"a body that answers after several read timeouts keeps the session");
        check(manager.connection.commands.stream().filter(b->(Ptp.le(b).getShort(6)&65535)==0x9404).count()==1,"waiting for a slow answer never resends the shutter");
        camera.close();

        manager=manager();camera=open(manager);
        manager.connection.respond=command->new byte[0];started=System.nanoTime();
        expectIo(camera::shutter,"a dead link waited for the full deadline");
        check(camera.closed() && (System.nanoTime()-started)/1_000_000<2000,"immediate -1 results still abort quickly");

        manager=manager();camera=open(manager);
        byte[] object=new byte[64];
        manager.connection.respond=command->{int tx=Ptp.le(command).getInt(8);return join(container(2,0x1009,tx,object),container(3,0x2001,tx,new byte[0]));};
        manager.connection.failAfter(21);UsbS5 broken=camera;
        expectIo(()->broken.object(7),"timeout inside a data container accepted");
        check(camera.closed(),"a lost transfer inside a container aborts instead of re-framing");
    }
    private static void exposure() throws Exception {
        UsbManager manager=manager();UsbS5 camera=open(manager);
        manager.connection.respond=command->{ByteBuffer b=Ptp.le(command);int op=b.getShort(6)&65535,tx=b.getInt(8),prop=command.length>=16?b.getInt(12):0;
            byte[] ok=container(3,0x2001,tx,new byte[0]);
            if(op==0x9402 && prop==0x02000021) return join(container(2,op,tx,value(prop,4,400)),ok);
            if(op==0x9402 && prop==0x02000041) return join(container(2,op,tx,value(prop,2,56)),ok);
            if(op==0x9108 && prop==0x02000030) return join(container(2,op,tx,descriptor(prop,4,125000)),ok);
            if(op==0x9108) return join(container(2,op,tx,descriptor(prop,prop==0x02000040?2:4,1)),ok);
            return ok;
        };
        check(camera.exposure().equals("ISO 400     f/5.6     1/125"),"current ISO / aperture come from the *_Param properties");
        manager.connection.respond=command->{ByteBuffer b=Ptp.le(command);int op=b.getShort(6)&65535,tx=b.getInt(8),prop=command.length>=16?b.getInt(12):0;
            if(op==0x9402) return container(3,0x2005,tx,new byte[0]);
            byte[] ok=container(3,0x2001,tx,new byte[0]);
            if(op==0x9108 && prop==0x02000020) return join(container(2,op,tx,descriptor(prop,4,200)),ok);
            if(op==0x9108 && prop==0x02000040) return join(container(2,op,tx,descriptor(prop,2,40)),ok);
            if(op==0x9108 && prop==0x02000030) return join(container(2,op,tx,descriptor(prop,4,0x80000000|2000)),ok);
            return ok;
        };
        check(camera.exposure().equals("ISO 200     f/4     2s"),"unsupported GetProperty falls back to the list descriptor");
        check(!camera.closed(),"an unsupported vendor read keeps the session");
        camera.close();
    }
    private static void anyLumix() throws Exception {
        for(String model:List.of("DC-GH6","DC-S5M2","DC-G9")) {
            UsbS5 camera=open(manager(model));
            check(!camera.closed() && camera.info.model.equals(model),model+" opens a PTP session like the S5");
            camera.close();
        }
    }
    private static void focus() throws Exception {
        // The fake DeviceInfo lists no operations at all, like a body that omits vendor ops.
        UsbManager manager=manager();UsbS5 camera=open(manager);camera.focus(true);camera.focus(false);
        List<byte[]> drives=new ArrayList<>();for(byte[] c:manager.connection.commands)if(c.length>=8 && (Ptp.le(c).getShort(6)&65535)==0x9416)drives.add(c);
        check(drives.size()>=2,"focus steps are sent even when DeviceInfo does not list 0x9416");
        manager.connection.respond=command->(Ptp.le(command).getShort(4)&65535)==2?new byte[0]:container(3,0x2002,Ptp.le(command).getInt(8),new byte[0]);
        try{camera.focus(true);throw new AssertionError("refused focus step accepted");}
        catch(IOException expected){check(expected.getMessage().contains("0x2002") && expected.getMessage().contains("AF+MF"),"a refused step reports the camera's response code");}
        check(!camera.closed(),"a refused focus step keeps the session");
        camera.close();
    }
    private static byte[] objectInfo(int format,String name) throws IOException {
        ByteArrayOutputStream out=new ByteArrayOutputStream();ByteBuffer head=Ptp.le(new byte[52]);
        head.putInt(0x00010001).putShort((short)format).putShort((short)0).putInt(4096);out.write(head.array());ptpString(out,name);return out.toByteArray();
    }
    private static byte[] handleList(int... values) {
        ByteBuffer list=Ptp.le(new byte[4+values.length*4]);list.putInt(values.length);for(int value:values)list.putInt(value);return list.array();
    }
    private interface Catalog {int[] handles();byte[] object(int handle) throws IOException;}
    private static void serve(UsbManager manager,Catalog catalog) {
        manager.connection.respond=command->{ByteBuffer b=Ptp.le(command);int op=b.getShort(6)&65535,tx=b.getInt(8),h=command.length>=16?b.getInt(12):0;
            byte[] ok=container(3,0x2001,tx,new byte[0]);
            try {
                if(op==0x1007) return join(container(2,op,tx,handleList(catalog.handles())),ok);
                if(op==0x1008) return join(container(2,op,tx,catalog.object(h)),ok);
            } catch(IOException e) {throw new UncheckedIOException(e);}
            return ok;
        };
    }
    private static UsbS5Transport connect(UsbManager manager,List<String> logs) throws IOException {
        UsbS5Transport camera=new UsbS5Transport(manager,new UsbDevice(),logs::add);camera.open();return camera;
    }
    private static CameraTransport.Baseline baseline(UsbManager manager,UsbS5Transport camera,int... handles) throws Exception {
        serve(manager,new Catalog(){public int[] handles(){return handles;}public byte[] object(int handle){return new byte[0];}});
        return camera.prepareCaptureBaseline();
    }
    @SuppressWarnings("unchecked") private static LinkedBlockingQueue<Integer> addedQueue(UsbS5Transport camera) throws Exception {
        java.lang.reflect.Field usbField=UsbS5Transport.class.getDeclaredField("usb");usbField.setAccessible(true);
        java.lang.reflect.Field queue=UsbS5.class.getDeclaredField("added");queue.setAccessible(true);
        return (LinkedBlockingQueue<Integer>)queue.get(usbField.get(camera));
    }
    private static CameraTransport.Original awaitPhoto(UsbS5Transport camera,CameraTransport.Baseline baseline) throws Exception {
        AtomicBoolean valid=new AtomicBoolean(true);AtomicReference<CameraTransport.Original> result=new AtomicReference<>();AtomicReference<Throwable> error=new AtomicReference<>();
        Thread thread=new Thread(()->{try{result.set(camera.awaitNewJpeg(baseline,valid::get));}catch(Throwable e){error.set(e);}},"pairing");
        thread.start();thread.join(10000);
        if(thread.isAlive()){valid.set(false);thread.join(3000);} 
        if(thread.isAlive()){camera.abort();thread.join(2000);throw new AssertionError("pairing did not finish");}
        if(error.get() instanceof Exception ex) throw ex;
        if(error.get()!=null) throw new AssertionError(error.get());
        return result.get();
    }
    private static void staysUnpaired(UsbS5Transport camera,CameraTransport.Baseline baseline,String message) throws Exception {
        AtomicBoolean valid=new AtomicBoolean(true);AtomicReference<CameraTransport.Original> result=new AtomicReference<>();AtomicReference<Throwable> error=new AtomicReference<>();
        Thread thread=new Thread(()->{try{result.set(camera.awaitNewJpeg(baseline,valid::get));}catch(Throwable e){error.set(e);}},"pairing");
        thread.start();Thread.sleep(2500);valid.set(false);thread.join(3000);
        CameraTransport.Original photo=result.get();
        check(photo==null && error.get() instanceof IOException,message+(photo==null?"":" got "+photo.key()+" "+photo.filename()));
    }
    private static void paired(CameraTransport.Original photo,int handle,String filename,String message) {
        check(photo!=null && Integer.valueOf(handle).equals(photo.key()) && filename.equals(photo.filename()),
            message+" got "+(photo==null?"nothing":photo.key()+" "+photo.filename()));
    }
    private static boolean saw(List<String> logs,String fragment) {for(String line:logs) if(line.contains(fragment)) return true;return false;}
    /** Baseline omits an older JPEG. The new file appears on a later listing and has the smaller handle. */
    private static void pairing() throws Exception {
        check(UsbS5Transport.lumixSequence("P1000005.JPG")==1_000_005,"folder 100 file 5");
        check(UsbS5Transport.lumixSequence("P1009999.JPG")==1_009_999 && UsbS5Transport.lumixSequence("P1010001.JPG")==1_010_001,"folder then file number");
        check(UsbS5Transport.lumixSequence("P1009999.JPG")<UsbS5Transport.lumixSequence("P1010001.JPG"),"a new folder is newer than the previous folder's last file");
        check(UsbS5Transport.lumixSequence("p1000006.jpeg")==1_000_006,"JPEG extension and case");
        check(UsbS5Transport.lumixSequence("IMG_0006.JPG")<0 && UsbS5Transport.lumixSequence(null)<0,"a name that is not a Lumix sequence is not ordered");

        List<String> logs=Collections.synchronizedList(new ArrayList<>());UsbManager manager=manager();UsbS5Transport camera=connect(manager,logs);
        CameraTransport.Baseline baseline=baseline(manager,camera,1,2);
        AtomicInteger lists=new AtomicInteger();
        serve(manager,new Catalog(){
            public int[] handles(){return lists.incrementAndGet()<2?new int[]{1,2,30}:new int[]{1,2,30,4};}
            public byte[] object(int handle) throws IOException {return objectInfo(0x3801,handle==4?"P1000006.JPG":"P1000005.JPG");}
        });
        try {
            paired(awaitPhoto(camera,baseline),4,"P1000006.JPG","an older JPEG missing from the baseline must not win while the new file is still absent");
            check(saw(logs,"快门前照片索引 2 个") && saw(logs,"句柄 30 P1000005.JPG") && saw(logs,"句柄 4 P1000006.JPG"),"diagnostics list the baseline and each new candidate");
            check(saw(logs,"本次照片选中句柄 4 P1000006.JPG：连续两次索引一致，文件名序号最新"),"diagnostics say why the new file was paired");
            check(!saw(logs,"序列号"),"diagnostics do not record a camera serial number");
        } finally {camera.close();}

        logs=Collections.synchronizedList(new ArrayList<>());manager=manager();camera=connect(manager,logs);baseline=baseline(manager,camera,1,2);
        serve(manager,new Catalog(){
            public int[] handles(){return new int[]{1,2,90,3};}
            public byte[] object(int handle) throws IOException {return objectInfo(0x3801,handle==3?"P1010001.JPG":"P1009999.JPG");}
        });
        try {paired(awaitPhoto(camera,baseline),3,"P1010001.JPG","Lumix folder+file order beats a larger handle");}
        finally {camera.close();}

        logs=Collections.synchronizedList(new ArrayList<>());manager=manager();camera=connect(manager,logs);baseline=baseline(manager,camera,1,2);
        camera.noteSaved(new CameraTransport.Original(30,"P1000005.JPG",4096));
        AtomicInteger late=new AtomicInteger();
        serve(manager,new Catalog(){
            public int[] handles(){return late.incrementAndGet()<3?new int[]{1,2,30,99}:new int[]{1,2,30,99,4};}
            public byte[] object(int handle) throws IOException {
                if(handle==30) return objectInfo(0x3801,"P1000008.JPG");
                if(handle==99) return objectInfo(0x3801,"P1000004.JPG");
                return objectInfo(0x3801,"P1000006.JPG");
            }
        });
        try {
            paired(awaitPhoto(camera,baseline),4,"P1000006.JPG","a saved photo and any older sequence stay unpaired until the new JPEG is listed twice");
            check(saw(logs,"本会话已保存") && saw(logs,"文件名序号不大于已保存的 P1000005.JPG"),"diagnostics say why the previous files were skipped");
        } finally {camera.close();}

        manager=manager();camera=connect(manager,new ArrayList<>());baseline=baseline(manager,camera,1,2);
        camera.noteSaved(new CameraTransport.Original(30,"P1000005.JPG",4096));
        serve(manager,new Catalog(){
            public int[] handles(){return new int[]{1,2,30,99};}
            public byte[] object(int handle) throws IOException {return objectInfo(0x3801,handle==99?"P1000004.JPG":"P1000008.JPG");}
        });
        try {staysUnpaired(camera,baseline,"only the saved photo and an older sequence are visible, so pairing must time out rather than guess");}
        finally {camera.close();}

        manager=manager();camera=connect(manager,new ArrayList<>());baseline=baseline(manager,camera,1,2);
        serve(manager,new Catalog(){
            public int[] handles(){return new int[]{1,2,4,8};}
            public byte[] object(int handle) throws IOException {return objectInfo(0x3801,"P1000006.JPG");}
        });
        try {staysUnpaired(camera,baseline,"two new files with the same Lumix sequence are not guessed");}
        finally {camera.close();}

        logs=Collections.synchronizedList(new ArrayList<>());manager=manager();camera=connect(manager,logs);baseline=baseline(manager,camera,1,2);
        AtomicInteger reads=new AtomicInteger();
        serve(manager,new Catalog(){
            public int[] handles(){return new int[]{1,2,30,4};}
            public byte[] object(int handle) throws IOException {
                if(handle!=4) return objectInfo(0x3801,"P1000005.JPG");
                return reads.incrementAndGet()<3?objectInfo(0x3000,"P1000006"):objectInfo(0x3801,"P1000006.JPG");
            }
        });
        addedQueue(camera).add(4);
        try {
            paired(awaitPhoto(camera,baseline),4,"P1000006.JPG","a handle that is not JPEG yet is retried, not replaced by the older JPEG");
            check(saw(logs,"格式 0x3000") && saw(logs,"还不是 JPEG"),"diagnostics keep the not-yet-JPEG event and listing");
        } finally {camera.close();}

        logs=Collections.synchronizedList(new ArrayList<>());manager=manager();camera=connect(manager,logs);baseline=baseline(manager,camera,1,2);
        AtomicInteger failures=new AtomicInteger();
        serve(manager,new Catalog(){
            public int[] handles(){return new int[]{1,2,30,4};}
            public byte[] object(int handle) throws IOException {
                if(handle==4 && failures.incrementAndGet()<3) return new byte[4];
                return objectInfo(0x3801,handle==4?"P1000006.JPG":"P1000005.JPG");
            }
        });
        addedQueue(camera).add(4);
        try {
            paired(awaitPhoto(camera,baseline),4,"P1000006.JPG","an object whose format cannot be read yet is retried");
            check(saw(logs,"暂时读不到格式"),"diagnostics record the unreadable event");
        } finally {camera.close();}

        logs=Collections.synchronizedList(new ArrayList<>());manager=manager();camera=connect(manager,logs);baseline=baseline(manager,camera,1,2);
        camera.noteSaved(new CameraTransport.Original(30,"P1000005.JPG",4096));
        serve(manager,new Catalog(){
            public int[] handles(){return new int[]{1,2,30,4};}
            public byte[] object(int handle) throws IOException {return objectInfo(0x3801,handle==4?"P1000006.JPG":"P1000005.JPG");}
        });
        addedQueue(camera).add(30);
        try {
            paired(awaitPhoto(camera,baseline),4,"P1000006.JPG","an ObjectAdded for the saved photo is not this shutter");
            check(saw(logs,"照片事件 句柄 30") && saw(logs,"不选：本会话已保存") && !saw(logs,"选中句柄 30"),"the older event is logged and not paired");
        } finally {camera.close();}

        manager=manager();camera=connect(manager,new ArrayList<>());baseline=baseline(manager,camera,1,2);
        camera.noteSaved(new CameraTransport.Original(30,"P1000005.JPG",4096));
        AtomicInteger indexReads=new AtomicInteger();
        serve(manager,new Catalog(){
            public int[] handles(){indexReads.incrementAndGet();return new int[]{1,2,30,4};}
            public byte[] object(int handle) throws IOException {return objectInfo(0x3801,handle==4?"P1000006.JPG":"P1000005.JPG");}
        });
        addedQueue(camera).add(4);
        try {
            paired(awaitPhoto(camera,baseline),4,"P1000006.JPG","a newer JPEG event is the shutter file");
            check(indexReads.get()==0,"a newer JPEG event does not wait for another index listing");
        } finally {camera.close();}

        manager=manager();camera=connect(manager,new ArrayList<>());baseline=baseline(manager,camera,1,2);
        serve(manager,new Catalog(){
            public int[] handles(){return new int[]{1,2,4,7};}
            public byte[] object(int handle) throws IOException {return handle==7?objectInfo(0x3000,"P1000006.RW2"):objectInfo(0x3801,"P1000006.JPG");}
        });
        try {paired(awaitPhoto(camera,baseline),4,"P1000006.JPG","a RAW sibling is not paired and does not block the JPEG");}
        finally {camera.close();}
    }
    @SuppressWarnings("unchecked") private static void cameraPhotos() throws Exception {
        UsbManager manager=manager();UsbS5Transport camera=new UsbS5Transport(manager,new UsbDevice(),s->{});camera.open();
        manager.connection.respond=command->{ByteBuffer b=Ptp.le(command);int op=b.getShort(6)&65535,tx=b.getInt(8),h=command.length>=16?b.getInt(12):0;
            byte[] ok=container(3,0x2001,tx,new byte[0]);
            try {
                if(op==0x1008) return join(container(2,op,tx,h==5?objectInfo(0x3000,"P1000005.RW2"):objectInfo(0x3801,"P100000"+h+".JPG")),ok);
                if(op==0x1007) {ByteBuffer list=Ptp.le(new byte[12]).putInt(2).putInt(1).putInt(2);return join(container(2,op,tx,list.array()),ok);}
            } catch(IOException e) {throw new UncheckedIOException(e);}
            return ok;
        };
        CameraTransport.Baseline baseline=camera.prepareCaptureBaseline();
        java.lang.reflect.Field usbField=UsbS5Transport.class.getDeclaredField("usb");usbField.setAccessible(true);
        java.lang.reflect.Field queue=UsbS5.class.getDeclaredField("added");queue.setAccessible(true);
        java.util.concurrent.LinkedBlockingQueue<Integer> added=(java.util.concurrent.LinkedBlockingQueue<Integer>)queue.get(usbField.get(camera));
        added.addAll(List.of(2,5,7,8));
        CameraTransport.Original photo=camera.nextCameraPhoto(baseline,Set.of(7));
        check(photo!=null && photo.key().equals(8) && photo.filename().equals("P1000008.JPG"),"body photo sync skips known handles, saved photos and RAW, and returns the JPEG");
        check(camera.nextCameraPhoto(baseline,Set.of())==null,"no further body photos after the queue drains");
        CameraTransport.Baseline next=camera.withPhoto(baseline,photo);added.add(8);
        check(camera.nextCameraPhoto(next,Set.of())==null,"a synced photo joins the baseline and is never imported twice");
        camera.close();
    }
    public static void main(String[] args) throws Exception {
        timeouts();exposure();anyLumix();focus();cameraPhotos();pairing();
        System.out.println("PASS "+checks+" USB PTP checks (fake bulk transport; DC-S5 unverified)");
    }
}
