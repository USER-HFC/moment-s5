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
    private static byte[] description() throws IOException {
        ByteArrayOutputStream out=new ByteArrayOutputStream();out.write(new byte[8]);out.write(0);out.write(new byte[2+5*4]);
        ptpString(out,"Panasonic");ptpString(out,"DC-S5");ptpString(out,"2.9");return out.toByteArray();
    }
    /** Every operation answers OK; GetDeviceInfo also returns a DC-S5 dataset. */
    private static UsbManager manager() throws IOException {
        UsbManager manager=new UsbManager();byte[] info=description();
        manager.connection.respond=command->{ByteBuffer bytes=Ptp.le(command);int op=bytes.getShort(6)&65535,tx=bytes.getInt(8);
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
    public static void main(String[] args) throws Exception {
        timeouts();exposure();
        System.out.println("PASS "+checks+" USB PTP checks (fake bulk transport; DC-S5 unverified)");
    }
}
