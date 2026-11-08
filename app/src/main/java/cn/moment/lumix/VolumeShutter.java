package cn.moment.lumix;

/**
 * Volume keys become the shutter only on the capture screen, with the preference on, while the
 * activity is resumed. Held keys repeat; only the first down event trips the shutter.
 * Key-code numbers match android.view.KeyEvent so host checks need no Android SDK.
 */
public final class VolumeShutter {
    public static final String PREFS = "moment-settings";
    public static final String PREF_ENABLED = "volumeShutter";
    public static final String EVENT = "volumeShutter";
    public static final int VOLUME_UP = 24;
    public static final int VOLUME_DOWN = 25;
    public static final int ACTION_DOWN = 0;
    public static final int ACTION_UP = 1;

    private static volatile boolean captureScreen;
    private static volatile boolean foreground;

    private VolumeShutter() {}

    public static void setCaptureScreen(boolean value) { captureScreen = value; }
    public static void setForeground(boolean value) { foreground = value; }
    public static boolean captureScreen() { return captureScreen; }
    public static boolean foreground() { return foreground; }

    public static boolean isVolumeKey(int keyCode) {
        return keyCode == VOLUME_UP || keyCode == VOLUME_DOWN;
    }

    /** True when this key must not change the system volume. */
    public static boolean consume(int keyCode, boolean enabled) {
        return isVolumeKey(keyCode) && captureScreen && foreground && enabled;
    }

    /** True when this event should run the shutter once. Repeats and key-up do not. */
    public static boolean fire(int keyCode, int action, int repeatCount, boolean enabled) {
        return consume(keyCode, enabled) && action == ACTION_DOWN && repeatCount == 0;
    }
}
