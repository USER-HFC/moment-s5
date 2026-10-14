package cn.moment.lumix;

import java.io.File;
import java.io.IOException;
import java.util.function.BooleanSupplier;

/** Camera I/O only. Capture timing, LUTs, encoding and storage stay in CaptureEngine. */
public interface CameraTransport extends AutoCloseable {
    interface Baseline {}
    record Preview(byte[] jpeg,long receivedUs) {}
    record Original(Object key,String filename,long size) {}
    record Capabilities(boolean autofocus,boolean manualFocus,boolean exposure) {}
    String kind();
    void open() throws Exception;
    Preview preview() throws IOException;
    Capabilities capabilities();
    void autofocus() throws IOException;
    void focus(boolean far) throws IOException;
    String exposure();
    Baseline prepareCaptureBaseline() throws Exception;
    default boolean freshBaselineRequired() {return false;}
    void clearCaptureEvents();
    /** One invocation, no automatic retry, including a lost response. */
    void shutter() throws IOException;
    Original awaitNewJpeg(Baseline baseline,BooleanSupplier sessionValid) throws Exception;
    void downloadOriginal(Original original,File destination) throws Exception;
    default void completeWithoutDownload() {}
    boolean closed();
    void abort();
    @Override void close();
}
