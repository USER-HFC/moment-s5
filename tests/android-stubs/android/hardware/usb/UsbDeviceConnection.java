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
        if(closed || pending.isEmpty())return -1;
        int n=Math.min(7,Math.min(length,pending.size()));for(int i=0;i<n;i++)bytes[i]=pending.remove();return n;
    }
}
