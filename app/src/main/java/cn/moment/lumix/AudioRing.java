package cn.moment.lumix;

import android.annotation.SuppressLint;
import android.media.*;
import java.io.IOException;
import java.util.ArrayDeque;
import java.util.BitSet;

/** Optional foreground microphone ring, using the USB preview's monotonic clock. */
public final class AudioRing implements AutoCloseable {
    public static final int RATE=48000;
    private record Block(long us,short[] samples) {}
    private final ArrayDeque<Block> ring=new ArrayDeque<>();
    private AudioRecord recorder;
    private volatile boolean running;
    private volatile String failure;
    private Thread thread;
    @SuppressLint("MissingPermission") // Activity obtains RECORD_AUDIO before enabling this path.
    public synchronized void start() throws IOException {
        if(recorder!=null || (thread!=null && thread.isAlive()))throw new IOException("麦克风已开启或尚未停止");
        failure=null;
        int minimum=AudioRecord.getMinBufferSize(RATE,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT);
        if(minimum<=0)throw new IOException("麦克风采样率不受支持");
        recorder=new AudioRecord(MediaRecorder.AudioSource.MIC,RATE,AudioFormat.CHANNEL_IN_MONO,AudioFormat.ENCODING_PCM_16BIT,Math.max(minimum,19200));
        if(recorder.getState()!=AudioRecord.STATE_INITIALIZED){recorder.release();recorder=null;throw new IOException("麦克风无法初始化");}
        AudioRecord input=recorder;
        try {
            input.startRecording();
            if(input.getRecordingState()!=AudioRecord.RECORDSTATE_RECORDING)throw new IllegalStateException("麦克风无法开始录音");
        }catch(RuntimeException e){input.release();recorder=null;throw new IOException("麦克风启动失败："+e.getMessage(),e);}
        running=true;
        thread=new Thread(()-> {
            short[] buffer=new short[960];long read=0;AudioTimestamp stamp=new AudioTimestamp();
            try {while(running){
                int n=input.read(buffer,0,buffer.length,AudioRecord.READ_BLOCKING);
                if(n<=0){if(running)failure="麦克风读取失败 "+n;break;}
                long begin=CaptureEngine.now()-n*1_000_000L/RATE;
                if(input.getTimestamp(stamp,AudioTimestamp.TIMEBASE_BOOTTIME)==AudioRecord.SUCCESS)
                    begin=stamp.nanoTime/1000+(read-stamp.framePosition)*1_000_000L/RATE;
                read+=n;
                synchronized(ring){ring.addLast(new Block(begin,java.util.Arrays.copyOf(buffer,n)));
                    while(ring.size()>300 || (!ring.isEmpty() && begin-ring.getFirst().us>5_000_000))ring.removeFirst();}
            }}catch(RuntimeException e){if(running)failure=e.getMessage()==null?"麦克风读取失败":e.getMessage();}finally{running=false;}
        },"moment-microphone");thread.start();
    }
    public short[] slice(long from,long to) throws IOException {
        if(failure!=null)throw new IOException(failure);
        long duration=to-from;if(duration<=0 || duration>5_000_000)throw new IOException("收音窗口长度异常");
        int n=(int)(duration*RATE/1_000_000);if(n<=0)throw new IOException("收音窗口长度异常");
        short[] out=new short[n];BitSet covered=new BitSet(n);
        synchronized(ring){for(Block b:ring){
            int target=(int)((b.us-from)*RATE/1_000_000),source=Math.max(0,-target),dest=Math.max(0,target),count=Math.min(b.samples.length-source,n-dest);
            if(count>0){System.arraycopy(b.samples,source,out,dest,count);covered.set(dest,dest+count);}
        }}
        if(covered.cardinality()<n*.85)throw new IOException("环境声缓存不足，本次保存无声实况");return out;
    }
    @Override public synchronized void close(){
        running=false;if(recorder!=null){try{recorder.stop();}catch(IllegalStateException ignored){}
            if(thread!=null)try{thread.join(1000);}catch(InterruptedException e){Thread.currentThread().interrupt();}
            recorder.release();recorder=null;}
        synchronized(ring){ring.clear();}
    }
}
