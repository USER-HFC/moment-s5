package cn.moment.lumix;

import java.io.File;

/** Free bytes on the volume that holds app photos. The shutter threshold lives here once. */
public final class DeviceStorage {
    /** A still plus a short motion clip can fail to save below this. Equal to 300 MiB. */
    public static final long LOW_BYTES = 300L * 1024L * 1024L;
    /** Screenshot launch extra. Not a user setting. */
    public static final String EXTRA_USABLE_BYTES = "moment.usableBytes";

    private static volatile Long override;

    private DeviceStorage() {}

    /** Pass null to read the volume again. Host tests and the screenshot extra use this. */
    public static void overrideUsableBytes(Long bytes) { override = bytes; }

    /**
     * {@link File#getUsableSpace()} is the quota the app can actually write.
     * A missing directory is unknown (-1), which must not look like a full disk.
     */
    public static long usableBytes(File directory) {
        Long forced = override;
        if (forced != null) return forced;
        if (directory == null) return -1L;
        long space = directory.getUsableSpace();
        return space < 0 ? -1L : space;
    }

    /** Unknown space is not low: a missing reading must not block the shutter. */
    public static boolean low(long usableBytes) {
        return usableBytes >= 0 && usableBytes < LOW_BYTES;
    }
}
