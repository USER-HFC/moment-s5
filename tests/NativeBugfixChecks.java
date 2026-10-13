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
            field(CaptureEngine.class,"preparedHandles").set(engine,Set.of(41));CountDownLatch resume=block(engine),go=new CountDownLatch(1);
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
        ContentResolver resolver=new ContentResolver();context.resolver=resolver;MomentStore.export(context,dir);
        check(Arrays.equals(resolver.output.toByteArray(),bytes),"successful MediaStore export preserves bytes");
        resolver=new ContentResolver();resolver.updated=0;resolver.failDelete=true;context.resolver=resolver;
        try{MomentStore.export(context,dir);throw new AssertionError("unpublished MediaStore row accepted");}
        catch(IOException expected){check(expected.getMessage().contains("发布失败") && expected.getSuppressed().length==1,"publish failure remains primary when cleanup also fails");}
        check(resolver.deleted==1,"failed MediaStore publication deletes pending row");
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
        try {lutChecks(root);audioChecks();usbChecks();engineChecks(root);storeChecks(root);codecChecks(root);}
        finally {try(var paths=Files.walk(root)){for(Path path:paths.sorted(Comparator.reverseOrder()).toList())Files.delete(path);}}
        System.out.println("PASS "+checks+" native bugfix checks (Android doubles, no camera)");
    }
}
