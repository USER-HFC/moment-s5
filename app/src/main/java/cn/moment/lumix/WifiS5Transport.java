package cn.moment.lumix;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;
import java.util.function.LongSupplier;

/** Experimental legacy cam.cgi + UDP + DLNA. Original DC-S5 firmware 2.9 is unverified. */
public final class WifiS5Transport implements CameraTransport {
    enum State {NEW,AUTHENTICATING,READY,BASELINED,SHUTTER_SENT,LOCATING,DOWNLOADING,FAILED,CLOSED}
    private record Catalog(Map<String,WifiS5Protocol.Item> items,Object session) implements Baseline {}
    private final URL base;
    private final boolean debug;
    private final WifiCameraHttp http;
    private final WifiCameraHttp.Route route;
    private final Consumer<String> log;
    private final LongSupplier clock;
    private final Object control=new Object(),session=new Object();
    private final ArrayBlockingQueue<Preview> frames=new ArrayBlockingQueue<>(3);
    private final ScheduledExecutorService keeper=Executors.newSingleThreadScheduledExecutor(r->new Thread(r,"s5-wifi-keepalive"));
    private final int requestedPort;
    private volatile State state=State.NEW;
    private volatile boolean closed,streaming;
    private volatile String terminalError,exposure="曝光参数暂不可读 · 可用机身调整";
    private volatile Capabilities capabilities=new Capabilities(false,false,false);
    private volatile long streamStarted,lastFrame;
    private volatile DatagramSocket udp;
    private Thread receiver;
    private URL cds;
    private Catalog prepared;
    private WifiS5Protocol.Media selected;
    private String token;
    private final Set<String> exposureFields=new LinkedHashSet<>();
    WifiS5Transport(WifiCameraHttp.Route route,String endpoint,int port,boolean debug,Consumer<String> log,LongSupplier clock) throws IOException {
        base=WifiS5Protocol.cameraUrl(endpoint,debug);if(port<0||port>65535)throw new IOException("UDP 端口无效");
        this.route=route;this.http=new WifiCameraHttp(route);requestedPort=port;this.debug=debug;this.log=log;this.clock=clock;
    }
    public String kind(){return "wifi";}
    State state(){return state;}
    private static final class HttpFailure extends IOException {final int status;HttpFailure(int status){super("相机 HTTP "+status);this.status=status;}}
    private WifiCameraHttp.Response request(URL url,String method,byte[] body,Map<String,String> headers,int timeout) throws IOException {
        if(!url.getHost().equalsIgnoreCase(base.getHost()) || !url.getProtocol().equals("http") || url.getUserInfo()!=null)throw new IOException("拒绝非相机地址");
        Map<String,String> extra=new LinkedHashMap<>(headers);if(token!=null)extra.put("X-SESSION_ID",token);
        WifiCameraHttp.Response response=http.request(url,method,body,extra,timeout);
        if(response.status!=200){int code=response.status;response.close();throw new HttpFailure(code);}return response;
    }
    private WifiS5Protocol.Reply command(String mode,String type,String value,String value2) throws IOException {return command(mode,type,value,value2,5000);}
    private WifiS5Protocol.Reply command(String mode,String type,String value,String value2,int timeout) throws IOException {
        synchronized(control){
            if(closed)throw new IOException(terminalError==null?"Wi-Fi 已断开":terminalError);
            StringBuilder query=new StringBuilder("/cam.cgi?mode="+encode(mode));
            if(type!=null)query.append("&type=").append(encode(type));if(value!=null)query.append("&value=").append(encode(value));if(value2!=null)query.append("&value2=").append(encode(value2));
            try(WifiCameraHttp.Response response=request(new URL(base,query.toString()),"GET",null,Map.of(),timeout)) {
                WifiS5Protocol.Reply reply=WifiS5Protocol.reply(response.bytes(WifiS5Protocol.MAX_XML));
                if(mode.equals("accctrl") && reply.result().equalsIgnoreCase("ok")) {
                    String supplied=response.headers.get("x-session_id");if(supplied==null)supplied=reply.first("session_id");
                    if(supplied!=null && !supplied.isEmpty()){if(supplied.length()>512 || supplied.indexOf('\r')>=0 || supplied.indexOf('\n')>=0)throw new IOException("相机 session header 无效");token=supplied;}
                }
                return reply;
            }
        }
    }
    private static String encode(String value){return URLEncoder.encode(value,StandardCharsets.UTF_8);}
    private void ok(String mode,String type,String value,String value2) throws IOException {command(mode,type,value,value2).requireOk();}
    public void open() throws Exception {
        synchronized(control){if(state!=State.NEW)throw new IOException("Wi-Fi 会话不能重复打开");state=State.AUTHENTICATING;}
        try {
            log.accept("Wi-Fi 实验性 · 未经真机验证；请在机身确认连接，推荐使用 USB");
            WifiS5Protocol.Reply auth=command("accctrl","req_acc","0","Moment S5 Wi-Fi beta");
            if(auth.gen2())throw new IOException("Gen2 认证需要真机抓包确认；未发送 req_acc_e");
            if(!auth.result().equalsIgnoreCase("ok"))throw new IOException("Wi-Fi 认证被拒绝（"+WifiS5Protocol.safe(auth.result())+"）；请在机身接受设备登记，Gen2 需要真机抓包确认");
            ok("setsetting","device_name","Moment S5 Wi-Fi beta",null);
            discoverDescription();probe();ok("getstate",null,null,null);ok("camcmd",null,"recmode",null);
            // Bind BOTH the local UDP port and its camera Network before requesting a stream.
            udp=new DatagramSocket(null);udp.setReceiveBufferSize(1024*1024);route.bind(udp);udp.bind(new InetSocketAddress(requestedPort));udp.setSoTimeout(500);
            receiver=new Thread(this::receive,"s5-wifi-jpeg");receiver.start();startStream();state=State.READY;
            keeper.scheduleWithFixedDelay(()->{
                if(closed)return;
                try{command("getstate",null,null,null,2500).requireOk();if(state==State.READY||state==State.BASELINED)readExposure();}
                catch(Exception e){terminalError="Wi-Fi 保活失败 · 请重新连接相机";log.accept(terminalError);abort();}
            },2,2,TimeUnit.SECONDS);
        }catch(Exception e){terminalError=e.getMessage();state=State.FAILED;abort();throw e;}
    }
    private void discoverDescription() throws IOException {
        int port=debug?(base.getPort()<0?80:base.getPort()):60606;IOException last=null;
        for(String path:List.of("/Lumix/Server0/ddd","/Server0/ddd")) {
            URL location=new URL("http",base.getHost(),port,path);
            try(WifiCameraHttp.Response response=request(location,"GET",null,Map.of(),5000)) {
                WifiS5Protocol.Description description=WifiS5Protocol.description(response.bytes(WifiS5Protocol.MAX_XML),location);
                String model=description.model();if(model==null || !(model.equalsIgnoreCase("DC-S5")||model.equalsIgnoreCase("S5")||debug && model.equals("MOCK-DC-S5")))throw new IOException("Wi-Fi 驱动限定初代 S5；检测型号不匹配");
                cds=description.control();log.accept("相机 description 已读取 · "+model+" · 协议仍需真机验证");return;
            }catch(HttpFailure e){if(e.status!=404)throw e;last=e;}
        }
        throw new IOException("未读取到相机 DLNA description；相机 IP 或实验协议不兼容",last);
    }
    private void probe() throws IOException {
        Set<String> declared=new HashSet<>();
        for(String kind:List.of("capability","allmenu")) {
            try{WifiS5Protocol.Reply reply=command("getinfo",kind,null,null);if(reply.result().equalsIgnoreCase("ok")){for(List<String> values:reply.values().values())for(String value:values)declared.addAll(Arrays.asList(value.toLowerCase(Locale.ROOT).split("[^a-z0-9_-]+")));}}
            catch(HttpFailure e){if(e.status<400||e.status>=500)throw e;}
        }
        for(String field:List.of("iso","focal","shtrspeed")) {
            try{WifiS5Protocol.Reply reply=command("getsetting",field,null,null);if(reply.result().equalsIgnoreCase("ok") && setting(reply,field)!=null)exposureFields.add(field);}
            catch(HttpFailure e){if(e.status<400||e.status>=500)throw e;}
        }
        capabilities=new Capabilities(declared.contains("oneshot_af"),declared.contains("focus") && declared.contains("wide-slow") && declared.contains("tele-slow"),!exposureFields.isEmpty());
        readExposure();log.accept("Wi-Fi 能力探测：AF="+capabilities.autofocus()+" / MF="+capabilities.manualFocus()+" / 曝光="+capabilities.exposure());
    }
    private static String setting(WifiS5Protocol.Reply reply,String field){String value=reply.first(field);if(value==null)value=reply.first("value");return value==null||value.isEmpty()?null:value.substring(0,Math.min(64,value.length()));}
    private void readExposure() throws IOException {
        List<String> values=new ArrayList<>();for(String field:exposureFields){WifiS5Protocol.Reply reply=command("getsetting",field,null,null);String value=setting(reply,field);if(reply.result().equalsIgnoreCase("ok") && value!=null)values.add((field.equals("iso")?"ISO ":field.equals("focal")?"f/":"快门 ")+value);}
        if(!values.isEmpty())exposure=String.join("     ",values);
    }
    private void startStream() throws IOException {streamStarted=clock.getAsLong();lastFrame=0;frames.clear();ok("startstream",null,Integer.toString(udp.getLocalPort()),null);streaming=true;}
    private void receive() {
        byte[] packet=new byte[65535];
        try {
            Set<InetAddress> allowed=new HashSet<>(Arrays.asList(InetAddress.getAllByName(base.getHost())));
            while(!closed){DatagramPacket datagram=new DatagramPacket(packet,packet.length);
                try{udp.receive(datagram);}catch(SocketTimeoutException ignored){continue;}
                if(!allowed.contains(datagram.getAddress()))continue;
                byte[] jpeg=WifiS5Protocol.datagram(packet,datagram.getLength());if(jpeg==null)continue;
                long received=clock.getAsLong();lastFrame=received;Preview frame=new Preview(jpeg,received);
                if(!frames.offer(frame)){frames.poll();frames.offer(frame);}
            }
        }catch(IOException e){if(!closed){terminalError="Wi-Fi 取景接收中断 · 请重新连接相机";abort();}}
    }
    public Preview preview() throws IOException {
        if(closed)throw new IOException(terminalError==null?"Wi-Fi 已断开":terminalError);
        if(streaming && clock.getAsLong()-(lastFrame==0?streamStarted:lastFrame)>10_000_000)throw new IOException("Wi-Fi 未收到完整取景帧；请检查相机模式、UDP 端口和手机网络，未知分包格式需要真机抓包确认");
        Preview frame=frames.poll(),next;while((next=frames.poll())!=null)frame=next;return frame;
    }
    public Capabilities capabilities(){return capabilities;}
    public void autofocus() throws IOException {if(!capabilities.autofocus())throw new IOException("相机未声明 Wi-Fi AF 支持");ok("camcmd",null,"oneshot_af",null);}
    public void focus(boolean far) throws IOException {if(!capabilities.manualFocus())throw new IOException("相机未声明 Wi-Fi MF 步进支持");ok("camctrl","focus",far?"tele-slow":"wide-slow",null);}
    public String exposure(){return exposure;}
    public boolean freshBaselineRequired(){return true;}
    public void clearCaptureEvents(){}
    public Baseline prepareCaptureBaseline() throws Exception {
        synchronized(control){if(closed || state!=State.READY && state!=State.BASELINED)throw new IOException("Wi-Fi 拍摄状态不允许准备新基线");
            prepared=null;state=State.READY;
            prepared=new Catalog(catalog(),session);selected=null;state=State.BASELINED;return prepared;}
    }
    private Map<String,WifiS5Protocol.Item> catalog() throws IOException {
        try{return browseAll();}
        catch(HttpFailure e){if(e.status!=500 && e.status!=503)throw e;}
        // Old protocol candidates sometimes expose Browse only in playmode.
        // This is reversible control, never another shutter.
        ok("camcmd",null,"playmode",null);
        try{return browseAll();}
        finally{ok("camcmd",null,"recmode",null);if(streaming)startStream();}
    }
    private Map<String,WifiS5Protocol.Item> browseAll() throws IOException {
        Map<String,WifiS5Protocol.Item> items=new LinkedHashMap<>();ArrayDeque<String> folders=new ArrayDeque<>();Set<String> visited=new HashSet<>();folders.add("0");
        while(!folders.isEmpty()) {
            String object=folders.removeFirst();if(!visited.add(object))continue;if(visited.size()>128)throw new IOException("相机目录层级超过安全遍历上限");
            int start=0,total=-1;String update=null;
            do {
                WifiS5Protocol.Page page;
                synchronized(control){try(WifiCameraHttp.Response response=request(cds,"POST",WifiS5Protocol.soap(object,start),Map.of("Content-Type","text/xml; charset=utf-8","SOAPAction","\""+WifiS5Protocol.CDS+"#Browse\""),5000)){page=WifiS5Protocol.browse(response.bytes(WifiS5Protocol.MAX_XML),cds);}}
                if(total!=-1 && (total!=page.total() || !Objects.equals(update,page.update())))throw new IOException("相机目录在分页时变化；未建立安全基线，请重试");
                total=page.total();update=page.update();if(page.returned()==0 && start<total || start+page.returned()>total)throw new IOException("相机目录分页被截断");
                for(WifiS5Protocol.Item item:page.items()) {
                    if(items.putIfAbsent(item.identity(),item)!=null)throw new IOException("相机目录对象 ID 重复，无法确认原片");
                    if(item.container())folders.add(item.id());if(items.size()>10000)throw new IOException("相机目录超过安全遍历上限");
                }
                start+=page.returned();
            }while(start<total);
        }
        return Collections.unmodifiableMap(items);
    }
    public void shutter() throws IOException {
        synchronized(control){if(closed || state!=State.BASELINED || prepared==null)throw new IOException("Wi-Fi 快门未准备或已经派发；不会重复发送");
            state=State.SHUTTER_SENT; // Reserve BEFORE writing any bytes, including concurrent calls.
            try{command("camcmd",null,"capture",null).requireOk();}
            catch(IOException e){terminalError="Wi-Fi 快门结果不确定或被拒绝；未重试，请检查机身 SD 卡后重新连接";state=State.FAILED;abort();throw new IOException(terminalError,e);}
        }
    }
    public Original awaitNewJpeg(Baseline before,BooleanSupplier valid) throws Exception {
        Catalog baseline=before instanceof Catalog?(Catalog)before:null;
        synchronized(control){if(state!=State.SHUTTER_SENT || baseline==null || baseline!=prepared || baseline.session!=session)throw new IOException("Wi-Fi 原片基线与本次会话不匹配");state=State.LOCATING;}
        long deadline=clock.getAsLong()+60_000_000;WifiS5Protocol.Media prior=null;
        try {
            while(clock.getAsLong()<deadline && !closed && valid.getAsBoolean()) {
                WifiS5Protocol.Media candidate=WifiS5Protocol.uniqueNew(baseline.items,catalog());
                // Two complete catalog snapshots must agree; never select an old/highest filename.
                if(candidate!=null && prior!=null && candidate.key().equals(prior.key())){selected=candidate;return new Original(candidate,candidate.filename(),candidate.size());}
                prior=candidate;Thread.sleep(600);
            }
            throw new IOException(!valid.getAsBoolean()||closed?"Wi-Fi 拍摄期间连接中断；请检查机身 SD 卡原片":"未找到本次唯一原 JPEG；请用单张 JPEG/RAW+JPEG，检查 SD 卡；未重发快门");
        }catch(Exception e){state=State.FAILED;terminalError=e.getMessage();abort();throw e;}
    }
    public void downloadOriginal(Original original,File destination) throws Exception {
        synchronized(control){if(closed || state!=State.LOCATING || original.key()!=selected || selected==null)throw new IOException("Wi-Fi 原片与本次拍摄不匹配");state=State.DOWNLOADING;}
        File part=new File(destination.getParentFile(),destination.getName()+".wifi.part");
        try {
            long count,deadline=clock.getAsLong()+60_000_000;
            while(true) {
                try(WifiCameraHttp.Response response=request(WifiS5Protocol.resource(base,selected.url().toString()),"GET",null,Map.of(),60_000);FileOutputStream out=new FileOutputStream(part)) {
                    count=response.copy(out,WifiS5Protocol.MAX_JPEG);out.getFD().sync();break;
                }catch(HttpFailure e){if((e.status!=404 && e.status!=503) || closed || clock.getAsLong()>=deadline)throw e;Thread.sleep(500);}
            }
            if(selected.size()!=0 && count!=selected.size())throw new IOException("Wi-Fi 原片长度与目录不符；未生成实况");
            try(InputStream in=new BufferedInputStream(new FileInputStream(part))){WifiS5Protocol.jpeg(in,WifiS5Protocol.MAX_JPEG);}
            if(closed)throw new IOException("Wi-Fi 下载已取消");
            Files.move(part.toPath(),destination.toPath(),StandardCopyOption.ATOMIC_MOVE);state=State.READY;prepared=null;selected=null;
            log.accept("Wi-Fi 原 JPEG 已流式接收并校验；相机字节一致性仍需 SD 卡实测");
        }catch(Exception e){state=State.FAILED;terminalError=e.getMessage();abort();throw e;}
        finally{if(part.exists())part.delete();}
    }
    public boolean closed(){return closed;}
    public void completeWithoutDownload(){synchronized(control){if(state==State.LOCATING && selected!=null){state=State.READY;prepared=null;selected=null;}}}
    public void abort(){closed=true;keeper.shutdownNow();DatagramSocket socket=udp;if(socket!=null)socket.close();http.close();frames.clear();if(state!=State.FAILED)state=State.CLOSED;}
    public void close(){if(!closed && streaming)try{command("stopstream",null,null,null,1000).requireOk();}catch(IOException ignored){}abort();if(receiver!=null && receiver!=Thread.currentThread())try{receiver.join(1000);}catch(InterruptedException e){Thread.currentThread().interrupt();}}
}
