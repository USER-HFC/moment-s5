package android.media;
import android.view.Surface;
import java.nio.ByteBuffer;
public final class MediaCodec {
    public static boolean failRelease;
    public static int released;
    public static final class BufferInfo {public int flags,size,offset;public long presentationTimeUs;}
    public static MediaCodec createEncoderByType(String type){return new MediaCodec();}
    public void configure(MediaFormat format,Surface surface,MediaCrypto crypto,int flags){}
    public void start(){}
    public int dequeueInputBuffer(long timeout){return 0;}
    public ByteBuffer getInputBuffer(int index){return ByteBuffer.allocate(32);}
    public void queueInputBuffer(int index,int offset,int size,long pts,int flags){}
    public int dequeueOutputBuffer(BufferInfo info,long timeout){throw new IllegalStateException("dequeue failed");}
    public void stop(){throw new IllegalStateException("stop failed");}
    public void release(){released++;if(failRelease)throw new IllegalStateException("release failed");}
}
