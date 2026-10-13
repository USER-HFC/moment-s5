package cn.moment.lumix;

/** Maintain a 10 Hz average against a variable-rate preview without building a catch-up queue. */
final class ScopeCadence {
    private static final long INTERVAL_US=100_000;
    private long dueUs;
    void reset() {dueUs=0;}
    boolean accept(long nowUs) {
        if(nowUs<dueUs)return false;
        dueUs=dueUs==0 || nowUs-dueUs>=INTERVAL_US?nowUs+INTERVAL_US:dueUs+INTERVAL_US;
        return true;
    }
}
