package android.graphics;

/** Supplies dimensions without allocating pixels when bounds-only decoding is requested. */
public final class BitmapFactory {
    public static int width=2,height=2,decoded;
    public static Bitmap last;
    public static Runnable beforePixels;
    public static final class Options {
        public boolean inJustDecodeBounds,inMutable;
        public int outWidth,outHeight;
        public Bitmap.Config inPreferredConfig;
    }
    public static Bitmap decodeByteArray(byte[] b,int offset,int length){return decodeByteArray(b,offset,length,null);}
    public static Bitmap decodeByteArray(byte[] b,int offset,int length,Options options){
        if(options!=null){options.outWidth=width;options.outHeight=height;if(options.inJustDecodeBounds)return null;}
        if(beforePixels!=null)beforePixels.run();
        decoded++;last=new Bitmap(width,height,options!=null && options.inMutable);return last;
    }
}
