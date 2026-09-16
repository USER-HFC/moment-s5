package cn.moment.s5;

import java.io.IOException;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/** Bounded PTP dataset parsing; vendor constants follow MIT-licensed tethr. */
public final class Ptp {
    private Ptp() {}
    public static void requireSuccess(int operation,int response) throws IOException {
        // Match tethr: an existing standard PTP session is usable after USB reconnect.
        // Do not accept this response for capture, vendor commands or arbitrary operations.
        if(response==0x2001 || (operation==0x1002 && response==0x201e)) return;
        String detail=response==0x201e?"（会话已打开）":response==0x2019?"（机身忙）":"";
        throw new IOException(String.format(java.util.Locale.ROOT,"PTP 指令 0x%04X，响应 0x%04X%s",operation,response,detail));
    }
    public static ByteBuffer le(byte[] b) { return ByteBuffer.wrap(b).order(ByteOrder.LITTLE_ENDIAN); }
    public static byte[] command(int op, int tx, int... params) {
        if (params.length > 5) throw new IllegalArgumentException("PTP parameter count");
        ByteBuffer b = le(new byte[12 + params.length * 4]);
        b.putInt(b.capacity()).putShort((short)1).putShort((short)op).putInt(tx);
        for (int p : params) b.putInt(p);
        return b.array();
    }
    public static final class Reader {
        private final ByteBuffer b;
        public Reader(byte[] bytes) { b = le(bytes); }
        private void need(int n) throws IOException { if (n < 0 || b.remaining() < n) throw new IOException("PTP 数据截断"); }
        public int u16() throws IOException { need(2); return b.getShort() & 0xffff; }
        public int i32() throws IOException { need(4); return b.getInt(); }
        public void skip(int n) throws IOException { need(n); b.position(b.position() + n); }
        public void position(int n) throws IOException { if (n < 0 || n > b.limit()) throw new IOException("PTP 偏移越界"); b.position(n); }
        public int[] array(int size) throws IOException {
            int n = i32(); if (n < 0 || n > 100000 || n > b.remaining() / size) throw new IOException("PTP 数组长度异常");
            int[] a = new int[n]; for (int i=0;i<n;i++) a[i] = size == 2 ? u16() : i32(); return a;
        }
        public String string() throws IOException {
            need(1); int count=b.get() & 255; if(count==0) return "";
            need(count*2); byte[] text=new byte[(count-1)*2]; b.get(text); b.getShort();
            return new String(text, StandardCharsets.UTF_16LE);
        }
    }
    public static final class DeviceInfo {
        public final String manufacturer, model, version;
        public final int[] operations;
        public DeviceInfo(byte[] bytes) throws IOException {
            Reader r = new Reader(bytes); r.skip(8); r.string(); r.skip(2);
            operations=r.array(2); r.array(2); r.array(2); r.array(2); r.array(2);
            manufacturer=r.string(); model=r.string(); version=r.string();
            // Deliberately never read/store a camera serial number in diagnostics.
        }
        public boolean supports(int op) { for(int x:operations) if(x==op) return true; return false; }
    }
    public static final class ObjectInfo {
        public final int format, width, height;
        public final long size;
        public final String filename;
        public ObjectInfo(byte[] bytes) throws IOException {
            Reader r=new Reader(bytes); r.skip(4); format=r.u16(); r.skip(2); size=Integer.toUnsignedLong(r.i32());
            r.skip(14); width=r.i32(); height=r.i32(); r.position(52); filename=r.string();
        }
        public boolean jpeg() { return format == 0x3801 || filename.toLowerCase(java.util.Locale.ROOT).endsWith(".jpg"); }
    }
    public static byte[] liveJpeg(byte[] data) throws IOException {
        if(data.length<4) return null;
        int jpegOffset=180;
        for(int pos=0;pos+8<=Math.min(180,data.length);) {
            int id=le(data).getInt(pos), size=le(data).getInt(pos+4);
            if(size<0 || size>data.length-pos-8) break;
            if(id==0x17000001 && size>=8) jpegOffset=le(data).getInt(pos+12);
            pos+=8+size;
        }
        if(jpegOffset>0 && jpegOffset<data.length-3 && (data[jpegOffset]&255)==255 && (data[jpegOffset+1]&255)==216)
            return Arrays.copyOfRange(data,jpegOffset,data.length);
        // Header layouts differ by firmware. Only accept an actual SOI marker.
        for(int i=0;i<Math.min(4096,data.length-3);i++) {
            if((data[i]&255)==255 && (data[i+1]&255)==216 && (data[i+2]&255)==255)
                return Arrays.copyOfRange(data,i,data.length);
        }
        throw new IOException("取景数据中没有 JPEG；需要适配此固件的帧结构");
    }
}
