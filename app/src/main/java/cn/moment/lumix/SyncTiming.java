package cn.moment.lumix;

import java.util.Locale;

/**
 * Where one photo's sync time went, for the diagnostics log. All values are the monotonic
 * microsecond clock of CaptureEngine.now(); -1 means the stage did not run.
 */
final class SyncTiming {
    final long tapUs,shutterSentUs,shutterDoneUs;
    long found=-1,downloaded=-1,bytes=-1,lut=-1;
    SyncTiming(long tapUs,long shutterSentUs,long shutterDoneUs) {this.tapUs=tapUs;this.shutterSentUs=shutterSentUs;this.shutterDoneUs=shutterDoneUs;}

    /** e.g.「同步耗时 · 拍照 · 快门 420 ms · 等新照片 310 ms · 传输 1830 ms（12.4 MB，6.8 MB/s） · LUT 640 ms · 合计 3.4 s」 */
    String line(String kind,long endUs) {
        StringBuilder out=new StringBuilder("同步耗时 · ").append(kind);
        if(shutterDoneUs>shutterSentUs) out.append(" · 快门 ").append(ms(shutterDoneUs-shutterSentUs));
        if(found>=0 && found>shutterDoneUs) out.append(" · 等新照片 ").append(ms(found-shutterDoneUs));
        if(downloaded>=0 && found>=0) {
            long us=Math.max(1,downloaded-found);
            out.append(" · 传输 ").append(ms(us));
            if(bytes>0) out.append(String.format(Locale.ROOT,"（%.1f MB，%.1f MB/s）",bytes/1_048_576.0,bytes/1_048_576.0/(us/1_000_000.0)));
        }
        if(lut>=0) out.append(" · LUT ").append(ms(lut));
        out.append(" · 合计 ").append(seconds(endUs-tapUs));
        return out.toString();
    }
    private static String ms(long us) {return (us/1000)+" ms";}
    private static String seconds(long us) {return us<10_000_000?String.format(Locale.ROOT,"%.1f s",us/1_000_000.0):(us/1_000_000)+" s";}
}
