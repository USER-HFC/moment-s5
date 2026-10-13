package android.media;

public final class AudioRecord {
    public static final int STATE_INITIALIZED=1,RECORDSTATE_RECORDING=3,READ_BLOCKING=0,SUCCESS=0;
    public static boolean failStart;
    public static boolean readOnce;
    public static int lastTimebase=-1;
    public static int released;
    public AudioRecord(int source,int rate,int channel,int encoding,int buffer){}
    public static int getMinBufferSize(int rate,int channel,int encoding){return 19200;}
    public int getState(){return STATE_INITIALIZED;}
    public void startRecording(){if(failStart)throw new IllegalStateException("start failed");}
    public int getRecordingState(){return RECORDSTATE_RECORDING;}
    public int read(short[] samples,int offset,int length,int mode){if(readOnce){readOnce=false;return length;}return -1;}
    public int getTimestamp(AudioTimestamp timestamp,int base){lastTimebase=base;return -1;}
    public void stop(){}
    public void release(){released++;}
}
