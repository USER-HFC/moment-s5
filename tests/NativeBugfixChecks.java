package cn.moment.lumix;

import android.content.*;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.hardware.usb.*;
import android.media.*;
import java.io.*;
import java.lang.reflect.*;
import java.nio.ByteBuffer;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.*;

/** Host regressions using explicit Android doubles, not an Android/device test. */
public final class NativeBugfixChecks {
    private static int checks;
    private interface Action {void run()throws Exception;}
    private static void check(boolean ok,String message){checks++;if(!ok)throw new AssertionError(message);}
    private static void expectIo(Action action,String message)throws Exception {
        try{action.run();throw new AssertionError(message);}catch(IOException expected){checks++;}
    }
    private static Field field(Class<?> type,String name)throws Exception {Field field=type.getDeclaredField(name);field.setAccessible(true);return field;}
    private static String cube(int size){
        StringBuilder text=new StringBuilder();
        for(int b=0;b<size;b++)for(int g=0;g<size;g++)for(int r=0;r<size;r++)text.append(r/(float)(size-1)).append(' ').append(g/(float)(size-1)).append(' ').append(b/(float)(size-1)).append('\n');
        return text.toString();
    }
    private static float[] sample(LutEngine lut,float r,float g,float b)throws Exception {
        Method sample=LutEngine.class.getDeclaredMethod("sample",float.class,float.class,float.class);sample.setAccessible(true);
        return (float[])sample.invoke(lut,r,g,b);
    }
    private static void lutChecks(Path root)throws Exception {
        File file=root.resolve("temporary.part").toFile();String rows=cube(2);
        Files.writeString(file.toPath(),"\uFEFFtitle \"城市 # 夜\" # outside comment\n lut_3d_size 2\n"+rows);
        LutEngine lut=LutEngine.load(file,"chosen.cube");
        check(lut.title.equals("城市 # 夜"),"quoted hash survives comment parsing");
        float[] rgb=sample(lut,.2f,.4f,.6f);
        check(Math.abs(rgb[0]-.2)<.00001 && Math.abs(rgb[1]-.4)<.00001 && Math.abs(rgb[2]-.6)<.00001,"red-fastest trilinear identity");
        Files.writeString(file.toPath(),"LUT_3D_SIZE 17\n"+cube(17));lut=LutEngine.load(file,"chosen.cube");
        check(lut.title.equals("chosen.cube"),"titleless import uses supplied filename instead of random temporary filename");
        rgb=sample(lut,.25f,.5f,.75f);check(Math.abs(rgb[2]-.75)<.00001,"non-33 grid interpolates correctly");
        Files.writeString(file.toPath(),"LUT_3D_SIZE 2\nDOMAIN_MIN -1 -1 -1\nDOMAIN_MAX 2 2 2\n"+rows);
        rgb=sample(LutEngine.load(file),0,0,0);check(Math.abs(rgb[0]-1f/3)<.00001,"domain normalization");
        Files.writeString(file.toPath(),"LUT_3D_SIZE 2\nLUT_3D_INPUT_RANGE -1 2\n"+rows);
        rgb=sample(LutEngine.load(file),0,0,0);check(Math.abs(rgb[0]-1f/3)<.00001,"Resolve 3D input-range header normalizes each channel");
        Files.writeString(file.toPath(),"LUT_3D_SIZE 2\nDOMAIN_MIN -3.4e38 -3.4e38 -3.4e38\nDOMAIN_MAX 3.4e38 3.4e38 3.4e38\n"+rows);
        rgb=sample(LutEngine.load(file),0,0,0);check(Math.abs(rgb[0]-.5)<.00001,"finite domain span cannot overflow");
        for(String header:new String[]{"LUT_3D_SIZE 2\nLUT_3D_SIZE 2\n","LUT_3D_SIZE 2\nDOMAIN_MIN NaN 0 0\n","LUT_3D_SIZE 2\nDOMAIN_MAX 0 1 1\n","LUT_1D_SIZE 2\n","LUT_3D_SIZE 65\n","LUT_3D_SIZE 2\nLUT_3D_INPUT_RANGE NaN 1\n","LUT_3D_SIZE 2\nLUT_3D_INPUT_RANGE 1 0\n","LUT_3D_SIZE 2\nLUT_3D_INPUT_RANGE 0 1\nLUT_3D_INPUT_RANGE 0 1\n","LUT_3D_SIZE 2\nDOMAIN_MIN 0 0 0\nLUT_3D_INPUT_RANGE 0 1\n"}) {
            Files.writeString(file.toPath(),header+rows);expectIo(()->LutEngine.load(file),"invalid cube header accepted");
        }
        Files.writeString(file.toPath(),"LUT_3D_SIZE 2\n0 0 0\n");expectIo(()->LutEngine.load(file),"truncated rows accepted");
        Files.writeString(file.toPath(),"LUT_3D_SIZE 2\n"+rows+"0 0 0\n");expectIo(()->LutEngine.load(file),"excess rows accepted");
        Files.writeString(file.toPath(),"LUT_3D_SIZE 2\n"+rows);lut=LutEngine.load(file);LutEngine filter=lut;
        check(filter.applyJpeg(new byte[]{1}).length==4,"decoded ARGB bitmap is mutable before pixel writes");
        check(BitmapFactory.last.isRecycled(),"successful LUT render releases bitmap");
        Bitmap.failPixels=true;expectIo(()->filter.applyJpeg(new byte[]{1}),"pixel failure not converted to IO error");
        check(BitmapFactory.last.isRecycled(),"pixel failure releases bitmap");Bitmap.failPixels=false;
        int before=BitmapFactory.decoded;BitmapFactory.width=10000;BitmapFactory.height=10000;
        expectIo(()->filter.applyJpeg(new byte[]{1}),"oversized image accepted");
        check(BitmapFactory.decoded==before,"oversized dimensions checked before decoding pixels");BitmapFactory.width=2;BitmapFactory.height=2;
    }
    @SuppressWarnings("unchecked") private static void audioChecks()throws Exception {
        AudioRing ring=new AudioRing();ArrayDeque<Object> blocks=(ArrayDeque<Object>)field(AudioRing.class,"ring").get(ring);
        Constructor<?> block=Class.forName("cn.moment.lumix.AudioRing$Block").getDeclaredConstructor(long.class,short[].class);block.setAccessible(true);
        blocks.add(block.newInstance(0L,new short[2400]));blocks.add(block.newInstance(0L,new short[2400]));
        expectIo(()->ring.slice(0,100_000),"overlapping samples counted twice as full coverage");
        blocks.clear();short[] full=new short[4800];Arrays.fill(full,(short)42);blocks.add(block.newInstance(0L,full));
        check(Arrays.equals(ring.slice(0,100_000),full),"full, unique PCM coverage preserved");
        expectIo(()->ring.slice(0,6_000_000),"oversized audio window accepted");ring.close();
        AudioRecord.failStart=true;int before=AudioRecord.released;
        expectIo(ring::start,"failed microphone start accepted");
        check(AudioRecord.released==before+1 && field(AudioRing.class,"recorder").get(ring)==null,"start failure releases recorder immediately");AudioRecord.failStart=false;
        CountDownLatch resume=new CountDownLatch(1);Thread oldReader=new Thread(()->{try{resume.await();}catch(InterruptedException e){Thread.currentThread().interrupt();}});
        field(AudioRing.class,"thread").set(ring,oldReader);oldReader.start();
        try{expectIo(ring::start,"recorder restarted while previous reader still alive");}finally{resume.countDown();oldReader.join();}
        AudioRecord.readOnce=true;ring.start();((Thread)field(AudioRing.class,"thread").get(ring)).join(1000);ring.close();
        check(AudioRecord.lastTimebase==AudioTimestamp.TIMEBASE_BOOTTIME,"audio timestamps share elapsedRealtimeNanos timebase, including suspend time");
    }
    private static byte[] container(int type,int code,int tx,byte[] payload){
        return Ptp.le(new byte[12+payload.length]).putInt(12+payload.length).putShort((short)type).putShort((short)code).putInt(tx).put(payload).array();
    }
    private static void ptpString(ByteArrayOutputStream out,String value)throws IOException {
        out.write(value.length()+1);out.write(value.getBytes(java.nio.charset.StandardCharsets.UTF_16LE));out.write(0);out.write(0);
    }
    private static byte[] description()throws IOException {
        ByteArrayOutputStream out=new ByteArrayOutputStream();out.write(new byte[8]);out.write(0);out.write(new byte[2+5*4]);
        ptpString(out,"Panasonic");ptpString(out,"DC-S5");ptpString(out,"2.9");return out.toByteArray();
    }
    private static UsbManager manager()throws IOException {
        UsbManager manager=new UsbManager();byte[] info=description();
        manager.connection.respond=command->{ByteBuffer bytes=Ptp.le(command);int op=bytes.getShort(6)&65535,tx=bytes.getInt(8);
            byte[] response=container(3,0x2001,tx,new byte[0]);
            if(op!=0x1001)return response;
            byte[] data=container(2,op,tx,info),both=Arrays.copyOf(data,data.length+response.length);System.arraycopy(response,0,both,data.length,response.length);return both;
        };return manager;
    }
    private static void usbChecks()throws Exception {
        UsbManager manager=manager();UsbS5 camera=new UsbS5(manager,new UsbDevice(),s->{});camera.open();
        List<byte[]> commands=manager.connection.commands;
        check(Ptp.le(commands.get(0)).getInt(8)==0 && Ptp.le(commands.get(1)).getInt(8)==0,"GetDeviceInfo and OpenSession both use transaction zero");
        check(Ptp.le(commands.get(2)).getInt(8)==1,"first in-session transaction is one");
        manager.connection.respond=command->container(3,(Ptp.le(command).getShort(6)&65535)==0x9404?0x2019:0x2001,Ptp.le(command).getInt(8),new byte[0]);
        expectIo(camera::shutter,"camera-busy response accepted");check(!camera.closed(),"ordinary PTP response error keeps transport usable");camera.close();
        check(manager.connection.closed && manager.connection.released==1,"normal session close releases USB interface and connection");
        manager=manager();camera=new UsbS5(manager,new UsbDevice(),s->{});camera.open();
        manager.connection.respond=command->container(3,0x2001,Ptp.le(command).getInt(8)+1,new byte[0]);
        expectIo(camera::shutter,"wrong transaction accepted");check(camera.closed() && manager.connection.closed,"framing error aborts USB transport");
        check(manager.connection.commands.stream().filter(b->(Ptp.le(b).getShort(6)&65535)==0x9404).count()==1,"failed shutter never retried");
    }
    private static void batteryChecks() {
        check(PhoneBatteryMonitor.decode(37,100,2,true).equals(new PhoneBatteryMonitor.Reading(37,true)),"phone battery uses Android level / scale and actual charging status");
        check(PhoneBatteryMonitor.decode(1,4,3,true).equals(new PhoneBatteryMonitor.Reading(25,false)),"non-percent Android scale is converted correctly");
        check(PhoneBatteryMonitor.decode(0,100,3,true).percent()==0,"zero phone battery is a real reading");
        for(int[] invalid:new int[][]{{-1,100},{101,100},{50,0},{50,-1}})check(PhoneBatteryMonitor.decode(invalid[0],invalid[1],2,true).percent()==null,"invalid battery values remain unavailable");
        check(PhoneBatteryMonitor.decode(100,100,5,false).percent()==null,"missing physical battery is not fabricated");
        class Source implements PhoneBatteryMonitor.Source {
            int starts,stops;java.util.function.Consumer<PhoneBatteryMonitor.Reading> listener;
            PhoneBatteryMonitor.Reading value=new PhoneBatteryMonitor.Reading(51,false);
            public PhoneBatteryMonitor.Reading subscribe(java.util.function.Consumer<PhoneBatteryMonitor.Reading> changed){starts++;listener=changed;return value;}
            public void unsubscribe(){stops++;}
        }
        Source source=new Source();List<PhoneBatteryMonitor.Reading> events=new ArrayList<>();
        PhoneBatteryMonitor monitor=new PhoneBatteryMonitor(source,events::add);
        check(monitor.latest().percent()==null && source.starts==0,"battery does not subscribe before foreground");
        monitor.onHostResume();monitor.onHostResume();
        check(source.starts==1 && monitor.latest().percent()==51,"one foreground battery subscription, initialized from sticky intent");
        source.listener.accept(new PhoneBatteryMonitor.Reading(37,true));
        check(monitor.latest().percent()==37 && events.size()==2,"battery broadcast updates cached state without a poll");
        monitor.onHostPause();monitor.onHostPause();int count=events.size();
        source.listener.accept(new PhoneBatteryMonitor.Reading(99,false));
        check(source.stops==1 && monitor.latest().percent()==null && events.size()==count,"pause unsubscribes once and rejects late broadcasts / stale battery");
        source.value=new PhoneBatteryMonitor.Reading(32,false);monitor.onHostResume();
        check(source.starts==2 && monitor.latest().percent()==32,"resume obtains a new sticky reading instead of displaying old percent");
        monitor.onHostDestroy();source.value=new PhoneBatteryMonitor.Reading(31,false);monitor.onHostResume();
        check(source.stops==2 && source.starts==3 && monitor.latest().percent()==31,"activity recreation releases and re-subscribes while the React bridge survives");
        monitor.close();monitor.close();monitor.onHostResume();source.listener.accept(new PhoneBatteryMonitor.Reading(99,false));
        check(source.stops==3 && source.starts==3 && monitor.latest().percent()==null,"bridge invalidation cleans up permanently and rejects late callbacks");
        AtomicInteger cleanup=new AtomicInteger();PhoneBatteryMonitor unavailable=new PhoneBatteryMonitor(new PhoneBatteryMonitor.Source(){
            public PhoneBatteryMonitor.Reading subscribe(java.util.function.Consumer<PhoneBatteryMonitor.Reading> changed){throw new IllegalStateException("host stopping");}
            public void unsubscribe(){cleanup.incrementAndGet();}
        },reading->{});
        unavailable.onHostResume();unavailable.close();
        check(unavailable.latest().percent()==null && cleanup.get()==1,"registration failure leaves an unavailable reading and no leaked receiver");
    }
    private static ExecutorService worker(CaptureEngine engine)throws Exception {return (ExecutorService)field(CaptureEngine.class,"worker").get(engine);}
    private static CountDownLatch block(CaptureEngine engine)throws Exception {
        CountDownLatch entered=new CountDownLatch(1),resume=new CountDownLatch(1);
        worker(engine).execute(()->{entered.countDown();try{resume.await(5,TimeUnit.SECONDS);}catch(InterruptedException e){Thread.currentThread().interrupt();}});
        if(!entered.await(2,TimeUnit.SECONDS))throw new AssertionError("worker did not pause");return resume;
    }
    private static void settle(CaptureEngine engine)throws Exception {worker(engine).submit(()->{}).get(3,TimeUnit.SECONDS);}
    private static void warm(CaptureEngine engine)throws Exception {
        field(CaptureEngine.class,"active").set(engine,true);field(CaptureEngine.class,"demo").set(engine,true);
        FrameRing frames=(FrameRing)field(CaptureEngine.class,"ring").get(engine);long end=CaptureEngine.now();
        for(long t=end-3_100_000;t<=end;t+=100_000)frames.add(t,new byte[]{1});
    }
    private static void engineChecks(Path root)throws Exception {
        AtomicReference<CaptureEngine> reference=new AtomicReference<>();AtomicInteger shots=new AtomicInteger();AtomicBoolean resultBusy=new AtomicBoolean();
        AtomicReference<File> failed=new AtomicReference<>();AtomicBoolean failedBusy=new AtomicBoolean(),failHandoff=new AtomicBoolean();
        CaptureEngine engine=new CaptureEngine(new Context(root.toFile()),new CaptureEngine.Listener(){
            public void status(String s,boolean ready){if(s.startsWith("演示：遥控")){shots.incrementAndGet();resultBusy.set(reference.get().busy());}if(failHandoff.get() && s.startsWith("原片已接收"))throw new IllegalStateException("test export handoff failed");}
            public void frame(byte[] jpeg,long buffered,boolean demo){}
            public void saved(File dir){}
            public void failed(File dir,String error){failed.set(dir);failedBusy.set(reference.get().busy());}
            public void log(String text){}
            public void exposure(String text){}
        });reference.set(engine);
        try {
            field(CaptureEngine.class,"active").set(engine,true);field(CaptureEngine.class,"demo").set(engine,true);
            field(CaptureEngine.class,"preparedHandles").set(engine,new CameraTransport.Baseline(){});CountDownLatch resume=block(engine),go=new CountDownLatch(1);
            List<Thread> callers=new ArrayList<>();
            for(int i=0;i<40;i++){Thread caller=new Thread(()->{try{go.await();engine.remoteShutter();}catch(InterruptedException e){Thread.currentThread().interrupt();}});callers.add(caller);caller.start();}
            go.countDown();for(Thread caller:callers)caller.join();resume.countDown();settle(engine);
            check(shots.get()==1,"concurrent shutter requests dispatch exactly once");
            check(!resultBusy.get(),"remote completion observer sees busy=false");
            check(field(CaptureEngine.class,"preparedHandles").get(engine)==null,"remote shutter invalidates the old JPEG baseline");
            resume=block(engine);field(CaptureEngine.class,"microphone").set(engine,new AudioRing());engine.audio(false);
            check(field(CaptureEngine.class,"microphone").get(engine)==null,"audio off releases microphone before a blocked USB worker can run");resume.countDown();settle(engine);
            resume=block(engine);UsbManager manager=manager();engine.connect(manager,new UsbDevice());engine.disconnect();resume.countDown();settle(engine);
            check(manager.opened==0 && !engine.active(),"disconnect cancels a queued USB connect");
            resume=block(engine);engine.disconnect();UsbManager replacement=manager();engine.connect(replacement,new UsbDevice());resume.countDown();settle(engine);
            check(replacement.opened==1,"a new connect requested after disconnect is not cancelled by its queued cleanup");engine.disconnect();settle(engine);
            warm(engine);
            resume=block(engine);engine.capture();check(engine.busy(),"capture reserves the task before queueing");engine.disconnect();
            check(!engine.active(),"disconnect invalidates the session without waiting for worker");resume.countDown();settle(engine);
            check(!engine.busy() && new MomentStore(new Context(root.toFile())).list().isEmpty(),"cancelled queued capture produces no substitute demo or file");
            warm(engine);failHandoff.set(true);engine.capture();settle(engine);
            check(failed.get()!=null && !failedBusy.get(),"handoff failure observer sees completed busy state");
            var meta=MomentStore.metadata(failed.get());
            check(meta.getBoolean("demo") && meta.getString("source").equals("DEMO.jpg"),"handoff failure retains demo provenance and source metadata");
            check(new File(failed.get(),"original.jpg").isFile(),"handoff failure preserves the received original");
            failHandoff.set(false);failed.set(null);BitmapFactory.width=0;BitmapFactory.height=0;
            warm(engine);engine.capture();settle(engine);((ExecutorService)field(CaptureEngine.class,"exporter").get(engine)).submit(()->{}).get(3,TimeUnit.SECONDS);
            check(failed.get()!=null && !failedBusy.get() && !engine.busy(),"exporter failure event arrives after clearing busy");
            check(!MomentStore.metadata(failed.get()).getBoolean("complete") && new File(failed.get(),"original.jpg").isFile(),"encoder failure keeps an incomplete record and original");
            BitmapFactory.width=2;BitmapFactory.height=2;
            LutEngine previous=LutEngine.load(root.resolve("temporary.part").toFile()),next=LutEngine.load(root.resolve("temporary.part").toFile());
            engine.setLut(previous);CountDownLatch rendering=new CountDownLatch(1),continueRender=new CountDownLatch(1);AtomicReference<Throwable> renderError=new AtomicReference<>();
            BitmapFactory.beforePixels=()->{rendering.countDown();try{continueRender.await(3,TimeUnit.SECONDS);}catch(InterruptedException e){Thread.currentThread().interrupt();}};
            Method grab=CaptureEngine.class.getDeclaredMethod("grab");grab.setAccessible(true);
            Thread render=new Thread(()->{try{grab.invoke(engine);}catch(Throwable e){renderError.set(e);}});render.start();
            check(rendering.await(2,TimeUnit.SECONDS),"preview render paused during LUT transformation");engine.setLut(next);continueRender.countDown();render.join(3000);BitmapFactory.beforePixels=null;
            check(!render.isAlive() && renderError.get()==null,"in-flight preview render completes");
            check(((FrameRing)field(CaptureEngine.class,"ring").get(engine)).lastUs()==0,"old LUT render cannot refill the cleared new LUT ring");
            AtomicInteger connects=new AtomicInteger();CameraLifecycle lifecycle=new CameraLifecycle(engine,device->connects.incrementAndGet());UsbDevice device=new UsbDevice();
            lifecycle.request(device);lifecycle.onHostPause();check(lifecycle.permission(device,true),"matching USB permission accepted");
            check(connects.get()==0,"permission grant in background defers connection");lifecycle.onHostResume();check(connects.get()==1,"deferred permission connects once on resume");
            lifecycle.request(device);lifecycle.cancel();check(!lifecycle.permission(device,true) && connects.get()==1,"cancelled USB permission cannot reopen connection");
        }finally{engine.shutdown();worker(engine).awaitTermination(3,TimeUnit.SECONDS);}
    }
    private static void storeChecks(Path root)throws Exception {
        Context context=new Context(root.toFile());File dir=new MomentStore(context).create();byte[] bytes={1,2,3};Files.write(new File(dir,"MOMENT_MP.jpg").toPath(),bytes);
        MomentStore.metadata(dir,new org.json.JSONObject().put("captureMode","pre-only").put("complete",true));
        ContentResolver resolver=new ContentResolver();context.resolver=resolver;MomentStore.export(context,dir);
        check(Arrays.equals(resolver.output.toByteArray(),bytes),"successful MediaStore export preserves bytes");
        resolver=new ContentResolver();resolver.updated=0;resolver.failDelete=true;context.resolver=resolver;
        try{MomentStore.export(context,dir);throw new AssertionError("unpublished MediaStore row accepted");}
        catch(IOException expected){check(expected.getMessage().contains("发布失败") && expected.getSuppressed().length==1,"publish failure remains primary when cleanup also fails");}
        check(resolver.deleted==1,"failed MediaStore publication deletes pending row");
    }
    private static final class StillCamera implements CameraTransport {
        final Baseline baseline=new Baseline(){};
        final byte[] jpeg={-1,-40,12,34,-1,-39};
        final List<String> calls=new ArrayList<>();
        final boolean wifi;boolean closed,failDownload;int shutters,noted;
        StillCamera(boolean wifi){this.wifi=wifi;}
        public String kind(){return wifi?"wifi":"usb";}
        public void open(){}public Preview preview(){return null;}
        public Capabilities capabilities(){return new Capabilities(false,false,false);}
        int exposureReads;
        public void autofocus(){}public void focus(boolean far){}public String exposure(){exposureReads++;return "";}
        public boolean freshBaselineRequired(){return wifi;}
        public Baseline prepareCaptureBaseline(){calls.add("baseline");return baseline;}
        public void clearCaptureEvents(){calls.add("clear");}
        public void shutter(){calls.add("shutter");shutters++;}
        public Original awaitNewJpeg(Baseline before,java.util.function.BooleanSupplier valid)throws IOException{
            if(before!=baseline || !valid.getAsBoolean())throw new IOException("wrong capture baseline/session");
            calls.add("await");return new Original(this,"THIS_SHUTTER.JPG",jpeg.length);
        }
        public void noteSaved(Original photo){noted++;}
        public void downloadOriginal(Original original,File destination)throws IOException{
            if(original.key()!=this)throw new IOException("wrong original");calls.add("download");
            Files.write(destination.toPath(),jpeg);if(failDownload)throw new IOException("incomplete transfer");
        }
        public boolean closed(){return closed;}public void abort(){closed=true;}public void close(){closed=true;}
    }
    private static void stillChecks(Path root)throws Exception {
        Path files=Files.createDirectory(root.resolve("stills"));Context context=new Context(files.toFile());
        AtomicReference<File> saved=new AtomicReference<>(),failed=new AtomicReference<>();AtomicReference<CaptureEngine> reference=new AtomicReference<>();
        AtomicBoolean savedBusy=new AtomicBoolean();
        CaptureEngine engine=new CaptureEngine(context,new CaptureEngine.Listener(){
            public void status(String text,boolean ready){}public void frame(byte[] jpeg,long buffered,boolean demo){}
            public void saved(File dir){saved.set(dir);savedBusy.set(reference.get().busy());}
            public void failed(File dir,String error){failed.set(dir);}public void log(String text){}public void exposure(String text){}
        });reference.set(engine);
        try {
            StillCamera telemetry=new StillCamera(false);field(CaptureEngine.class,"camera").set(engine,telemetry);
            field(CaptureEngine.class,"active").set(engine,true);field(CaptureEngine.class,"exposureValue").set(engine,"ISO AUTO     f/4.0     1/80");field(CaptureEngine.class,"exposureReadUs").set(engine,CaptureEngine.now()-20_000_000);
            check(engine.exposureValue().equals("ISO AUTO     f/4.0     1/80") && engine.exposureAgeMs()>=20_000,"cached HUD state preserves exposure sample age");
            check(telemetry.exposureReads==0,"HUD state refresh never schedules / performs serialized USB I/O");
            field(CaptureEngine.class,"demo").set(engine,true);
            check(engine.exposureValue().equals("演示素材 · 无相机连接") && engine.exposureAgeMs()==-1,"demo cannot leak previous real exposure or timestamp");
            engine.disconnect();settle(engine);
            check(engine.exposureValue().isEmpty() && engine.exposureAgeMs()==-1,"disconnect immediately invalidates cached HUD exposure");
            File cube=files.resolve("shutter.cube").toFile();Files.writeString(cube.toPath(),"TITLE \"Shutter LUT\"\nLUT_3D_SIZE 2\n"+cube(2));
            LutEngine filter=LutEngine.load(cube);
            for(boolean wifi:new boolean[]{false,true})for(boolean filtered:new boolean[]{false,true}) {
                StillCamera camera=new StillCamera(wifi);field(CaptureEngine.class,"camera").set(engine,camera);
                field(CaptureEngine.class,"active").set(engine,true);field(CaptureEngine.class,"demo").set(engine,false);
                field(CaptureEngine.class,"preparedHandles").set(engine,camera.baseline);engine.setLut(filtered?filter:null);
                check(!engine.ready(),"ordinary still begins with no prebuffer");
                saved.set(null);CountDownLatch resume=block(engine);engine.captureStill();engine.captureStill();
                check(engine.busy(),"still task is reserved synchronously");
                if(filtered){
                    try{engine.setLut(null);throw new AssertionError("busy LUT change accepted");}catch(IllegalStateException expected){checks++;}
                    // Simulate a field change after the tap; rendering must still use the frozen reference.
                    field(CaptureEngine.class,"lut").set(engine,null);
                }
                resume.countDown();settle(engine);File dir=saved.get();
                check(dir!=null && !savedBusy.get() && failed.get()==null,"still completes with busy cleared before notification");
                check(camera.shutters==1,"duplicate ordinary capture dispatches exactly one shutter");
                check(camera.noted==1,"a saved still is recorded so the next shutter cannot pair it");
                check(camera.calls.indexOf("clear")<camera.calls.indexOf("shutter") && camera.calls.indexOf("shutter")<camera.calls.indexOf("await"),"same hardened event correlation orders clear, shutter, await");
                check(!wifi || camera.calls.get(0).equals("baseline"),"Wi-Fi still refreshes pre-shutter baseline");
                check(Arrays.equals(Files.readAllBytes(new File(dir,"original.jpg").toPath()),camera.jpeg),"original JPEG bytes remain immutable");
                var meta=MomentStore.metadata(dir);
                check(meta.getBoolean("complete") && meta.getString("captureMode").equals("photo") && meta.getString("source").equals("THIS_SHUTTER.JPG"),"static metadata records complete shutter source");
                check(meta.getInt("frames")==0 && meta.getLong("durationUs")==0 && !meta.getBoolean("audio"),"static capture has no frames, audio or video duration");
                check(meta.getBoolean("lutApplied")==filtered && (filtered?meta.getString("lut").equals("Shutter LUT"):meta.isNull("lut")),"still LUT metadata uses shutter snapshot");
                check(meta.getString("transport").equals(camera.kind()) && meta.getBoolean("experimentalWifi")==wifi,"still preserves transport provenance");
                check(!new File(dir,"motion.mp4").exists() && !new File(dir,"MOMENT_MP.jpg").exists(),"ordinary still never creates video or motion container");
                check(new MomentStore(context).list().contains(dir),"ordinary still is indexed in App album storage");
                ContentResolver resolver=new ContentResolver();context.resolver=resolver;MomentStore.export(context,dir);
                byte[] expected=Files.readAllBytes(new File(dir,filtered?"rendered.jpg":"original.jpg").toPath());
                check(Arrays.equals(resolver.output.toByteArray(),expected),"static system export selects rendered LUT derivative or untouched original");
            }
            StillCamera camera=new StillCamera(false);field(CaptureEngine.class,"camera").set(engine,camera);field(CaptureEngine.class,"preparedHandles").set(engine,camera.baseline);
            engine.setLut(filter);Bitmap.failPixels=true;failed.set(null);engine.captureStill();settle(engine);Bitmap.failPixels=false;
            File dir=failed.get();check(dir!=null && !MomentStore.metadata(dir).getBoolean("complete"),"LUT failure remains visibly incomplete");
            check(MomentStore.metadata(dir).getString("lutRequested").equals("Shutter LUT") && !MomentStore.metadata(dir).getBoolean("lutApplied"),"LUT failure retains requested LUT without claiming it applied");
            check(Arrays.equals(Files.readAllBytes(new File(dir,"original.jpg").toPath()),camera.jpeg) && !new File(dir,"rendered.jpg").exists() && !new File(dir,"rendered.jpg.part").exists(),"LUT failure preserves original and removes partial derivative");
            context.resolver=new ContentResolver();MomentStore.export(context,dir);check(Arrays.equals(context.resolver.output.toByteArray(),camera.jpeg),"failed LUT still can explicitly export preserved original");
            camera=new StillCamera(true);camera.failDownload=true;field(CaptureEngine.class,"camera").set(engine,camera);failed.set(null);engine.setLut(null);engine.captureStill();settle(engine);dir=failed.get();
            check(dir!=null && !new File(dir,"original.jpg").exists() && !new File(dir,"original.jpg.part").exists(),"incomplete download never becomes a usable original");
            File unavailable=dir;expectIo(()->MomentStore.export(context,unavailable),"incomplete JPEG exported");
            camera=new StillCamera(false);field(CaptureEngine.class,"camera").set(engine,camera);CountDownLatch resume=block(engine);engine.captureStill();engine.disconnect();resume.countDown();settle(engine);
            check(camera.shutters==0 && !engine.busy(),"disconnect before queued static capture sends no shutter");
            field(CaptureEngine.class,"active").set(engine,true);field(CaptureEngine.class,"demo").set(engine,true);saved.set(null);engine.captureStill();settle(engine);
            check(saved.get()!=null && MomentStore.metadata(saved.get()).getBoolean("demo"),"demo ordinary still works without prebuffer and carries provenance");
        }finally{Bitmap.failPixels=false;engine.shutdown();worker(engine).awaitTermination(3,TimeUnit.SECONDS);}
    }
    private static void codecChecks(Path root)throws Exception {
        MediaCodec.failRelease=true;MediaCodec.released=0;MediaMuxer.released=0;
        try{AudioMux.add(new short[4800],root.resolve("silent.mp4").toFile(),root.resolve("sound.mp4").toFile());throw new AssertionError("codec error accepted");}
        catch(IllegalStateException expected){check(expected.getMessage().equals("dequeue failed"),"cleanup cannot replace the original codec failure");}
        check(MediaCodec.released==1 && MediaMuxer.released==1,"codec and muxer release independently even when stop and release throw");
        check(!Files.exists(root.resolve("audio.tmp.mp4")),"failed AAC encode leaves no temporary MP4");MediaCodec.failRelease=false;
    }
    public static void main(String[] args)throws Exception {
        Path root=Files.createTempDirectory("native-bugfix-");
        try {lutChecks(root);audioChecks();usbChecks();batteryChecks();engineChecks(root);storeChecks(root);stillChecks(root);codecChecks(root);}
        finally {try(var paths=Files.walk(root)){for(Path path:paths.sorted(Comparator.reverseOrder()).toList())Files.delete(path);}}
        System.out.println("PASS "+checks+" native bugfix checks (Android doubles, no camera)");
    }
}
