package cn.moment.lumix;

import android.hardware.usb.*;
import java.io.*;
import java.nio.ByteBuffer;
import java.util.*;

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
    /** Event thread records the flag only; the capture worker does the bulk read later. */
    private static void propertyEvents() throws Exception {
        UsbS5 camera=open(manager());
        camera.acceptEvent(4,0xc102,1);
        check(camera.exposureChanged(),"Panasonic DevicePropChanged 0xC102 requests an exposure refresh");
        camera.clearExposureChanged();
        check(!camera.exposureChanged(),"clearing the property-change flag waits for the next event");
        camera.acceptEvent(4,0x4006,null);
        check(camera.exposureChanged(),"standard PTP DevicePropChanged 0x4006 requests an exposure refresh");
        camera.clearExposureChanged();
        camera.acceptEvent(4,0xc108,42);
        check(Integer.valueOf(42).equals(camera.nextAdded()) && !camera.exposureChanged(),"ObjectAdded stays a photo event and is not an exposure change");
        camera.acceptEvent(2,0xc102,1);
        check(!camera.exposureChanged(),"a data container is not an event");
        camera.acceptEvent(4,0xc108,null);
        check(camera.nextAdded()==null,"ObjectAdded without a handle is ignored");
        camera.close();
    }
    public static void main(String[] args) throws Exception {
        timeouts();exposure();anyLumix();focus();cameraPhotos();propertyEvents();
        System.out.println("PASS "+checks+" USB PTP checks (fake bulk transport; DC-S5 unverified)");
    }
}
