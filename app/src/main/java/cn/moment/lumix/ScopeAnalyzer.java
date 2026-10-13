package cn.moment.lumix;

/** Bounded, Android-free math for full-range, gamma-encoded live-view RGB pixels. */
public final class ScopeAnalyzer {
    public static final int HISTOGRAM_BINS=256;
    public static final int WAVE_WIDTH=64,LEVELS=64,PARADE_WIDTH=32,VECTOR_SIZE=64;
    public static final int MAX_SIDE=256;

    public static final class Result {
        /** Channel-major R, G, B, Y; linear counts with one shared peak. */
        public final byte[] histogram;
        /** Row-major grids, brightest levels first; logarithmic density. */
        public final byte[] waveform,parade,vectorscope;
        public final int width,height,pixels,clipLow,clipHigh;
        private Result(int width,int height,int clipLow,int clipHigh,int[] hist,int[] wave,int[] rgb,int[] vector) {
            this.width=width;this.height=height;pixels=width*height;
            this.clipLow=clipLow;this.clipHigh=clipHigh;
            histogram=normalize(hist,false);waveform=normalize(wave,true);
            parade=normalize(rgb,true);vectorscope=normalize(vector,true);
        }
    }

    private ScopeAnalyzer() {}

    public static Result analyze(int[] argb,int width,int height,boolean rotateClockwise) {
        if(width<1 || height<1 || width>MAX_SIDE || height>MAX_SIDE || argb==null || argb.length!=width*height)
            throw new IllegalArgumentException("Scopes require a frame no larger than 256 x 256");
        int[] hist=new int[4*HISTOGRAM_BINS],wave=new int[WAVE_WIDTH*LEVELS];
        int[] rgb=new int[3*PARADE_WIDTH*LEVELS],vector=new int[VECTOR_SIZE*VECTOR_SIZE];
        int low=0,high=0,displayWidth=rotateClockwise?height:width;
        for(int y=0;y<height;y++) for(int x=0;x<width;x++) {
            int color=argb[y*width+x],r=(color>>>16)&255,g=(color>>>8)&255,b=color&255;
            // Rec.709 Y' (not linear-light luminance, RAW values, or a V-Log transform).
            int luma=(2126*r+7152*g+722*b+5000)/10000;
            hist[r]++;hist[HISTOGRAM_BINS+g]++;hist[2*HISTOGRAM_BINS+b]++;hist[3*HISTOGRAM_BINS+luma]++;
            if(r==0 || g==0 || b==0)low++;
            if(r==255 || g==255 || b==255)high++;
            int displayX=rotateClockwise?height-1-y:x;
            int column=displayX*WAVE_WIDTH/displayWidth,paradeColumn=displayX*PARADE_WIDTH/displayWidth;
            wave[row(luma)*WAVE_WIDTH+column]++;
            rgb[row(r)*PARADE_WIDTH+paradeColumn]++;
            rgb[PARADE_WIDTH*LEVELS+row(g)*PARADE_WIDTH+paradeColumn]++;
            rgb[2*PARADE_WIDTH*LEVELS+row(b)*PARADE_WIDTH+paradeColumn]++;
            double yPrime=(2126*r+7152*g+722*b)/10000.0;
            double cb=(b-yPrime)/1.8556,cr=(r-yPrime)/1.5748;
            int vx=bound((int)Math.round((cb/255+.5)*(VECTOR_SIZE-1)),VECTOR_SIZE);
            int vy=bound((int)Math.round((.5-cr/255)*(VECTOR_SIZE-1)),VECTOR_SIZE);
            vector[vy*VECTOR_SIZE+vx]++;
        }
        return new Result(displayWidth,rotateClockwise?width:height,low,high,hist,wave,rgb,vector);
    }

    private static int row(int value) {return LEVELS-1-value*LEVELS/256;}
    private static int bound(int value,int size) {return Math.max(0,Math.min(size-1,value));}
    private static byte[] normalize(int[] counts,boolean logarithmic) {
        int peak=0;for(int count:counts)peak=Math.max(peak,count);
        byte[] out=new byte[counts.length];if(peak==0)return out;
        double denominator=logarithmic?Math.log1p(peak):peak;
        for(int i=0;i<counts.length;i++) if(counts[i]>0)
            out[i]=(byte)Math.max(1,Math.round(255*(logarithmic?Math.log1p(counts[i]):counts[i])/denominator));
        return out;
    }
}
