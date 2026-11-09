package cn.moment.lumix;

import android.content.Intent;
import android.provider.Settings;

import java.io.File;

/** Host checks for iteration 5 system helpers. No device. */
public final class Iteration5SystemChecks {
    private static int checks;
    private static void check(boolean value, String message) { checks++; if (!value) throw new AssertionError(message); }

    /** Sync timing line: each stage measured from the one before it, size and speed when known. */
    private static void syncTiming() {
        SyncTiming t = new SyncTiming(0, 50_000, 470_000);
        t.found = 780_000; t.downloaded = 2_610_000; t.bytes = 13_002_342; t.lut = 640_000;
        String line = t.line("拍照", 3_400_000);
        check(line.equals("同步耗时 · 拍照 · 快门 420 ms · 等新照片 310 ms · 传输 1830 ms（12.4 MB，6.8 MB/s） · LUT 640 ms · 合计 3.4 s"), "sync timing line: " + line);
        SyncTiming body = new SyncTiming(100, 100, 100);
        body.found = 100; body.downloaded = 900_100; body.bytes = 9_437_184;
        String bodyLine = body.line("机身照片", 1_000_100);
        check(bodyLine.equals("同步耗时 · 机身照片 · 传输 900 ms（9.0 MB，10.0 MB/s） · 合计 1.0 s"), "body photo line skips shutter, wait and LUT: " + bodyLine);
    }

    public static void main(String[] args) throws Exception {
        storageChecks();
        immersiveChecks();
        batterySignalChecks();
        appDetailsChecks();
        syncTiming();
        System.out.println("PASS " + checks + " iteration 5 system checks");
    }

    private static void storageChecks() {
        DeviceStorage.overrideUsableBytes(null);
        check(DeviceStorage.LOW_BYTES == 300L * 1024L * 1024L, "low-storage threshold stays 300 MiB");
        check(DeviceStorage.low(DeviceStorage.LOW_BYTES - 1), "one byte below the threshold is low");
        check(!DeviceStorage.low(DeviceStorage.LOW_BYTES), "the threshold itself is not low");
        check(!DeviceStorage.low(-1), "unknown free space must not block the shutter");
        check(DeviceStorage.usableBytes(null) == -1, "missing directory is unknown free space");

        DeviceStorage.overrideUsableBytes(123L);
        check(DeviceStorage.usableBytes(new File("/does/not/exist")) == 123L, "screenshot/test override wins");
        check(DeviceStorage.low(DeviceStorage.usableBytes(new File("/does/not/exist"))), "forced low value is low");
        DeviceStorage.overrideUsableBytes(DeviceStorage.LOW_BYTES);
        check(!DeviceStorage.low(DeviceStorage.usableBytes(new File("/does/not/exist"))), "forced threshold value is not low");
        DeviceStorage.overrideUsableBytes(null);
        check(DeviceStorage.usableBytes(new File(".")) >= 0, "real directory reads usable space");
    }

    private static void immersiveChecks() {
        check(ImmersiveChrome.REHIDE_MS == 3_000L, "bars stay up about three seconds");
        check(ImmersiveChrome.hideAt(0, true, true, ImmersiveChrome.UNSCHEDULED) == 3_000L, "a visible bar schedules a hide");
        check(ImmersiveChrome.hideAt(1_000, true, true, 3_000L) == 3_000L, "later samples do not postpone the deadline");
        check(ImmersiveChrome.hideAt(0, false, true, ImmersiveChrome.UNSCHEDULED) == ImmersiveChrome.UNSCHEDULED, "a hidden bar has nothing to hide");
        check(ImmersiveChrome.hideAt(0, true, false, ImmersiveChrome.UNSCHEDULED) == ImmersiveChrome.UNSCHEDULED, "a dialog that still owns focus is not interrupted");
        check(ImmersiveChrome.hideAt(0, true, false, 3_000L) == ImmersiveChrome.UNSCHEDULED, "losing focus cancels an old deadline");
        check(ImmersiveChrome.due(3_000L, 3_000L), "the deadline is due at the sample");
        check(!ImmersiveChrome.due(2_999L, 3_000L), "the deadline is not due early");
        check(!ImmersiveChrome.due(3_000L, ImmersiveChrome.UNSCHEDULED), "nothing scheduled is never due");
    }

    private static void batterySignalChecks() {
        CameraBatterySignal.overridePercent(null);
        check(CameraBatterySignal.percent() == null, "no screenshot extra leaves the camera battery unknown");
        CameraBatterySignal.overridePercent(0);
        check(CameraBatterySignal.percent() == 0, "zero percent is a real reading");
        CameraBatterySignal.overridePercent(15);
        check(CameraBatterySignal.percent() == 15, "the low-battery limit is accepted");
        CameraBatterySignal.overridePercent(100);
        check(CameraBatterySignal.percent() == 100, "full battery is accepted");
        CameraBatterySignal.overridePercent(-1);
        check(CameraBatterySignal.percent() == null, "negative percent is ignored");
        CameraBatterySignal.overridePercent(101);
        check(CameraBatterySignal.percent() == null, "over 100 is ignored");
        CameraBatterySignal.overridePercent(null);
    }

    private static void appDetailsChecks() {
        Intent intent = AppDetails.intent("cn.moment.lumix");
        check(Settings.ACTION_APPLICATION_DETAILS_SETTINGS.equals(intent.getAction()), "app details uses the system app-settings action");
        check("package:cn.moment.lumix".equals(intent.getDataString()), "app details targets this package");
        check((intent.getFlags() & Intent.FLAG_ACTIVITY_NEW_TASK) != 0, "app details can start without an activity context");
    }
}
