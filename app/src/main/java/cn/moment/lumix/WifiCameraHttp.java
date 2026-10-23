package cn.moment.lumix;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Small camera-only HTTP/1.1 client: fresh sockets, no redirect or request retry. */
final class WifiCameraHttp implements AutoCloseable {
    interface Route extends AutoCloseable {
        Socket connect(String host,int port) throws IOException;
        void bind(DatagramSocket socket) throws IOException;
        @Override void close();
    }
    private final Route route;
    private final Set<Socket> sockets=Collections.synchronizedSet(new HashSet<>());
    private volatile boolean closed;
    WifiCameraHttp(Route route){this.route=route;}
    final class Response implements AutoCloseable {
        final Socket socket;final int status;final long length;final Map<String,String> headers;final InputStream body;
        Response(Socket socket,int status,long length,Map<String,String> headers,InputStream body){this.socket=socket;this.status=status;this.length=length;this.headers=headers;this.body=body;}
        byte[] bytes(int limit) throws IOException {
            ByteArrayOutputStream out=new ByteArrayOutputStream();copy(out,limit);return out.toByteArray();
        }
        long copy(OutputStream out,long limit) throws IOException {
            if(length>limit)throw new IOException("Wi-Fi 响应超过接收上限");
            byte[] buffer=new byte[16384];long total=0;int n;
            while((n=body.read(buffer))!=-1){total+=n;if(total>limit)throw new IOException("Wi-Fi 响应超过接收上限");out.write(buffer,0,n);}
            if(length>=0 && total!=length)throw new IOException("Wi-Fi 原片长度不符或响应被截断");return total;
        }
        public void close(){sockets.remove(socket);try{socket.close();}catch(IOException ignored){}}
    }
    Response request(URL url,String method,byte[] payload,Map<String,String> extra,int timeout) throws IOException {
        if(closed)throw new IOException("Wi-Fi 已断开");
        Socket socket=route.connect(url.getHost(),url.getPort()<0?80:url.getPort());
        sockets.add(socket);
        try {
            if(closed)throw new IOException("Wi-Fi 连接已取消");socket.setSoTimeout(Math.min(timeout,15000));
            StringBuilder request=new StringBuilder(method+" "+(url.getFile().isEmpty()?"/":url.getFile())+" HTTP/1.1\r\nHost: "+url.getAuthority()+"\r\nConnection: close\r\nAccept: */*\r\n");
            for(Map.Entry<String,String> entry:extra.entrySet()) {
                if(entry.getKey().indexOf('\r')>=0 || entry.getKey().indexOf('\n')>=0 || entry.getValue().indexOf('\r')>=0 || entry.getValue().indexOf('\n')>=0)throw new IOException("无效 HTTP 请求头");
                request.append(entry.getKey()).append(": ").append(entry.getValue()).append("\r\n");
            }
            if(payload!=null)request.append("Content-Length: ").append(payload.length).append("\r\n");
            request.append("\r\n");OutputStream out=socket.getOutputStream();
            // This is the sole dispatch. Nothing in this client retries a write or a response read.
            out.write(request.toString().getBytes(StandardCharsets.UTF_8));if(payload!=null)out.write(payload);out.flush();
            InputStream in=new BufferedInputStream(new Deadline(socket.getInputStream(),timeout));String statusLine=line(in);
            String[] parts=statusLine.split(" ",3);if(parts.length<2 || !parts[0].startsWith("HTTP/1."))throw new IOException("相机 HTTP 应答无效");
            int status;try{status=Integer.parseInt(parts[1]);}catch(NumberFormatException e){throw new IOException("相机 HTTP 状态无效",e);}
            Map<String,String> headers=new HashMap<>();int headerBytes=statusLine.length();
            for(int count=0;;count++) {
                String value=line(in);headerBytes+=value.length();if(count>100 || headerBytes>32768)throw new IOException("相机 HTTP 响应头过大");if(value.isEmpty())break;
                int colon=value.indexOf(':');if(colon<1)throw new IOException("相机 HTTP 响应头无效");
                String key=value.substring(0,colon).trim().toLowerCase(Locale.ROOT);
                if(headers.put(key,value.substring(colon+1).trim())!=null)throw new IOException("相机 HTTP 重复响应头");
            }
            if(status>=300 && status<400)throw new IOException("拒绝相机 HTTP 重定向；未发送额外指令");
            long length=-1;
            if(headers.containsKey("content-length"))try{length=Long.parseLong(headers.get("content-length"));if(length<0)throw new NumberFormatException();}catch(NumberFormatException e){throw new IOException("相机 HTTP 长度无效",e);}
            String transfer=headers.get("transfer-encoding");
            if(transfer!=null && !transfer.equalsIgnoreCase("chunked"))throw new IOException("不支持相机 HTTP 传输编码");
            if(transfer!=null && length>=0)throw new IOException("相机 HTTP 长度冲突");
            InputStream body=transfer!=null?new Chunked(in):length>=0?new Sized(in,length):in;
            return new Response(socket,status,length,headers,body);
        }catch(IOException|RuntimeException e){sockets.remove(socket);try{socket.close();}catch(IOException ignored){}throw e;}
    }
    record Incoming(String method,Map<String,String> headers,byte[] body) {}
    /** One inbound request from the camera (GENA NOTIFY), with a bounded body. */
    static Incoming incoming(InputStream raw,int limit) throws IOException {
        InputStream in=new BufferedInputStream(raw);String start=line(in);String[] parts=start.split(" ",3);
        if(parts.length<3 || !parts[2].startsWith("HTTP/1."))throw new IOException("相机事件请求无效");
        Map<String,String> headers=new HashMap<>();
        for(int count=0;;count++) {
            String value=line(in);if(count>100)throw new IOException("相机事件请求头过多");if(value.isEmpty())break;
            int colon=value.indexOf(':');if(colon<1)throw new IOException("相机事件请求头无效");
            headers.put(value.substring(0,colon).trim().toLowerCase(Locale.ROOT),value.substring(colon+1).trim());
        }
        InputStream body;String transfer=headers.get("transfer-encoding");
        if(transfer!=null && transfer.equalsIgnoreCase("chunked"))body=new Chunked(in);
        else {long length;try{length=Long.parseLong(headers.getOrDefault("content-length","0"));}catch(NumberFormatException e){throw new IOException("相机事件长度无效",e);}
            if(length<0 || length>limit)throw new IOException("相机事件超过上限");body=new Sized(in,length);}
        ByteArrayOutputStream out=new ByteArrayOutputStream();byte[] buffer=new byte[4096];int n;
        while((n=body.read(buffer))!=-1){out.write(buffer,0,n);if(out.size()>limit)throw new IOException("相机事件超过上限");}
        return new Incoming(parts[0],headers,out.toByteArray());
    }
    private static String line(InputStream in) throws IOException {
        ByteArrayOutputStream out=new ByteArrayOutputStream();int b;
        while((b=in.read())!=-1){if(b=='\n'){byte[] bytes=out.toByteArray();if(bytes.length==0 || bytes[bytes.length-1]!='\r')throw new IOException("相机 HTTP 换行无效");return new String(bytes,0,bytes.length-1,StandardCharsets.US_ASCII);}out.write(b);if(out.size()>8192)throw new IOException("相机 HTTP 行过长");}
        throw new EOFException("相机 HTTP 应答被截断");
    }
    private static final class Sized extends InputStream {
        final InputStream in;long remaining;Sized(InputStream in,long remaining){this.in=in;this.remaining=remaining;}
        public int read() throws IOException {byte[] one=new byte[1];return read(one,0,1)==-1?-1:one[0]&255;}
        public int read(byte[] b,int off,int len) throws IOException {if(len==0)return 0;if(remaining==0)return -1;int n=in.read(b,off,(int)Math.min(len,remaining));if(n==-1)throw new EOFException("相机 HTTP 内容不完整");remaining-=n;return n;}
    }
    private static final class Deadline extends FilterInputStream {
        final long deadline;
        Deadline(InputStream in,int timeout){super(in);deadline=System.nanoTime()+timeout*1_000_000L;}
        private void check() throws IOException {if(System.nanoTime()>deadline)throw new SocketTimeoutException("相机 HTTP 响应总时限已到");}
        public int read() throws IOException {check();int result=in.read();check();return result;}
        public int read(byte[] bytes,int off,int len) throws IOException {check();int result=in.read(bytes,off,len);check();return result;}
    }
    private static final class Chunked extends InputStream {
        final InputStream in;long remaining;boolean done,first=true;int trailers;
        Chunked(InputStream in){this.in=in;}
        public int read() throws IOException {byte[] one=new byte[1];return read(one,0,1)==-1?-1:one[0]&255;}
        public int read(byte[] b,int off,int len) throws IOException {
            if(len==0)return 0;if(done)return -1;
            if(remaining==0){if(!first && !line(in).isEmpty())throw new IOException("无效 HTTP chunk 尾");first=false;
                String size=line(in).split(";",2)[0];try{remaining=Long.parseLong(size,16);if(remaining<0 || remaining>64*1024*1024L)throw new NumberFormatException();}catch(NumberFormatException e){throw new IOException("无效 HTTP chunk 长度",e);}
                if(remaining==0){while(!line(in).isEmpty())if(++trailers>32)throw new IOException("HTTP trailer 过多");done=true;return -1;}}
            int n=in.read(b,off,(int)Math.min(len,remaining));if(n<0)throw new EOFException("HTTP chunk 不完整");remaining-=n;return n;
        }
    }
    public void close(){closed=true;synchronized(sockets){for(Socket socket:sockets)try{socket.close();}catch(IOException ignored){}sockets.clear();}route.close();}
}
