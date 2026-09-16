package cn.moment.s5;

import android.hardware.usb.*;
import android.os.SystemClock;
import java.io.*;
import java.nio.ByteBuffer;
import java.util.*;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeoutException;
import java.util.function.Consumer;

/** Native transport adapted from tethr (see NOTICE.md). All bulk operations are serialized. */
public final class UsbS5 implements AutoCloseable {
    public static final int PANASONIC_VID=0x04da;
    private final UsbDeviceConnection connection;
    private final UsbInterface iface;
    private final UsbEndpoint in,out,events;
    private final Consumer<String> log;
    private final LinkedBlockingQueue<Integer> added=new LinkedBlockingQueue<>(64);
    private volatile boolean closed;
    private int transaction;
    private byte[] packet=new byte[16384];
    private int offset,available;
    private Thread eventThread;
    private boolean session,vendorSession,live;
    public Ptp.DeviceInfo info;

    public static boolean candidate(UsbDevice d) {
        if(d.getVendorId()!=PANASONIC_VID) return false;
        for(int i=0;i<d.getInterfaceCount();i++) if(d.getInterface(i).getInterfaceClass()==6) return true;
        return false;
    }
    public UsbS5(UsbManager manager,UsbDevice device,Consumer<String> log) throws IOException {
        this.log=log;
        UsbInterface found=null; UsbEndpoint epIn=null,epOut=null,epEvents=null;
        if(!candidate(device)) throw new IOException("仅支持 Panasonic PTP 相机；请切换 PC(Tether)");
        for(int i=0;i<device.getInterfaceCount();i++) {
            UsbInterface f=device.getInterface(i); if(f.getInterfaceClass()!=6) continue;
            UsbEndpoint a=null,b=null,c=null;
            for(int j=0;j<f.getEndpointCount();j++) {
                UsbEndpoint e=f.getEndpoint(j);
                if(e.getType()==UsbConstants.USB_ENDPOINT_XFER_BULK) { if(e.getDirection()==UsbConstants.USB_DIR_IN) a=e; else b=e; }
                if(e.getType()==UsbConstants.USB_ENDPOINT_XFER_INT && e.getDirection()==UsbConstants.USB_DIR_IN) c=e;
            }
            if(a!=null && b!=null) { found=f;epIn=a;epOut=b;epEvents=c;break; }
        }
        if(found==null) throw new IOException("没有 PTP 双向端点；检查数据线、OTG 与 PC(Tether)");
        iface=found;in=epIn;out=epOut;events=epEvents;
        connection=manager.openDevice(device);
        if(connection==null) throw new IOException("没有 USB 访问权限");
        if(!connection.claimInterface(iface,true)) { connection.close(); throw new IOException("USB 接口被其他应用占用"); }
        log.accept("USB 接口 "+iface.getId()+" / IN "+in.getAddress()+" / OUT "+out.getAddress());
    }
    public void open() throws IOException {
        Result description=exchange(0x1001,null,65536);description.ok();info=new Ptp.DeviceInfo(description.data);
        log.accept(info.manufacturer+" "+info.model+" / "+info.version);
        if(!info.model.equalsIgnoreCase("DC-S5") && !info.model.equalsIgnoreCase("S5"))
            throw new IOException("当前驱动限定初代 S5；检测到 "+info.model);
        Result opened=exchange(0x1002,null,0,1);opened.ok();session=true;
        if(opened.code==0x201e) log.accept("PTP OpenSession 0x1002 返回 0x201E：继续使用已存在的会话");
        exchange(0x9102,null,0,0x00010001).ok(); vendorSession=true;
        startEvents();
        exchange(0x9412,null,0,0x0d000010).ok();live=true;
        log.accept("USB 会话已建立；开始接收取景");
    }
    public byte[] preview() throws IOException {
        Result r=exchange(0x9706,null,8*1024*1024);
        if(r.code==0x2019) return null;
        r.ok();return Ptp.liveJpeg(r.data);
    }
    public void shutter() throws IOException { exchange(0x9404,null,0,0x03000011).ok(); }
    public void autofocus() throws IOException { exchange(0x9405,null,0,0x03000024).ok(); }
    public void focus(boolean far) throws IOException {
        if(!info.supports(0x9416)) throw new IOException("机身未声明手动对焦指令支持");
        ByteBuffer b=Ptp.le(new byte[10]);b.putInt(0x03010011).putInt(2).putShort((short)(far?2:3));
        exchange(0x9416,b.array(),0,0x03010011).ok();
    }
    public Set<Integer> handles() throws IOException {
        Result r=exchange(0x1007,null,4*1024*1024,0xffffffff,0,0);r.ok();
        Set<Integer> s=new HashSet<>(); for(int h:new Ptp.Reader(r.data).array(4)) s.add(h);return s;
    }
    public void clearCaptureEvents() { added.clear(); }
    public Integer nextAdded() { return added.poll(); }
    public Ptp.ObjectInfo objectInfo(int h) throws IOException { Result r=exchange(0x1008,null,65536,h);r.ok();return new Ptp.ObjectInfo(r.data); }
    public byte[] object(int h) throws IOException { Result r=exchange(0x1009,null,64*1024*1024,h);r.ok();return r.data; }
    public synchronized String exposure() {
        try {
            int iso=property(0x02000020,4),ap=property(0x02000040,2),ss=property(0x02000030,4);
            String shutter=(ss<0)?String.format(Locale.US,"%.1fs",(ss&0x7fffffff)/1000.0):"1/"+(ss/1000);
            return "ISO "+(iso<0?"AUTO":iso)+"     f/"+String.format(Locale.US,"%.1f",ap/10.0)+"     "+shutter;
        } catch(IOException e) {log.accept("参数读取："+e.getMessage());return "曝光参数暂不可读 · 可用机身调整";}
    }
    private int property(int prop,int size) throws IOException {
        Result x=exchange(0x9108,null,65536,prop);x.ok();
        Ptp.Reader r=new Ptp.Reader(x.data);r.skip(4);int len=r.i32();
        if(len<0 || len>1024) throw new IOException("属性头长度异常");r.position(len*4+8);
        return size==2?r.u16():r.i32();
    }
    private void startEvents() {
        if(events==null) {log.accept("没有事件端点，将通过新文件句柄确认照片");return;}
        eventThread=new Thread(()-> {
            UsbRequest request=new UsbRequest();
            try {
                if(!request.initialize(connection,events)) { log.accept("事件端点初始化失败");return; }
                ByteBuffer buffer=ByteBuffer.allocate(1024);
                while(!closed) {
                    buffer.clear(); if(!request.queue(buffer)) break;
                    UsbRequest completed=null;
                    while(!closed && completed==null) {
                        try {completed=connection.requestWait(500);} catch(TimeoutException ignored) { /* Keep the same request pending. */ }
                    }
                    if(closed) {request.cancel();break;}
                    int n=buffer.position(); if(n<16) continue;
                    byte[] b=buffer.array();int type=Ptp.le(b).getShort(4)&65535,code=Ptp.le(b).getShort(6)&65535;
                    if(type==4 && (code==0xc108 || code==0x4002)) added.offer(Ptp.le(b).getInt(12));
                }
            } catch(Exception e) {if(!closed) log.accept("事件接收结束："+e.getMessage());}
            finally {request.close();}
        },"s5-events");eventThread.start();
    }
    private static final class Result {
        final int operation,code; final byte[] data;
        Result(int operation,int code,byte[] data) {this.operation=operation;this.code=code;this.data=data;}
        void ok() throws IOException {Ptp.requireSuccess(operation,code);}
    }
    private synchronized Result exchange(int op,byte[] send,int limit,int... params) throws IOException {
        if(closed) throw new IOException("USB 已断开");
        if(!allowed(op)) throw new IOException("指令不在白名单");
        int tx=transaction++;
        long deadline=SystemClock.elapsedRealtime()+15000;
        try {
            write(Ptp.command(op,tx,params),deadline);
            if(send!=null) {
                byte[] block=new byte[send.length+12];ByteBuffer b=Ptp.le(block);
                b.putInt(block.length).putShort((short)2).putShort((short)op).putInt(tx).put(send);write(block,deadline);
            }
            byte[] data=new byte[0];
            for(int count=0;count<4;count++) {
                byte[] header=read(12,deadline);ByteBuffer h=Ptp.le(header);
                int length=h.getInt(),type=h.getShort()&65535,code=h.getShort()&65535,id=h.getInt();
                if(length<12 || length>Math.max(limit,20)+12) throw new IOException("PTP 长度越界 "+length);
                byte[] payload=read(length-12,deadline);
                if(id!=tx) throw new IOException("PTP 事务编号不匹配；请断开重连");
                if(type==2 && code==op) {data=payload;continue;}
                if(type==3) return new Result(op,code,data);
                throw new IOException("PTP 容器类型异常 "+type);
            }
            throw new IOException("PTP 未收到结束响应");
        } catch(IOException e) {
            // A partial transport failure invalidates framing. Never retry a shutter command.
            log.accept(String.format(Locale.US,"USB 0x%04X：%s",op,e.getMessage()));
            abort();throw e;
        }
    }
    private static boolean allowed(int op) {
        return switch(op) {case 0x1001,0x1002,0x1003,0x1007,0x1008,0x1009,0x9102,0x9103,0x9108,0x9404,0x9405,0x9412,0x9416,0x9706 -> true; default -> false;};
    }
    private void write(byte[] bytes,long deadline) throws IOException {
        for(int p=0;p<bytes.length;) {
            int timeout=remaining(deadline);int n=connection.bulkTransfer(out,bytes,p,Math.min(16384,bytes.length-p),timeout);
            if(n<=0) throw new IOException("USB 写入失败或超时");p+=n;
        }
    }
    private int remaining(long deadline) throws IOException {long t=deadline-SystemClock.elapsedRealtime();if(t<=0 || closed) throw new IOException("USB 超时或已断开");return (int)Math.min(t,3000);}
    private byte[] read(int length,long deadline) throws IOException {
        byte[] result=new byte[length];int p=0,empty=0;
        while(p<length) {
            if(offset==available) {
                available=connection.bulkTransfer(in,packet,packet.length,remaining(deadline));offset=0;
                if(available<0) throw new IOException("USB 读取失败或超时");
                if(available==0) {if(++empty>4) throw new IOException("USB 连续空包");continue;}
            }
            int n=Math.min(length-p,available-offset);System.arraycopy(packet,offset,result,p,n);offset+=n;p+=n;
        }
        return result;
    }
    public void abort() {closed=true;connection.close();}
    @Override public synchronized void close() {
        if(closed) return;
        try {if(live) exchange(0x9412,null,0,0x0d000011).ok();} catch(IOException ignored) {log.accept("取景停止未确认");}
        try {if(vendorSession && !closed) exchange(0x9103,null,0,0x00010001).ok();} catch(IOException ignored) {log.accept("厂商会话关闭未确认");}
        try {if(session && !closed) exchange(0x1003,null,0).ok();} catch(IOException ignored) {log.accept("PTP 会话关闭未确认");}
        closed=true;connection.releaseInterface(iface);connection.close();
    }
}
