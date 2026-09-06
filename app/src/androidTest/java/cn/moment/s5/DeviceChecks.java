package cn.moment.s5;

import android.app.Instrumentation;
import android.os.Bundle;
import android.content.Context;
import android.media.*;
import java.io.*;
import java.nio.file.Files;
import java.util.concurrent.*;
import org.json.JSONObject;

/** Actual Android encoder + capture workflow + MediaStore; no USB hardware simulation claim. */
public final class DeviceChecks extends Instrumentation {
    @Override public void onCreate(Bundle args) {super.onCreate(args);start();}
    @Override public void onStart() {
        Bundle result=new Bundle();CaptureEngine engine=null;
        try {
            Context c=getTargetContext();CountDownLatch ready=new CountDownLatch(1),saved=new CountDownLatch(1);
            File[] output={null};StringBuilder logs=new StringBuilder();
            engine=new CaptureEngine(c,new CaptureEngine.Listener() {
                @Override public void status(String s,boolean r) {logs.append(s).append('\n');}
                @Override public void frame(byte[] b,long duration,boolean demo) {if(duration>=1_500_000)ready.countDown();}
                @Override public void saved(File d) {output[0]=d;saved.countDown();}
                @Override public void log(String s) {logs.append(s).append('\n');}
                @Override public void exposure(String s) {}
            });
            engine.demo();require(ready.await(12,TimeUnit.SECONDS),"prebuffer warmup");
            engine.capture();require(saved.await(60,TimeUnit.SECONDS),"capture completes\n"+logs);
            File dir=output[0];JSONObject meta=MomentStore.metadata(dir);
            require(meta.getBoolean("demo") && meta.getBoolean("complete"),"demo clearly marked");
            require(meta.getBoolean("hasPostFrames"),"post-shutter frames");
            require(meta.getInt("frames")>10,"multiple captured frames");
            File video=new File(dir,"motion.mp4"),jpeg=new File(dir,"original.jpg"),motion=new File(dir,"MOMENT_MP.jpg");
            android.graphics.BitmapFactory.Options opts=new android.graphics.BitmapFactory.Options();opts.inJustDecodeBounds=true;
            android.graphics.BitmapFactory.decodeFile(jpeg.getPath(),opts);require(opts.outWidth==2400 && opts.outHeight==1600,"original resolution preserved");
            MediaExtractor extractor=new MediaExtractor();
            try {
                extractor.setDataSource(video.getPath());require(extractor.getTrackCount()==1,"single silent video track");
                MediaFormat format=extractor.getTrackFormat(0);require("video/avc".equals(format.getString(MediaFormat.KEY_MIME)),"AVC output");
                long duration=format.getLong(MediaFormat.KEY_DURATION);require(duration>=2_500_000 && duration<=3_200_000,"three-second clip: "+duration);
                extractor.selectTrack(0);int samples=0;long prior=-1;boolean hasKeyTime=false;
                while(extractor.getSampleTime()>=0) {long now=extractor.getSampleTime();require(now>prior,"monotonic presentation time");if(now==meta.getLong("stillUs"))hasKeyTime=true;prior=now;samples++;extractor.advance();}
                require(samples>=38,"encoded video samples "+samples);
                require(hasKeyTime,"Motion Photo still timestamp matches an encoded video frame");
            } finally {extractor.release();}
            byte[] packed=Files.readAllBytes(motion.toPath()),clip=Files.readAllBytes(video.toPath());
            require(java.util.Arrays.equals(clip,java.util.Arrays.copyOfRange(packed,packed.length-clip.length,packed.length)),"video suffix preserved");
            android.net.Uri uri=MomentStore.export(c,dir);
            try(InputStream in=c.getContentResolver().openInputStream(uri)) {require(in!=null && java.util.Arrays.equals(in.readAllBytes(),packed),"MediaStore export byte identical");}
            require(new MomentStore(c).list().contains(dir),"library persistence");
            short[] tone=new short[AudioRing.RATE*3];for(int i=0;i<tone.length;i++)tone[i]=(short)(Math.sin(i*2*Math.PI*440/AudioRing.RATE)*4000);
            File soundCheck=new File(dir,"sound-check.mp4");AudioMux.add(tone,video,soundCheck);
            MediaExtractor av=new MediaExtractor();try{
                av.setDataSource(soundCheck.getPath());require(av.getTrackCount()==2,"AVC plus AAC tracks");
                require("audio/mp4a-latm".equals(av.getTrackFormat(1).getString(MediaFormat.KEY_MIME)),"AAC audio track");
                require(av.getTrackFormat(1).getInteger(MediaFormat.KEY_SAMPLE_RATE)==48000,"audio sample rate");
            }finally{av.release();}
            MediaMetadataRetriever decoder=new MediaMetadataRetriever();try{
                decoder.setDataSource(video.getPath());android.graphics.Bitmap decoded=decoder.getFrameAtTime(500_000,MediaMetadataRetriever.OPTION_CLOSEST);
                require(decoded!=null && decoded.getWidth()>0,"encoded frame decodes");decoded.recycle();
            }finally{decoder.release();}
            if(c.checkSelfPermission(android.Manifest.permission.RECORD_AUDIO)==android.content.pm.PackageManager.PERMISSION_GRANTED){
                try(AudioRing microphone=new AudioRing()){
                    microphone.start();Thread.sleep(1800);long end=CaptureEngine.now();
                    require(microphone.slice(end-1_500_000,end).length==72000,"microphone ring captures timestamped PCM");
                }
            }
            engine.disconnect();
            result.putString("stream","PASS Android capture → JPEG + AVC → Motion Photo → MediaStore; AAC mux and video decode\n"+meta.toString(2)+"\nOutput: "+dir);
            finish(-1,result);
        } catch(Throwable e) {
            StringWriter trace=new StringWriter();e.printStackTrace(new PrintWriter(trace));result.putString("stream","FAIL\n"+trace);finish(1,result);
        } finally {if(engine!=null)engine.shutdown();}
    }
    private static void require(boolean value,String message) {if(!value)throw new AssertionError(message);}
}
