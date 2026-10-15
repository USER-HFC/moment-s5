package cn.moment.lumix;

import com.sun.net.httpserver.*;
import java.io.*;
import java.lang.reflect.Field;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

/** Self-authored HTTP/XML/UDP fixtures; host checks, never claims DC-S5 verification. */
public final class WifiS5Checks {
    private static int checks;
    private interface Action {void run() throws Exception;}
    private static void check(boolean value,String message){checks++;if(!value)throw new AssertionError(message);}
    private static void reject(Action action,String message) throws Exception {try{action.run();throw new AssertionError(message);}catch(IOException expected){checks++;}}
    private static byte[] bytes(String text){return text.getBytes(StandardCharsets.UTF_8);}
    private static String escape(String text){return text.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\"","&quot;");}
    private static String ok(String content){return "<camrply><result>ok</result>"+content+"</camrply>";}
    private static String media(String id,String parent,String tag,String url,int size){return "<item id='"+id+"' parentID='"+parent+"'><title>"+id+".JPG</title><res protocolInfo='http-get:*:image/jpeg:PANASONIC.COM_PN=CAM_LRGTN'>"+url+"</res><res protocolInfo='http-get:*:application/octet-stream;PANASONIC.COM_PN="+tag+"' size='"+size+"'>"+url+"</res></item>";}
    private static String soap(String items,int returned,int total){return "<Envelope><Body><BrowseResponse><Result>"+escape("<DIDL-Lite>"+items+"</DIDL-Lite>")+"</Result><NumberReturned>"+returned+"</NumberReturned><TotalMatches>"+total+"</TotalMatches><UpdateID>1</UpdateID></BrowseResponse></Body></Envelope>";}
    private static Map<String,WifiS5Protocol.Item> map(WifiS5Protocol.Page page){Map<String,WifiS5Protocol.Item> out=new LinkedHashMap<>();for(var item:page.items())out.put(item.identity(),item);return out;}
    private static void parsing(Path root) throws Exception {
        check(WifiS5Protocol.reply(bytes(ok("<setting><iso>400</iso></setting>"))).first("iso").equals("400"),"XML readout parsed");
        reject(()->WifiS5Protocol.reply(bytes("<camrply><result>err-reject</result></camrply>")).requireOk(),"HTTP 200 cannot hide protocol refusal");
        reject(()->WifiS5Protocol.reply(bytes("<camrply><state/></camrply>")),"missing result refused");
        reject(()->WifiS5Protocol.xml(bytes("<!DOCTYPE x [<!ENTITY e SYSTEM 'file:///private-fixture'>]><x>&e;</x>")),"external entity refused");
        check(WifiS5Protocol.reply(bytes("ok,\"Camera, fixture\",remote,open,private-fixture-token")).fields().size()==4,"quoted CSV fields preserved");
        reject(()->WifiS5Protocol.reply(bytes("ok,\"unterminated")),"truncated CSV refused");
        check(WifiS5Protocol.gen2("req_acc_g",bytes("ok,01020304"),null).reason().equals("需要真机抓包确认"),"gen2 challenge parses with explicit unverified boundary");
        check(WifiS5Protocol.gen2("req_acc_e",bytes("ok,\"Fixture, name\",remote,open,fixture-token"),"fixture-header").sessionHeader().equals("fixture-header"),"gen2 session envelope only, no response calculation");
        reject(()->WifiS5Protocol.cameraUrl("8.8.8.8",false),"production refuses public IP");
        reject(()->WifiS5Protocol.cameraUrl("10.0.2.2:18080",false),"custom port debug only");
        reject(()->WifiS5Protocol.cameraUrl("192.168.54.1/path",false),"endpoint cannot contain command path");
        URL base=WifiS5Protocol.cameraUrl("127.0.0.1:18080",true);
        reject(()->WifiS5Protocol.resource(base,"http://other.example/a.JPG"),"off-camera media refused");
        reject(()->WifiS5Protocol.resource(base,"/cam.cgi?mode=camcmd&value=capture"),"command as media refused");
        reject(()->WifiS5Protocol.resource(base,"/%63am.cgi?mode=camcmd&value=capture"),"encoded command as media refused");
        String item=media("new","card-a","CAM_ORG",base+"/original.JPG",512);
        var parsed=WifiS5Protocol.browse(bytes(soap(item,1,1)),base);
        check(parsed.items().get(0).originals().size()==1,"thumbnail never selected as original");
        var original=WifiS5Protocol.uniqueNew(Map.of(),map(parsed));check(original.size()==512 && original.filename().equals("new.JPG"),"original size and filename preserved");
        check(WifiS5Protocol.uniqueNew(map(parsed),map(parsed))==null,"old JPEG not substituted");
        var raw=WifiS5Protocol.browse(bytes(soap(media("new","card-a","CAM_RAW_JPG",base+"/raw-pair.JPG",1),1,1)),base);
        check(raw.items().get(0).originals().size()==1,"RAW+JPEG octet-stream original accepted");
        raw=WifiS5Protocol.browse(bytes(soap(media("raw","card-a","CAM_RAW",base+"/raw.JPG",1),1,1)),base);
        check(raw.items().get(0).originals().isEmpty(),"RAW resource rejected");
        var duplicate=WifiS5Protocol.browse(bytes(soap(item+media("new","card-b","CAM_ORG",base+"/second.JPG",512),2,2)),base);
        reject(()->WifiS5Protocol.uniqueNew(Map.of(),map(duplicate)),"two cards with the same filename refuse ambiguity");
        reject(()->WifiS5Protocol.browse(bytes(soap(item,0,1)),base),"truncated/miscounted page refused");
        reject(()->WifiS5Protocol.browse(bytes("<Envelope><Fault/></Envelope>"),base),"SOAP fault refused");
        byte[] jpeg=Files.readAllBytes(root.resolve("preview.jpg"));int[] dimensions=WifiS5Protocol.jpeg(new ByteArrayInputStream(jpeg),65535);
        check(dimensions[0]==64 && dimensions[1]==48,"SOF dimensions verified");
        byte[] packet=new byte[jpeg.length+8];System.arraycopy(jpeg,0,packet,8,jpeg.length);
        check(Arrays.equals(WifiS5Protocol.datagram(packet,packet.length),jpeg),"bounded datagram header accepted");
        check(WifiS5Protocol.datagram(jpeg,jpeg.length-2)==null,"partial JPEG dropped");
        check(WifiS5Protocol.datagram(Arrays.copyOf(jpeg,jpeg.length+2),jpeg.length+2)==null,"trailing bytes dropped");
        reject(()->WifiS5Protocol.jpeg(new ByteArrayInputStream(jpeg),16),"JPEG size bound enforced");
        byte[] missingSof=jpeg.clone();for(int i=0;i<missingSof.length-1;i++)if((missingSof[i]&255)==255 && (missingSof[i+1]&255)==0xc0){missingSof[i+1]=(byte)0xe2;break;}
        reject(()->WifiS5Protocol.jpeg(new ByteArrayInputStream(missingSof),65535),"missing SOF rejected");
        FrameRing ring=new FrameRing(4_500_000,1024*1024);for(long at=0;at<=3_000_000;at+=100_000)ring.add(at,jpeg);
        check(!ring.preCaptureWindow(3_000_000).isEmpty(),"received Wi-Fi timestamps use shared three-second gate");
        check(ring.preCaptureWindow(3_500_001).isEmpty(),"stale last Wi-Fi frame closes gate at 500 ms");
    }
    private static final class Fixture implements AutoCloseable {
        final HttpServer server;final ExecutorService workers=Executors.newCachedThreadPool();final ScheduledExecutorService stream=Executors.newSingleThreadScheduledExecutor();
        final AtomicInteger shots=new AtomicInteger(),browse=new AtomicInteger(),states=new AtomicInteger(),names=new AtomicInteger(),auth=new AtomicInteger();
        final List<String> controls=Collections.synchronizedList(new ArrayList<>());final List<String> photoIds=Collections.synchronizedList(new ArrayList<>());
        final byte[] preview,original;final String base;volatile int udpPort;volatile boolean focus=true,noUdp,redirect,truncate,wrongSize,refuseAuth,gen2,refuseShutter,chunked;volatile long captureDelay;
        Fixture(Path root,int oldCount) throws Exception {
            preview=Files.readAllBytes(root.resolve("preview.jpg"));original=Files.readAllBytes(root.resolve("original.jpg"));
            server=HttpServer.create(new InetSocketAddress("127.0.0.1",0),0);base="http://127.0.0.1:"+server.getAddress().getPort();
            for(int i=0;i<oldCount;i++)photoIds.add("old-"+i);
            server.setExecutor(workers);server.createContext("/",this::handle);server.start();
            stream.scheduleWithFixedDelay(()->{if(udpPort==0||noUdp)return;try(DatagramSocket socket=new DatagramSocket()){socket.send(new DatagramPacket(preview,preview.length,InetAddress.getLoopbackAddress(),udpPort));}catch(IOException ignored){}},0,10,TimeUnit.MILLISECONDS);
        }
        private void send(HttpExchange exchange,String text) throws IOException {send(exchange,bytes(text));}
        private void send(HttpExchange exchange,byte[] data) throws IOException {exchange.sendResponseHeaders(200,data.length);try(OutputStream out=exchange.getResponseBody()){out.write(data);}}
        private void handle(HttpExchange exchange) throws IOException {
            try {
                String path=exchange.getRequestURI().getPath();Map<String,String> query=new HashMap<>();String raw=exchange.getRequestURI().getRawQuery();
                if(raw!=null)for(String field:raw.split("&")){String[] pair=field.split("=",2);query.put(pair[0],URLDecoder.decode(pair.length==2?pair[1]:"",StandardCharsets.UTF_8));}
                if(path.equals("/Lumix/Server0/ddd")){send(exchange,"<root><device><modelName>MOCK-DC-S5</modelName><serviceList><service><serviceType>"+WifiS5Protocol.CDS+"</serviceType><controlURL>/CDS_control</controlURL></service></serviceList></device></root>");return;}
                if(path.equals("/CDS_control")){
                    browse.incrementAndGet();var doc=WifiS5Protocol.xml(exchange.getRequestBody().readAllBytes());int start=Integer.parseInt(WifiS5Protocol.text(doc,"StartingIndex"));List<String> photos;
                    synchronized(photoIds){photos=new ArrayList<>(photoIds);}StringBuilder items=new StringBuilder();int end=Math.min(start+100,photos.size());
                    for(int i=start;i<end;i++)items.append(media(photos.get(i),"0","CAM_ORG",base+"/"+(redirect?"redirect":photos.get(i))+".JPG",original.length+(wrongSize?1:0)));
                    send(exchange,soap(items.toString(),end-start,photos.size()));return;
                }
                if(path.endsWith(".JPG")){
                    if(redirect){exchange.getResponseHeaders().add("Location",base+"/cam.cgi?mode=camcmd&value=capture");exchange.sendResponseHeaders(302,-1);exchange.close();return;}
                    byte[] image=original.clone();if(truncate)image[image.length-1]=0;
                    if(chunked){exchange.sendResponseHeaders(200,0);try(OutputStream out=exchange.getResponseBody()){out.write(image,0,100);out.flush();out.write(image,100,image.length-100);}}else send(exchange,image);return;
                }
                if(!path.equals("/cam.cgi")){exchange.sendResponseHeaders(404,-1);exchange.close();return;}
                String mode=query.get("mode"),kind=query.get("type"),value=query.get("value");controls.add(mode+":"+kind+":"+value);
                if("accctrl".equals(mode)){auth.incrementAndGet();exchange.getResponseHeaders().set("X-SESSION_ID","self-authored-token");send(exchange,gen2?ok("<challenge>self-authored-envelope</challenge>"):refuseAuth?"<camrply><result>err-reject</result></camrply>":ok(""));return;}
                if("setsetting".equals(mode))names.incrementAndGet();
                if("getinfo".equals(mode)){send(exchange,ok(focus?"<capability><camcmd>oneshot_af</camcmd><step>focus wide-slow tele-slow</step></capability>":"<capability/>"));return;}
                if("getsetting".equals(mode)){send(exchange,ok("<setting><"+kind+">400</"+kind+"></setting>"));return;}
                if("getstate".equals(mode))states.incrementAndGet();
                if("startstream".equals(mode))udpPort=Integer.parseInt(value);if("stopstream".equals(mode))udpPort=0;
                if("camcmd".equals(mode) && "capture".equals(value)){
                    int shot=shots.incrementAndGet();if(!refuseShutter)photoIds.add("new-"+shot);
                    try{Thread.sleep(captureDelay);}catch(InterruptedException e){Thread.currentThread().interrupt();}
                    if(refuseShutter){send(exchange,"<camrply><result>err-busy</result></camrply>");return;}
                }
                send(exchange,ok(""));
            }catch(IOException ignored){exchange.close();}
        }
        public void close(){stream.shutdownNow();server.stop(0);workers.shutdownNow();}
    }
    private static WifiS5Transport transport(Fixture fixture,List<String> logs) throws IOException {
        return transport(fixture,logs,()->System.nanoTime()/1000);
    }
    private static WifiS5Transport transport(Fixture fixture,List<String> logs,java.util.function.LongSupplier clock) throws IOException {
        return new WifiS5Transport(new WifiCameraHttp.Route(){
            public Socket connect(String host,int port) throws IOException {Socket socket=new Socket();socket.connect(new InetSocketAddress(host,port),1000);return socket;}
            public void bind(DatagramSocket socket){}
            public void close(){}
        },"127.0.0.1:"+fixture.server.getAddress().getPort(),0,true,logs::add,clock);
    }
    private static void transportChecks(Path fixtures,Path output) throws Exception {
        try(Fixture fixture=new Fixture(fixtures,1);WifiCameraHttp http=new WifiCameraHttp(new WifiCameraHttp.Route(){
            public Socket connect(String host,int port)throws IOException {return new Socket(host,port);}
            public void bind(DatagramSocket socket){}
            public void close(){}
        })) {
            reject(()->http.request(new URL(fixture.base+"/cam.cgi?mode=getstate"),"GET",null,Map.of("X-SESSION_ID","fixture\r\n\r\nGET /cam.cgi?mode=camcmd&value=capture HTTP/1.1"),1000),"CRLF session header injection accepted");
            check(fixture.shots.get()==0 && fixture.controls.isEmpty(),"invalid headers rejected before any camera request is written");
        }
        try(Fixture fixture=new Fixture(fixtures,101);WifiS5Transport camera=transport(fixture,new ArrayList<>())) {
            camera.open();check(fixture.auth.get()==1 && fixture.names.get()==1,"single legacy access and device-name registration");
            long exposureAt=camera.exposureUpdatedAtUs();check(exposureAt>0,"Wi-Fi exposure records a source-read monotonic timestamp");
            String rawExposure=camera.exposure();check(rawExposure.contains("ISO 400") && rawExposure.contains("f/400") && rawExposure.contains("快门 400"),"Wi-Fi exposure getter preserves source strings without guessing encoded units");
            for(int i=0;i<100;i++){camera.exposure();camera.exposureUpdatedAtUs();}
            check(camera.exposureUpdatedAtUs()==exposureAt,"reading cached Wi-Fi state never fabricates a fresh sample timestamp");
            reject(camera::shutter,"no shutter without baseline");var baseline=camera.prepareCaptureBaseline();check(fixture.browse.get()==2,"catalog paginates beyond first 100");
            check(camera.capabilities().autofocus() && camera.capabilities().manualFocus(),"declared focus controls enabled");camera.autofocus();camera.focus(true);camera.focus(false);
            check(fixture.controls.contains("camcmd:null:oneshot_af") && fixture.controls.contains("camctrl:focus:tele-slow") && fixture.controls.contains("camctrl:focus:wide-slow"),"AF/MF candidate mapping");
            Thread.sleep(150);CameraTransport.Preview frame=camera.preview();check(frame!=null && Arrays.equals(frame.jpeg(),fixture.preview),"actual UDP receives a complete JPEG");
            Field queue=WifiS5Transport.class.getDeclaredField("frames");queue.setAccessible(true);Thread.sleep(100);check(((ArrayBlockingQueue<?>)queue.get(camera)).size()<=3,"receiver queue bounded");
            List<Thread> requests=new ArrayList<>();AtomicInteger success=new AtomicInteger();for(int i=0;i<20;i++){Thread request=new Thread(()->{try{camera.shutter();success.incrementAndGet();}catch(IOException expected){}});requests.add(request);request.start();}for(Thread request:requests)request.join();
            check(success.get()==1 && fixture.shots.get()==1,"concurrent shutter dispatches exactly once");
            reject(()->camera.awaitNewJpeg(new CameraTransport.Baseline(){},()->true),"baseline cannot cross a session");
            var source=camera.awaitNewJpeg(baseline,()->true);check(source.filename().equals("new-1.JPG"),"unique new original chosen independently of catalog ordering");
            fixture.chunked=true;Path target=output.resolve("original.jpg");camera.downloadOriginal(source,target.toFile());check(Arrays.equals(Files.readAllBytes(target),fixture.original),"streamed chunked original preserves exact fixture bytes");
            check(!Files.exists(output.resolve("original.jpg.wifi.part")) && camera.state()==WifiS5Transport.State.READY,"atomic publication removes part and returns ready");
            Thread.sleep(2100);check(fixture.states.get()>=2,"serialized getstate keepalive runs");
            check(camera.exposureUpdatedAtUs()>exposureAt,"existing Wi-Fi keeper refresh advances exposure source age");
            camera.close();check(camera.closed(),"close releases receiver and keepalive");
        }
        try(Fixture fixture=new Fixture(fixtures,1);WifiS5Transport camera=transport(fixture,new ArrayList<>())) {
            fixture.focus=false;camera.open();check(!camera.capabilities().autofocus()&&!camera.capabilities().manualFocus(),"unsupported focus hidden after read-only probing");reject(camera::autofocus,"unsupported AF cannot dispatch");check(fixture.shots.get()==0,"capability probing never takes photos");
            var baseline=camera.prepareCaptureBaseline();camera.shutter();fixture.photoIds.add("second-new");reject(()->camera.awaitNewJpeg(baseline,()->true),"ambiguous new JPEG fails");check(camera.closed() && fixture.shots.get()==1,"ambiguity closes session without retry or old file");
        }
        for(String kind:List.of("redirect","truncate","wrong-size"))try(Fixture fixture=new Fixture(fixtures,1);WifiS5Transport camera=transport(fixture,new ArrayList<>())) {
            camera.open();var baseline=camera.prepareCaptureBaseline();camera.shutter();if(kind.equals("wrong-size"))fixture.wrongSize=true;var source=camera.awaitNewJpeg(baseline,()->true);
            if(kind.equals("redirect"))fixture.redirect=true;if(kind.equals("truncate"))fixture.truncate=true;
            Path target=output.resolve(kind+".jpg");reject(()->camera.downloadOriginal(source,target.toFile()),"unsafe "+kind+" original accepted");
            check(!Files.exists(target)&&!Files.exists(output.resolve(kind+".jpg.wifi.part")),"failed download never publishes partial file");check(fixture.shots.get()==1,"download failure never replays shutter");
        }
        try(Fixture fixture=new Fixture(fixtures,1)) {
            fixture.noUdp=true;AtomicLong clock=new AtomicLong(1);
            try(WifiS5Transport camera=transport(fixture,new ArrayList<>(),clock::get)){camera.open();clock.set(11_000_001);reject(camera::preview,"no complete UDP frames must report a readable failure");check(fixture.shots.get()==0,"no-frame failure does not trigger shutter");}
        }
        try(Fixture fixture=new Fixture(fixtures,1);WifiS5Transport camera=transport(fixture,new ArrayList<>())) {
            camera.open();var baseline=camera.prepareCaptureBaseline();camera.shutter();reject(()->camera.awaitNewJpeg(baseline,()->false),"cancelled capture cannot download another original");check(camera.closed()&&fixture.shots.get()==1,"cancellation closes active session");
        }
        try(Fixture fixture=new Fixture(fixtures,1);WifiS5Transport camera=transport(fixture,new ArrayList<>())) {
            fixture.captureDelay=5500;camera.open();camera.prepareCaptureBaseline();reject(camera::shutter,"lost shutter response accepted");reject(camera::shutter,"uncertain shutter retried");check(fixture.shots.get()==1&&camera.closed()&&camera.state()==WifiS5Transport.State.FAILED,"timeout leaves terminal uncertainty and exactly one request");
        }
        for(String kind:List.of("auth-refused","gen2","shutter-refused"))try(Fixture fixture=new Fixture(fixtures,1);WifiS5Transport camera=transport(fixture,new ArrayList<>())) {
            if(kind.equals("auth-refused"))fixture.refuseAuth=true;if(kind.equals("gen2"))fixture.gen2=true;
            if(kind.equals("shutter-refused")){fixture.refuseShutter=true;camera.open();camera.prepareCaptureBaseline();reject(camera::shutter,"refused shutter accepted");check(fixture.shots.get()==1,"refused shutter never retried");}
            else {reject(camera::open,"unsupported auth accepted");check(fixture.auth.get()==1 && fixture.shots.get()==0 && fixture.names.get()==0,"auth refusal/gen2 stops before registration or shutter");}
            check(camera.closed(),"failed connection cleans up");
        }
    }
    public static void main(String[] args) throws Exception {
        Path fixtures=Path.of("tests/fixtures/s5-wifi"),output=Files.createTempDirectory("wifi-checks-");
        try{parsing(fixtures);transportChecks(fixtures,output);}finally{try(var files=Files.walk(output)){for(Path path:files.sorted(Comparator.reverseOrder()).toList())Files.delete(path);}}
        System.out.println("PASS "+checks+" Wi-Fi checks (self-authored host fixtures; DC-S5 unverified)");
    }
}
