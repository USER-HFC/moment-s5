package android.hardware.usb;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.function.Function;

/** Fragmented fake bulk transport; no claim of physical USB compatibility. */
public final class UsbDeviceConnection {
    public Function<byte[],byte[]> respond;
    public final List<byte[]> commands=new ArrayList<>();
    private final ArrayDeque<Byte> pending=new ArrayDeque<>();
    public boolean closed;
    public int released;
    /** IN reads that wait out their timeout and report -1, like a body that has not answered yet. */
    public int slowReads;
    private int failAfterBytes=-1,delivered;
    /** The next IN read after this many further bytes reports -1, once. */
    public void failAfter(int bytes){delivered=0;failAfterBytes=bytes;}
    public boolean claimInterface(UsbInterface iface,boolean force){return true;}
    public boolean releaseInterface(UsbInterface iface){released++;return true;}
    public void close(){closed=true;}
    public int bulkTransfer(UsbEndpoint endpoint,byte[] bytes,int offset,int length,int timeout){
        if(closed)return -1;
        byte[] command=Arrays.copyOfRange(bytes,offset,offset+length);commands.add(command);
        byte[] response=respond.apply(command);for(byte b:response)pending.add(b);
        return length;
    }
    public int bulkTransfer(UsbEndpoint endpoint,byte[] bytes,int length,int timeout){
        if(closed)return -1;
        if(slowReads>0){slowReads--;try{Thread.sleep(Math.min(timeout,250));}catch(InterruptedException e){Thread.currentThread().interrupt();}return -1;}
        if(failAfterBytes>=0 && delivered>=failAfterBytes){failAfterBytes=-1;return -1;}
        if(pending.isEmpty())return -1;
        int n=Math.min(7,Math.min(length,pending.size()));for(int i=0;i<n;i++)bytes[i]=pending.remove();delivered+=n;return n;
    }
    public UsbRequest requestWait(long timeout) throws java.util.concurrent.TimeoutException {throw new java.util.concurrent.TimeoutException();}
}
