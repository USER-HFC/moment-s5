package android.media;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
public final class MediaMuxer {
    public static int released;
    public MediaMuxer(String path,int format)throws IOException{Files.write(Path.of(path),new byte[16]);}
    public int addTrack(MediaFormat format){return 0;}
    public void start(){}
    public void stop(){throw new IllegalStateException("mux stop failed");}
    public void release(){released++;}
}
