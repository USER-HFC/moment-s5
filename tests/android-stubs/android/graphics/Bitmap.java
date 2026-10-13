package android.graphics;

import java.io.IOException;
import java.io.OutputStream;

/** JVM double: pixel writes require a mutable bitmap, as on Android. */
public final class Bitmap {
    public enum Config { ARGB_8888 }
    public enum CompressFormat { JPEG }
    private final int width,height;
    private final boolean mutable;
    private boolean recycled;
    public static boolean failPixels;
    Bitmap(int width,int height,boolean mutable) {this.width=width;this.height=height;this.mutable=mutable;}
    public static Bitmap createBitmap(int w,int h,Config config) {return new Bitmap(w,h,true);}
    public int getWidth(){return width;}
    public int getHeight(){return height;}
    public Config getConfig(){return Config.ARGB_8888;}
    public boolean isMutable(){return mutable;}
    public boolean isRecycled(){return recycled;}
    public Bitmap copy(Config config,boolean mutable){return new Bitmap(width,height,mutable);}
    public void recycle(){recycled=true;}
    public void getPixels(int[] pixels,int offset,int stride,int x,int y,int w,int h){
        if(failPixels)throw new IllegalStateException("pixel read failed");
        java.util.Arrays.fill(pixels,0xff204060);
    }
    public void setPixels(int[] pixels,int offset,int stride,int x,int y,int w,int h){
        if(!mutable)throw new IllegalStateException("immutable bitmap");
    }
    public boolean compress(CompressFormat format,int quality,OutputStream out){
        try{out.write(new byte[]{(byte)255,(byte)216,(byte)255,(byte)217});return true;}catch(IOException e){throw new IllegalStateException(e);}
    }
}
