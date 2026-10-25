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
    /** Monotonic timestamp of a cached exposure sample, or zero when unavailable. */
    default long exposureUpdatedAtUs() {return 0;}
    Baseline prepareCaptureBaseline() throws Exception;
    default boolean freshBaselineRequired() {return false;}
    void clearCaptureEvents();
    /** One invocation, no automatic retry, including a lost response. */
    void shutter() throws IOException;
    Original awaitNewJpeg(Baseline baseline,BooleanSupplier sessionValid) throws Exception;
    void downloadOriginal(Original original,File destination) throws Exception;
    /** An original kept in this session. A later shutter must not pair it again. */
    default void noteSaved(Original photo) {}
    default void completeWithoutDownload() {}
    /** True when the camera announces every stored object, so photos taken on the body can be synced. */
    default boolean reportsNewPhotos() {return false;}
    /** The next JPEG the camera stored outside an app capture (its own shutter), or null; {@code saved} keys are skipped. */
    default Original nextCameraPhoto(Baseline baseline,java.util.Set<Object> saved) throws IOException {return null;}
    /** {@code baseline} plus a synced photo, so a later app capture never mistakes it for its own. */
    default Baseline withPhoto(Baseline baseline,Original photo) {return baseline;}
    boolean closed();
    void abort();
    @Override void close();
}
