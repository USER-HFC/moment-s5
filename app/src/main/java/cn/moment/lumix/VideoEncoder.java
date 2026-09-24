package cn.moment.lumix;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.*;
import java.io.File;
import java.io.IOException;
import java.nio.ByteBuffer;
import java.util.List;

/** Offline hardware AVC encoding. Capture/USB never waits on video compression. */
public final class VideoEncoder {
    public static final int FPS=15;
    private VideoEncoder() {}
    public static void encode(List<FrameRing.Frame> frames,long fromUs,long toUs,File output) throws IOException {
        if(frames.size()<2 || toUs<=fromUs) throw new IOException("动态帧不足");
        BitmapFactory.Options size=new BitmapFactory.Options();size.inJustDecodeBounds=true;
        BitmapFactory.decodeByteArray(frames.get(0).jpeg,0,frames.get(0).jpeg.length,size);
        if(size.outWidth<=0 || size.outHeight<=0) throw new IOException("预览 JPEG 无法解码");
        float scale=Math.min(1f,960f/Math.max(size.outWidth,size.outHeight));
        int width=Math.max(2,((int)(size.outWidth*scale))&~1),height=Math.max(2,((int)(size.outHeight*scale))&~1);
        MediaFormat format=MediaFormat.createVideoFormat("video/avc",width,height);
        format.setInteger(MediaFormat.KEY_COLOR_FORMAT,MediaCodecInfo.CodecCapabilities.COLOR_FormatYUV420Flexible);
        format.setInteger(MediaFormat.KEY_BIT_RATE,3_000_000);
        format.setInteger(MediaFormat.KEY_FRAME_RATE,FPS);
        format.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL,1);
        String name=new MediaCodecList(MediaCodecList.REGULAR_CODECS).findEncoderForFormat(format);
        if(name==null) throw new IOException("手机没有可用的 H.264 编码器");
        MediaCodec codec=null;MediaMuxer muxer=null;boolean started=false,complete=false;
        Bitmap scaled=null;int[] pixels=new int[width*height];
        try {
            codec=MediaCodec.createByCodecName(name);codec.configure(format,null,null,MediaCodec.CONFIGURE_FLAG_ENCODE);codec.start();
            muxer=new MediaMuxer(output.getAbsolutePath(),MediaMuxer.OutputFormat.MUXER_OUTPUT_MPEG_4);
            int total=(int)Math.ceil((toUs-fromUs)*FPS/1_000_000.0),sent=0,source=-1,track=-1;
            boolean eos=false,done=false;MediaCodec.BufferInfo info=new MediaCodec.BufferInfo();
            long deadline=android.os.SystemClock.elapsedRealtime()+60_000;
            while(!done) {
                if(Thread.currentThread().isInterrupted() || android.os.SystemClock.elapsedRealtime()>deadline) throw new IOException("视频编码超时");
                if(!eos) {
                    int index=codec.dequeueInputBuffer(10_000);
                    if(index>=0) {
                        long pts=sent*1_000_000L/FPS;
                        if(sent==total) {codec.queueInputBuffer(index,0,0,pts,MediaCodec.BUFFER_FLAG_END_OF_STREAM);eos=true;}
                        else {
                            int next=Math.max(source,0);while(next+1<frames.size() && frames.get(next+1).us<=fromUs+pts) next++;
                            if(source!=next) {
                                if(scaled!=null) scaled.recycle();
                                FrameRing.Frame f=frames.get(next);Bitmap original=BitmapFactory.decodeByteArray(f.jpeg,0,f.jpeg.length);
                                if(original==null) throw new IOException("动态帧解码失败");
                                scaled=Bitmap.createScaledBitmap(original,width,height,true);if(scaled!=original) original.recycle();
                                scaled.getPixels(pixels,0,width,0,0,width,height);source=next;
                            }
                            try(Image image=codec.getInputImage(index)) {
                                if(image==null) throw new IOException("编码器未提供 YUV 输入图像");
                                fillYuv(image,pixels,width,height);
                            }
                            codec.queueInputBuffer(index,0,width*height*3/2,pts,0);sent++;
                        }
                    }
                }
                int index=codec.dequeueOutputBuffer(info,10_000);
                if(index==MediaCodec.INFO_OUTPUT_FORMAT_CHANGED) {
                    if(started) throw new IOException("编码格式重复变化");track=muxer.addTrack(codec.getOutputFormat());muxer.start();started=true;
                } else if(index>=0) {
                    ByteBuffer data=codec.getOutputBuffer(index);
                    if((info.flags&MediaCodec.BUFFER_FLAG_CODEC_CONFIG)==0 && info.size>0) {
                        if(!started || data==null) throw new IOException("编码器输出顺序异常");
                        data.position(info.offset);data.limit(info.offset+info.size);muxer.writeSampleData(track,data,info);
                    }
                    done=(info.flags&MediaCodec.BUFFER_FLAG_END_OF_STREAM)!=0;codec.releaseOutputBuffer(index,false);
                }
            }
            if(!started) throw new IOException("没有输出视频帧");
            muxer.stop();started=false;complete=true;
        } catch(RuntimeException e) {throw new IOException("视频编码失败："+e.getMessage(),e);}
        finally {
            if(scaled!=null) scaled.recycle();
            if(codec!=null) {try {codec.stop();} catch(RuntimeException ignored) {} codec.release();}
            if(muxer!=null) {try {if(started) muxer.stop();} catch(RuntimeException ignored) {} muxer.release();}
            if(!complete) java.nio.file.Files.deleteIfExists(output.toPath());
        }
    }
    private static void fillYuv(Image image,int[] argb,int w,int h) {
        Image.Plane[] p=image.getPlanes();ByteBuffer y=p[0].getBuffer(),u=p[1].getBuffer(),v=p[2].getBuffer();
        for(int row=0;row<h;row++) for(int col=0;col<w;col++) {
            int rgb=argb[row*w+col],r=(rgb>>16)&255,g=(rgb>>8)&255,b=rgb&255;
            y.put(row*p[0].getRowStride()+col*p[0].getPixelStride(),(byte)clamp(((66*r+129*g+25*b+128)>>8)+16));
            if((row&1)==0 && (col&1)==0) {
                u.put(row/2*p[1].getRowStride()+col/2*p[1].getPixelStride(),(byte)clamp(((-38*r-74*g+112*b+128)>>8)+128));
                v.put(row/2*p[2].getRowStride()+col/2*p[2].getPixelStride(),(byte)clamp(((112*r-94*g-18*b+128)>>8)+128));
            }
        }
    }
    private static int clamp(int n) {return Math.max(0,Math.min(255,n));}
}
