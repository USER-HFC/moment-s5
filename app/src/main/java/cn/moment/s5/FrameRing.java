package cn.moment.s5;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.List;

/** JPEG ring, bounded by both time and bytes. Uses monotonic microseconds. */
public final class FrameRing {
    public static final class Frame {
        public final long us;
        public final byte[] jpeg;
        public Frame(long us, byte[] jpeg) { this.us=us; this.jpeg=jpeg; }
    }
    private final ArrayDeque<Frame> frames=new ArrayDeque<>();
    private final long windowUs, maxBytes;
    private long bytes;
    public FrameRing(long windowUs,long maxBytes) { this.windowUs=windowUs; this.maxBytes=maxBytes; }
    public synchronized void add(long us,byte[] jpeg) {
        if(jpeg.length>maxBytes || (!frames.isEmpty() && us<=frames.getLast().us)) return;
        frames.addLast(new Frame(us,jpeg)); bytes+=jpeg.length;
        while(!frames.isEmpty() && (bytes>maxBytes || us-frames.getFirst().us>windowUs)) bytes-=frames.removeFirst().jpeg.length;
    }
    public synchronized List<Frame> slice(long from,long through) {
        ArrayList<Frame> out=new ArrayList<>(); for(Frame f:frames) if(f.us>=from && f.us<=through) out.add(f); return out;
    }
    public synchronized long durationUs() { return frames.size()<2 ? 0 : frames.getLast().us-frames.getFirst().us; }
    public synchronized long lastUs() { return frames.isEmpty()?0:frames.getLast().us; }
    public synchronized void clear() { frames.clear(); bytes=0; }
    public static long maxGap(List<Frame> fs) { long max=0; for(int i=1;i<fs.size();i++) max=Math.max(max,fs.get(i).us-fs.get(i-1).us); return max; }
}
