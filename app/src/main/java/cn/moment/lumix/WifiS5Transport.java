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
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Experimental legacy cam.cgi + GENA + UDP + DLNA. Original DC-S5 firmware 2.9 is unverified.
 * Ordering, retry budgets and S5 quirks follow the protocol notes published by
 * sapoepsilon/lumix-remote (MIT, verified on DC-S5 fw 2.03); no code is copied from it.
 */
public final class WifiS5Transport implements CameraTransport {
    enum State {NEW,AUTHENTICATING,READY,BASELINED,SHUTTER_SENT,LOCATING,DOWNLOADING,FAILED,CLOSED}
    /** Every listed item plus each seen container's childCount; containers not listed are assumed unchanged. */
    private record Catalog(Map<String,WifiS5Protocol.Item> items,Map<String,Integer> counts,Object session) implements Baseline {}
    private static final class CatalogChanged extends IOException {CatalogChanged(){super("相机目录在分页时变化；未建立安全基线，请重试");}}
    static final String DEVICE_NAME="Moment S5 Wi-Fi beta";
    static final int BUSY_ATTEMPTS=5,KEEPALIVE_FAILURES=3;
    static final long KEEPALIVE_SILENCE_MS=30_000;
    /** LUMIX Sync timings; package-private so host checks can shorten them. */
    long pairPollMs=1000,pairTimeoutMs=90_000,settleMs=30_000,busyRetryMs=1000,keepaliveMs=1000,exposureEveryMs=5000;
    private final URL base;
    private final boolean debug;
    private final WifiCameraHttp http;
    private final WifiCameraHttp.Route route;
    private final Consumer<String> log;
    private final LongSupplier clock;
    private final String clientId;
    private final Object control=new Object(),session=new Object();
    private final ArrayBlockingQueue<Preview> frames=new ArrayBlockingQueue<>(3);
    private final ScheduledExecutorService keeper=Executors.newSingleThreadScheduledExecutor(r->new Thread(r,"s5-wifi-keepalive"));
    private final CountDownLatch playbackSettled=new CountDownLatch(1);
    private final int requestedPort;
    private volatile State state=State.NEW;
    private volatile boolean closed,streaming,playback,cameraBusy;
    private volatile String terminalError,exposure="曝光参数暂不可读 · 可用机身调整";
    private volatile Capabilities capabilities=new Capabilities(false,false,false);
    private volatile long streamStarted,lastFrame,exposureUpdatedAt,lastAliveNs;
    private volatile DatagramSocket udp;
    private volatile ServerSocket eventServer;
    private volatile String sid;
    private Thread receiver,eventReceiver;
    private URL cds,eventUrl;
    private InetAddress localAddress;
    private long subscriptionSeconds=300,renewAtNs,lastExposureNs;
    private int keepaliveFailures;
    private Catalog prepared;
    private WifiS5Protocol.Media selected;
    private String token;
    private final Set<String> exposureFields=new LinkedHashSet<>();
    WifiS5Transport(WifiCameraHttp.Route route,String endpoint,int port,boolean debug,String clientId,Consumer<String> log,LongSupplier clock) throws IOException {
        base=WifiS5Protocol.cameraUrl(endpoint,debug);if(port<0||port>65535)throw new IOException("UDP 端口无效");
        if(clientId==null || !clientId.matches("[0-9A-Fa-f-]{1,64}"))throw new IOException("Wi-Fi 设备标识无效");
        this.route=route;this.http=new WifiCameraHttp(route);requestedPort=port;this.debug=debug;this.clientId=clientId;this.log=log;this.clock=clock;
    }
    public String kind(){return "wifi";}
    State state(){return state;}
    private static final class HttpFailure extends IOException {final int status;HttpFailure(int status){super("相机 HTTP "+status);this.status=status;}}
    private WifiCameraHttp.Response request(URL url,String method,byte[] body,Map<String,String> headers,int timeout) throws IOException {
        if(!url.getHost().equalsIgnoreCase(base.getHost()) || !url.getProtocol().equals("http") || url.getUserInfo()!=null)throw new IOException("拒绝非相机地址");
        Map<String,String> extra=new LinkedHashMap<>(headers);if(token!=null)extra.put("X-SESSION_ID",token);
        WifiCameraHttp.Response response=http.request(url,method,body,extra,timeout);
        if(response.status!=200){int code=response.status;response.close();throw new HttpFailure(code);}
        lastAliveNs=System.nanoTime();return response;
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
    /** LUMIX Sync retries err_busy 5 x 1 s for mode and stream commands. Never used for the shutter. */
    private void busyOk(String mode,String type,String value,String value2) throws IOException {
        for(int attempt=1;;attempt++) {
            WifiS5Protocol.Reply reply=command(mode,type,value,value2);
            if(!reply.result().equalsIgnoreCase("err_busy") || attempt>=BUSY_ATTEMPTS){reply.requireOk();return;}
            sleep(busyRetryMs);
        }
    }
    private static void sleep(long ms) throws IOException {try{Thread.sleep(ms);}catch(InterruptedException e){Thread.currentThread().interrupt();throw new InterruptedIOException("Wi-Fi 等待被中断");}}
    public void open() throws Exception {
        synchronized(control){if(state!=State.NEW)throw new IOException("Wi-Fi 会话不能重复打开");state=State.AUTHENTICATING;}
        try {
            log.accept("Wi-Fi 实验性 · 未经真机验证；请在机身确认连接，推荐使用 USB");
            // LUMIX Sync order: description, access, SUBSCRIBE, read-only info, getstate, device name.
            discoverDescription();authenticate();subscribe();probe();ok("getstate",null,null,null);
            ok("setsetting","device_name",DEVICE_NAME,null);
            settle();
            WifiS5Protocol.Reply status=command("getstate",null,null,null);status.requireOk();
            if(!"rec".equalsIgnoreCase(status.first("cammode")))busyOk("camcmd",null,"recmode",null);
            // Bind BOTH the local UDP port and its camera Network before requesting a stream.
            udp=new DatagramSocket(null);udp.setReceiveBufferSize(1024*1024);route.bind(udp);udp.bind(new InetSocketAddress(requestedPort));udp.setSoTimeout(500);
            receiver=new Thread(this::receive,"s5-wifi-jpeg");receiver.start();startStream();state=State.READY;
            lastAliveNs=System.nanoTime();lastExposureNs=lastAliveNs;
            keeper.scheduleWithFixedDelay(this::keepAlive,keepaliveMs,keepaliveMs,TimeUnit.MILLISECONDS);
        }catch(Exception e){terminalError=e.getMessage();state=State.FAILED;abort();throw e;}
    }
    private void authenticate() throws IOException {
        long deadline=System.nanoTime()+pairTimeoutMs*1_000_000L;boolean asked=false;
        while(true) {
            WifiS5Protocol.Reply auth=command("accctrl","req_acc",clientId,DEVICE_NAME);
            if(auth.gen2())throw new IOException("Gen2 认证需要真机抓包确认；未发送 req_acc_e");
            String result=auth.result();if(result.equalsIgnoreCase("ok"))return;
            // ok_under_research[_no_msg]: the body is asking (or auto-approving) and expects the same request every second.
            if(!result.toLowerCase(Locale.ROOT).startsWith("ok_under_research"))throw new IOException("Wi-Fi 认证被拒绝（"+WifiS5Protocol.safe(result)+"）；请在机身接受设备登记，Gen2 需要真机抓包确认");
            if(!asked){log.accept("请在机身上确认连接请求");asked=true;}
            if(System.nanoTime()>=deadline){try{command("accctrl","req_acc_can",clientId,null);}catch(IOException ignored){/* best effort */}throw new IOException("机身未在时限内确认 Wi-Fi 连接；已取消请求");}
            sleep(pairPollMs);
        }
    }
    private void discoverDescription() throws IOException {
        int port=debug?(base.getPort()<0?80:base.getPort()):60606;IOException last=null;
        for(String path:List.of("/Lumix/Server0/ddd","/Server0/ddd")) {
            URL location=new URL("http",base.getHost(),port,path);
            try(WifiCameraHttp.Response response=request(location,"GET",null,Map.of(),5000)) {
                WifiS5Protocol.Description description=WifiS5Protocol.description(response.bytes(WifiS5Protocol.MAX_XML),location);
                String model=description.model();if(model==null || !(model.equalsIgnoreCase("DC-S5")||model.equalsIgnoreCase("S5")||debug && model.equals("MOCK-DC-S5")))throw new IOException("Wi-Fi 驱动限定初代 S5；检测型号不匹配");
                cds=description.control();eventUrl=description.events();localAddress=response.socket.getLocalAddress();
                log.accept("相机 description 已读取 · "+model+" · 协议仍需真机验证");return;
            }catch(HttpFailure e){if(e.status!=404)throw e;last=e;}
        }
        throw new IOException("未读取到相机 DLNA description；相机 IP 或实验协议不兼容",last);
    }
    /** Required on the S5: without the subscription startstream answers ok but no frames arrive. */
    private void subscribe() throws IOException {
        if(eventUrl==null){log.accept("相机 description 未公布事件地址，跳过事件订阅");return;}
        ServerSocket server=new ServerSocket();server.setSoTimeout(500);server.bind(new InetSocketAddress(localAddress,0),4);eventServer=server;
        eventReceiver=new Thread(this::receiveEvents,"s5-wifi-events");eventReceiver.start();
        String host=localAddress instanceof Inet6Address?"["+localAddress.getHostAddress()+"]":localAddress.getHostAddress();
        String callback="<http://"+host+":"+server.getLocalPort()+"/Camera/event>";
        try(WifiCameraHttp.Response response=request(eventUrl,"SUBSCRIBE",null,Map.of("CALLBACK",callback,"NT","upnp:event","TIMEOUT","Second-300"),5000)) {
            String value=response.headers.get("sid");
            if(value==null || value.isEmpty() || value.length()>256 || value.indexOf('\r')>=0 || value.indexOf('\n')>=0)throw new IOException("相机事件订阅没有有效 SID");
            sid=value;subscriptionSeconds=seconds(response.headers.get("timeout"));renewAtNs=System.nanoTime()+subscriptionSeconds*500_000_000L;
        }
        log.accept("已订阅相机事件 · 有效期 "+subscriptionSeconds+" 秒");sleep(200);
    }
    private static long seconds(String timeout){Matcher m=Pattern.compile("(?i)Second-(\\d{1,6})").matcher(timeout==null?"":timeout);long s=m.find()?Long.parseLong(m.group(1)):300;return Math.max(30,Math.min(s,3600));}
    /** After SUBSCRIBE the S5 drops to playback by itself; camcmd before its mod_Play event can wedge it. */
    private void settle() throws IOException {
        if(sid==null)return;
        try{if(!playbackSettled.await(settleMs,TimeUnit.MILLISECONDS))log.accept("未收到机身 mod_Play 事件，继续连接");}
        catch(InterruptedException e){Thread.currentThread().interrupt();throw new InterruptedIOException("Wi-Fi 连接被中断");}
    }
    private void receiveEvents() {
        Set<InetAddress> allowed;try{allowed=new HashSet<>(Arrays.asList(InetAddress.getAllByName(base.getHost())));}catch(IOException e){return;}
        ServerSocket server=eventServer;
        while(!closed && server!=null && !server.isClosed()) {
            try(Socket socket=server.accept()) {
                if(!allowed.contains(socket.getInetAddress()))continue;
                socket.setSoTimeout(2000);WifiCameraHttp.Incoming notify=WifiCameraHttp.incoming(socket.getInputStream(),64*1024);
                OutputStream out=socket.getOutputStream();out.write("HTTP/1.1 200 OK\r\nContent-Length: 0\r\nConnection: close\r\n\r\n".getBytes(StandardCharsets.US_ASCII));out.flush();
                if(notify.method().equals("NOTIFY") && notify.body().length>0)event(WifiS5Protocol.events(notify.body()));
            }catch(SocketTimeoutException ignored){/* poll closed */}
            catch(IOException e){if(!closed)log.accept("相机事件无法解析："+e.getMessage());}
        }
    }
    private void event(Map<String,List<String>> values) {
        for(String value:values.getOrDefault("X_Panasonic_Cam_Sync",List.of())) {
            log.accept("相机事件 Cam_Sync="+WifiS5Protocol.safe(value));
            switch(value){case "busy","busy_no_msg"->cameraBusy=true;case "update","lens_Atta"->cameraBusy=false;case "mod_Play"->playbackSettled.countDown();default->{}}
        }
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
        if(!values.isEmpty()){exposure=String.join("     ",values);exposureUpdatedAt=clock.getAsLong();}
    }
    /**
     * 1 Hz getstate like LUMIX Sync. err_busy is not a failure; err_reject, three failed polls
     * in a row or 30 s without any successful camera reply end the session.
     */
    private void keepAlive() {
        if(closed)return;
        boolean answered=false;
        try {
            String result=command("getstate",null,null,null,2500).result();
            if(result.equalsIgnoreCase("err_reject")){dead("相机已拒绝本次 Wi-Fi 会话 · 请重新连接相机");return;}
            if(result.equalsIgnoreCase("ok")){keepaliveFailures=0;answered=true;}
            else if(!result.equalsIgnoreCase("err_busy"))keepaliveFailures++;
        }catch(IOException e){keepaliveFailures++;}
        long now=System.nanoTime();
        if(keepaliveFailures>=KEEPALIVE_FAILURES || now-lastAliveNs>KEEPALIVE_SILENCE_MS*1_000_000L){dead("Wi-Fi 保活失败 · 请重新连接相机");return;}
        if(sid!=null && now>=renewAtNs)renew();
        if(answered && (state==State.READY||state==State.BASELINED) && !cameraBusy && !playback && now-lastExposureNs>=exposureEveryMs*1_000_000L) {
            lastExposureNs=now;try{readExposure();}catch(IOException e){log.accept("Wi-Fi 曝光读取失败："+e.getMessage());}
        }
    }
    private void dead(String message){terminalError=message;log.accept(message);abort();}
    /** Renew by SID only: a fresh SUBSCRIBE while the body is in rec mode can wedge the S5. */
    private void renew() {
        renewAtNs=System.nanoTime()+subscriptionSeconds*500_000_000L;
        try(WifiCameraHttp.Response response=request(eventUrl,"SUBSCRIBE",null,Map.of("SID",sid,"TIMEOUT","Second-"+subscriptionSeconds),5000)){subscriptionSeconds=seconds(response.headers.get("timeout"));}
        catch(IOException e){log.accept("相机事件续订失败："+e.getMessage());}
    }
    private void startStream() throws IOException {streamStarted=clock.getAsLong();lastFrame=0;frames.clear();busyOk("startstream",null,Integer.toString(udp.getLocalPort()),null);streaming=true;}
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
    public long exposureUpdatedAtUs(){return exposureUpdatedAt;}
    public boolean freshBaselineRequired(){return true;}
    public void clearCaptureEvents(){}
    public Baseline prepareCaptureBaseline() throws Exception {
        synchronized(control){if(closed || state!=State.READY && state!=State.BASELINED)throw new IOException("Wi-Fi 拍摄状态不允许准备新基线");
            prepared=null;state=State.READY;Catalog catalog;
            try{catalog=stableSnapshot();}catch(IOException e){try{leavePlayback();}catch(IOException ignored){/* the original failure matters */}throw e;}
            leavePlayback(); // the shutter needs rec mode
            prepared=catalog;selected=null;state=State.BASELINED;return prepared;}
    }
    private Catalog stableSnapshot() throws IOException {
        for(int attempt=1;;attempt++)try{return snapshot(null);}catch(CatalogChanged e){if(attempt>=3)throw e;}
    }
    /**
     * Root plus the newest folder for a baseline; afterwards also every container that is new or
     * whose childCount changed. A real S5 card holds about a dozen folders of ~960 originals, so
     * a full walk exceeds the item cap and takes far longer than one shot.
     */
    private Catalog snapshot(Catalog before) throws IOException {
        Map<String,WifiS5Protocol.Item> items=new LinkedHashMap<>();Map<String,Integer> counts=new HashMap<>();
        ArrayDeque<String> queue=new ArrayDeque<>(List.of("0"));Set<String> visited=new HashSet<>();String newest=null;boolean full=false;
        while(!queue.isEmpty()) {
            String object=queue.removeFirst();if(!visited.add(object))continue;if(visited.size()>128)throw new IOException("相机目录层级超过安全遍历上限");
            List<WifiS5Protocol.Item> children=list(object);
            if(object.equals("0")) {
                WifiS5Protocol.Item folder=null;
                for(WifiS5Protocol.Item item:children)if(item.container()) {
                    if(item.childCount()<0)full=true; // without counts no change can be detected: list everything
                    if(folder==null || newer(item,folder))folder=item;
                }
                newest=folder==null?null:folder.id();
            }
            for(WifiS5Protocol.Item item:children) {
                if(items.putIfAbsent(item.identity(),item)!=null)throw new IOException("相机目录对象 ID 重复，无法确认原片");
                if(items.size()>10000)throw new IOException("相机目录超过安全遍历上限");
                if(!item.container())continue;
                counts.put(item.id(),item.childCount());Integer old=before==null?null:before.counts().get(item.id());
                boolean changed=before!=null && (old==null || old!=item.childCount());
                if(full || item.id().equals(newest) || changed)queue.add(item.id());
            }
        }
        return new Catalog(Collections.unmodifiableMap(items),Collections.unmodifiableMap(counts),session);
    }
    /** Lumix folders are titled NNN-NNNN; a higher folder number holds the newest files. */
    private static boolean newer(WifiS5Protocol.Item a,WifiS5Protocol.Item b) {
        int c=Objects.toString(a.title(),"").compareTo(Objects.toString(b.title(),""));return c!=0?c>0:a.id().compareTo(b.id())>0;
    }
    private List<WifiS5Protocol.Item> list(String object) throws IOException {
        List<WifiS5Protocol.Item> items=new ArrayList<>();int start=0,total=-1;String update=null;
        do {
            WifiS5Protocol.Page page=page(object,start);
            if(total!=-1 && (total!=page.total() || !Objects.equals(update,page.update())))throw new CatalogChanged();
            total=page.total();update=page.update();if(page.returned()==0 && start<total || start+page.returned()>total)throw new IOException("相机目录分页被截断");
            items.addAll(page.items());start+=page.returned();
        }while(start<total);
        return items;
    }
    private WifiS5Protocol.Page page(String object,int start) throws IOException {
        try{return browse(object,start);}
        catch(HttpFailure e){if(playback || e.status!=500 && e.status!=503)throw e;}
        // The S5 serves card listings only in playback. Switch once and stay until the
        // original is fetched: every extra recmode/playmode pair risks wedging the body.
        enterPlayback();return browse(object,start);
    }
    private WifiS5Protocol.Page browse(String object,int start) throws IOException {
        synchronized(control){try(WifiCameraHttp.Response response=request(cds,"POST",WifiS5Protocol.soap(object,start),Map.of("Content-Type","text/xml; charset=utf-8","SOAPAction","\""+WifiS5Protocol.CDS+"#Browse\""),5000)){return WifiS5Protocol.browse(response.bytes(WifiS5Protocol.MAX_XML),cds);}}
    }
    private void enterPlayback() throws IOException {busyOk("camcmd",null,"playmode",null);playback=true;streaming=false;frames.clear();}
    /** recmode, then a new stream: none runs in playback, and stopstream without one upsets the S5. */
    private void leavePlayback() throws IOException {if(!playback)return;playback=false;busyOk("camcmd",null,"recmode",null);startStream();}
    /** After the original is safe: a failed return to rec ends the session but never the download. */
    private void returnToRec() {
        try{leavePlayback();}catch(IOException e){terminalError="Wi-Fi 无法切回拍摄模式 · 请重新连接相机";log.accept(terminalError+"："+e.getMessage());abort();}
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
                WifiS5Protocol.Media candidate;
                // The body is still writing: a listing that changed mid-page is retried, not fatal.
                try{candidate=WifiS5Protocol.uniqueNew(baseline.items,snapshot(baseline).items());}
                catch(CatalogChanged e){prior=null;Thread.sleep(600);continue;}
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
        returnToRec();
    }
    public boolean closed(){return closed;}
    public void completeWithoutDownload(){synchronized(control){if(state==State.LOCATING && selected!=null){state=State.READY;prepared=null;selected=null;returnToRec();}}}
    public void abort(){
        closed=true;keeper.shutdownNow();DatagramSocket socket=udp;if(socket!=null)socket.close();
        ServerSocket events=eventServer;if(events!=null)try{events.close();}catch(IOException ignored){/* closing */}
        http.close();frames.clear();if(state!=State.FAILED)state=State.CLOSED;
    }
    public void close(){
        if(!closed && streaming)try{command("stopstream",null,null,null,1000).requireOk();}catch(IOException ignored){/* best effort */}
        String subscription=sid;if(!closed && subscription!=null)try(WifiCameraHttp.Response ignored=request(eventUrl,"UNSUBSCRIBE",null,Map.of("SID",subscription),1000)){/* released */}catch(IOException ignored){/* best effort */}
        abort();
        for(Thread thread:new Thread[]{receiver,eventReceiver})if(thread!=null && thread!=Thread.currentThread())try{thread.join(1000);}catch(InterruptedException e){Thread.currentThread().interrupt();}
    }
}
