package cn.moment.s5;

import android.media.*;
import java.io.*;
import java.nio.*;

/** PCM -> AAC, then remux with the AVC track. All work runs outside the UI thread. */
public final class AudioMux {
    private AudioMux() {}
    public static void add(short[] samples,File silent,File output) throws IOException {
        File audio=new File(output.getParentFile(),"audio.tmp.mp4");
        try{encode(samples,audio);mux(silent,audio,output);}finally{java.nio.file.Files.deleteIfExists(audio.toPath());}
    }
    private static void encode(short[] samples,File target) throws IOException {
        MediaFormat format=MediaFormat.createAudioFormat("audio/mp4a-latm",AudioRing.RATE,1);
        format.setInteger(MediaFormat.KEY_AAC_PROFILE,MediaCodecInfo.CodecProfileLevel.AACObjectLC);format.setInteger(MediaFormat.KEY_BIT_RATE,96000);
        MediaCodec codec=MediaCodec.createEncoderByType("audio/mp4a-latm");MediaMuxer muxer=null;boolean started=false;
        try{
            codec.configure(format,null,null,MediaCodec.CONFIGURE_FLAG_ENCODE);codec.start();
            muxer=new MediaMuxer(target.getPath(),MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            int pos=0,track=-1;boolean eof=false,done=false;MediaCodec.BufferInfo info=new MediaCodec.BufferInfo();long deadline=CaptureEngine.now()+20_000_000;
            while(!done){
                if(CaptureEngine.now()>deadline)throw new IOException("AAC 编码超时");
                if(!eof){int i=codec.dequeueInputBuffer(10_000);if(i>=0){
                    ByteBuffer input=codec.getInputBuffer(i);if(input==null)throw new IOException("AAC 输入缺失");input.clear();input.order(ByteOrder.LITTLE_ENDIAN);
                    int n=Math.min(samples.length-pos,input.remaining()/2);long pts=pos*1_000_000L/AudioRing.RATE;
                    for(int j=0;j<n;j++)input.putShort(samples[pos+j]);
                    codec.queueInputBuffer(i,0,n*2,pts,n==0?MediaCodec.BUFFER_FLAG_END_OF_STREAM:0);pos+=n;if(n==0)eof=true;
                }}
                int i=codec.dequeueOutputBuffer(info,10_000);
                if(i==MediaCodec.INFO_OUTPUT_FORMAT_CHANGED){track=muxer.addTrack(codec.getOutputFormat());muxer.start();started=true;}
                else if(i>=0){ByteBuffer out=codec.getOutputBuffer(i);
                    if(info.size>0 && (info.flags&MediaCodec.BUFFER_FLAG_CODEC_CONFIG)==0){
                        if(out==null || !started)throw new IOException("AAC 输出缺失");out.position(info.offset);out.limit(info.offset+info.size);muxer.writeSampleData(track,out,info);}
                    done=(info.flags&MediaCodec.BUFFER_FLAG_END_OF_STREAM)!=0;codec.releaseOutputBuffer(i,false);
                }
            }
        }finally{try{codec.stop();}finally{codec.release();}if(muxer!=null){try{if(started)muxer.stop();}finally{muxer.release();}}}
    }
    private static void mux(File video,File audio,File output) throws IOException {
        MediaExtractor v=new MediaExtractor(),a=new MediaExtractor();MediaMuxer mux=null;boolean started=false;
        try{
            v.setDataSource(video.getPath());a.setDataSource(audio.getPath());v.selectTrack(0);a.selectTrack(0);
            mux=new MediaMuxer(output.getPath(),MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            int vi=mux.addTrack(v.getTrackFormat(0)),ai=mux.addTrack(a.getTrackFormat(0));mux.start();started=true;
            ByteBuffer data=ByteBuffer.allocate(4*1024*1024);MediaCodec.BufferInfo info=new MediaCodec.BufferInfo();
            while(v.getSampleTime()>=0 || a.getSampleTime()>=0){
                boolean useV=v.getSampleTime()>=0 && (a.getSampleTime()<0 || v.getSampleTime()<=a.getSampleTime());MediaExtractor source=useV?v:a;
                data.clear();int size=source.readSampleData(data,0);if(size<0)break;
                int flags=(source.getSampleFlags()&MediaExtractor.SAMPLE_FLAG_SYNC)!=0?MediaCodec.BUFFER_FLAG_KEY_FRAME:0;
                info.set(0,size,source.getSampleTime(),flags);data.position(0);data.limit(size);mux.writeSampleData(useV?vi:ai,data,info);source.advance();
            }
        }finally{v.release();a.release();if(mux!=null){try{if(started)mux.stop();}finally{mux.release();}}}
    }
}
