package cn.moment.lumix;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Process;
import android.os.SystemClock;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.RejectedExecutionException;

/** A single in-flight sample: never queue scopes behind USB capture or retain a frame backlog. */
public final class ScopeStream implements AutoCloseable {
    public interface Listener {void frame(ScopeAnalyzer.Result result,long timestampUs,boolean demo,int rotation,double sourceAspectRatio);}
    private final Listener listener;
    private final ScopeCadence cadence=new ScopeCadence();
    private final ExecutorService worker=Executors.newSingleThreadExecutor(task->new Thread(()->{
        Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND);task.run();
    },"MomentScopes"));
    private boolean enabled,closed,inFlight,rotateClockwise;
    private long generation;
    private double sourceAspectRatio=1.5;

    public ScopeStream(Listener listener) {this.listener=listener;}

    public synchronized void configure(boolean enabled,boolean rotateClockwise,double sourceAspectRatio) {
        if(closed)return;
        double ratio=Double.isFinite(sourceAspectRatio) && sourceAspectRatio>=.25 && sourceAspectRatio<=4?sourceAspectRatio:1.5;
        if(this.enabled!=enabled || this.rotateClockwise!=rotateClockwise || this.sourceAspectRatio!=ratio) {generation++;cadence.reset();}
        this.enabled=enabled;this.rotateClockwise=rotateClockwise;
        this.sourceAspectRatio=ratio;
    }

    /** The immutable JPEG is the same post-LUT frame delivered to the preview and frame ring. */
    public synchronized void offer(byte[] jpeg,boolean demo) {
        if(!enabled || closed || inFlight || jpeg==null)return;
        long now=SystemClock.elapsedRealtimeNanos()/1000;
        if(!cadence.accept(now))return;
        inFlight=true;
        final long epoch=generation;final boolean rotate=rotateClockwise;final double ratio=sourceAspectRatio;
        try {worker.execute(()->analyze(jpeg,now,demo,epoch,rotate,ratio));}
        catch(RejectedExecutionException ignored) {inFlight=false;}
    }

    private void analyze(byte[] jpeg,long timestampUs,boolean demo,long epoch,boolean rotate,double ratio) {
        Bitmap bitmap=null;
        try {
            synchronized(this) {if(closed || !enabled || generation!=epoch)return;}
            BitmapFactory.Options options=new BitmapFactory.Options();options.inJustDecodeBounds=true;
            BitmapFactory.decodeByteArray(jpeg,0,jpeg.length,options);
            if(options.outWidth<1 || options.outHeight<1 || options.outWidth>16384 || options.outHeight>16384)return;
            int sample=1;
            while((options.outWidth+sample-1)/sample>ScopeAnalyzer.MAX_SIDE || (options.outHeight+sample-1)/sample>ScopeAnalyzer.MAX_SIDE)sample*=2;
            options.inJustDecodeBounds=false;options.inSampleSize=sample;options.inScaled=false;
            options.inPreferredConfig=Bitmap.Config.ARGB_8888;
            bitmap=BitmapFactory.decodeByteArray(jpeg,0,jpeg.length,options);
            if(bitmap==null || bitmap.getWidth()>ScopeAnalyzer.MAX_SIDE || bitmap.getHeight()>ScopeAnalyzer.MAX_SIDE)return;
            // Image.resizeMode="cover" uses a centered crop before the portrait rotation.
            int sourceWidth=bitmap.getWidth(),sourceHeight=bitmap.getHeight(),width=sourceWidth,height=sourceHeight;
            if(sourceWidth/(double)sourceHeight>ratio)width=Math.max(1,Math.min(sourceWidth,(int)Math.round(sourceHeight*ratio)));
            else height=Math.max(1,Math.min(sourceHeight,(int)Math.round(sourceWidth/ratio)));
            int[] pixels=new int[width*height];
            bitmap.getPixels(pixels,0,width,(sourceWidth-width)/2,(sourceHeight-height)/2,width,height);
            ScopeAnalyzer.Result result=ScopeAnalyzer.analyze(pixels,width,height,rotate);
            synchronized(this) {if(closed || !enabled || generation!=epoch)return;}
            listener.frame(result,timestampUs,demo,rotate?90:0,ratio);
        } catch(RuntimeException ignored) {
            // A diagnostic must never abort capture or replace the preview on a bad frame.
        } finally {
            if(bitmap!=null)bitmap.recycle();
            synchronized(this) {inFlight=false;}
        }
    }

    @Override public synchronized void close() {closed=true;enabled=false;generation++;worker.shutdown();}
}
