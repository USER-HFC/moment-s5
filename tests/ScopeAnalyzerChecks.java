package cn.moment.lumix;

import java.util.Arrays;

/** Pure JVM checks; run with tools/check-scopes.sh (JDK 17, no camera or Android SDK). */
public final class ScopeAnalyzerChecks {
    private static int checks;
    private static void check(boolean value,String message) {checks++;if(!value)throw new AssertionError(message);}
    private static int unsigned(byte value) {return value&255;}
    private static int occupied(byte[] values) {int n=0;for(byte value:values)if(value!=0)n++;return n;}
    private static int row(int value) {return ScopeAnalyzer.LEVELS-1-value*ScopeAnalyzer.LEVELS/256;}

    public static void main(String[] args) {
        int wave=ScopeAnalyzer.WAVE_WIDTH,levels=ScopeAnalyzer.LEVELS,parade=ScopeAnalyzer.PARADE_WIDTH,vector=ScopeAnalyzer.VECTOR_SIZE;
        int paradeStride=parade*levels;
        ScopeAnalyzer.Result black=ScopeAnalyzer.analyze(new int[]{0xff000000},1,1,false);
        check(black.histogram.length==4*ScopeAnalyzer.HISTOGRAM_BINS && black.waveform.length==wave*levels && black.parade.length==3*paradeStride && black.vectorscope.length==vector*vector,"protocol sizes");
        for(int c=0;c<4;c++)check(unsigned(black.histogram[c*256])==255,"black channel "+c);
        check(occupied(black.histogram)==4,"no other histogram bins");
        check(unsigned(black.waveform[(levels-1)*wave])==255,"black at bottom of waveform");
        check(unsigned(black.vectorscope[(vector/2)*vector+vector/2])==255,"neutral at vector center");
        check(black.clipLow==1 && black.clipHigh==0,"black clipping counts");

        ScopeAnalyzer.Result white=ScopeAnalyzer.analyze(new int[]{0xffffffff},1,1,false);
        for(int c=0;c<4;c++)check(unsigned(white.histogram[c*256+255])==255,"white channel "+c);
        check(unsigned(white.waveform[0])==255,"white at top of waveform");
        check(white.clipLow==0 && white.clipHigh==1,"white clipping counts");

        ScopeAnalyzer.Result primary=ScopeAnalyzer.analyze(new int[]{0xffff0000,0xff00ff00,0xff0000ff},3,1,false);
        check(unsigned(primary.histogram[3*256+54])==128 && unsigned(primary.histogram[3*256+182])==128 && unsigned(primary.histogram[3*256+18])==128,"Rec.709 red, green, blue Y bins");
        check(unsigned(primary.histogram[0])==255 && unsigned(primary.histogram[255])==128,"histogram uses a shared linear count scale");
        check(primary.waveform[row(54)*wave]!=0 && primary.waveform[row(182)*wave+wave/3]!=0 && primary.waveform[row(18)*wave+2*wave/3]!=0,"waveform keeps horizontal positions");
        check(primary.parade[0]!=0 && primary.parade[paradeStride+parade/3]!=0 && primary.parade[2*paradeStride+2*parade/3]!=0,"channel-major RGB parade");
        check(primary.vectorscope[24]!=0 && primary.vectorscope[34*vector+(vector-1)]!=0,"Rec.709 red and blue chroma axes");
        check(primary.clipLow==3 && primary.clipHigh==3,"clip pixels counted once, not per channel");

        int[] ramp=new int[wave];
        for(int x=0;x<wave;x++){int value=x*256/wave;ramp[x]=0xff000000|(value<<16)|(value<<8)|value;}
        ScopeAnalyzer.Result gradient=ScopeAnalyzer.analyze(ramp,wave,1,false);
        check(occupied(gradient.waveform)==wave,"gradient has one occupied bin per column");
        for(int x=0;x<wave;x++){
            int value=x*256/wave,level=levels-1-value*levels/256;
            check(unsigned(gradient.waveform[level*wave+x])==255,"waveform gradient column "+x);
        }
        check(occupied(gradient.vectorscope)==1,"all gray samples are neutral");

        ScopeAnalyzer.Result rotated=ScopeAnalyzer.analyze(new int[]{0xff000000,0xff000000,0xff000000,0xffffffff,0xffffffff,0xffffffff},3,2,true);
        check(rotated.width==2 && rotated.height==3,"portrait dimensions follow preview rotation");
        check(rotated.waveform[0]!=0 && rotated.waveform[(levels-1)*wave+wave/2]!=0 && occupied(rotated.waveform)==2,"portrait waveform has white left, black right after clockwise rotation");

        int[] repeated=new int[256*256];Arrays.fill(repeated,0xff808080);
        ScopeAnalyzer.Result full=ScopeAnalyzer.analyze(repeated,256,256,false);
        check(full.pixels==65536 && unsigned(full.histogram[128])==255,"large uniform frame does not overflow counts");
        check(occupied(full.waveform)==wave && occupied(full.parade)==3*parade,"all waveform and parade columns covered");
        for(int[] invalid:new int[][]{new int[0],new int[257],null}) {
            try {ScopeAnalyzer.analyze(invalid,257,1,false);throw new AssertionError("unbounded frame accepted");}
            catch(IllegalArgumentException expected){checks++;}
        }
        ScopeCadence cadence=new ScopeCadence();int samples=0;
        for(long us=0;us<1_000_000;us+=75_000)if(cadence.accept(us))samples++;
        check(samples==10,"75 ms previews maintain 10 Hz instead of dropping to 6.7 Hz");
        check(cadence.accept(5_000_000) && !cadence.accept(5_000_001),"long stalls resume once without a catch-up burst");
        cadence.reset();check(cadence.accept(5_000_001),"new subscription samples immediately");
        int[] sample=new int[240*160];for(int i=0;i<sample.length;i++)sample[i]=0xff000000|((i*7919)&0xffffff);
        for(int i=0;i<10;i++)ScopeAnalyzer.analyze(sample,240,160,false);
        long start=System.nanoTime();for(int i=0;i<100;i++)ScopeAnalyzer.analyze(sample,240,160,false);
        System.out.printf("PASS %d scope checks; 240 x 160 math mean %.2f ms (desktop JVM, excludes JPEG decoding/bridge)\n",checks,(System.nanoTime()-start)/100_000_000.0);
    }
}
