package cn.moment.lumix;

/**
 * USB and Wi-Fi do not expose a verified body-battery property, so a normal launch stays empty.
 * A screenshot can pass a percent in {@link #EXTRA_PERCENT}; values outside 0–100 are ignored.
 */
public final class CameraBatterySignal {
    public static final String EXTRA_PERCENT = "moment.cameraBattery";

    private static volatile Integer percent;

    private CameraBatterySignal() {}

    public static void overridePercent(Integer value) {
        if (value == null || value < 0 || value > 100) { percent = null; return; }
        percent = value;
    }

    public static Integer percent() { return percent; }
}
