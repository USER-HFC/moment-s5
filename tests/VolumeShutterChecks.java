package cn.moment.lumix;

/** Host checks for volume-key shutter gating. No device. */
public final class VolumeShutterChecks {
    private static int checks;
    private static void check(boolean value, String message) { checks++; if (!value) throw new AssertionError(message); }

    public static void main(String[] args) {
        VolumeShutter.setCaptureScreen(false);
        VolumeShutter.setForeground(false);
        final int back = 4;

        check(!VolumeShutter.isVolumeKey(back), "back is not a volume key");
        check(!VolumeShutter.consume(back, true), "non-volume keys stay with the system");
        check(!VolumeShutter.fire(back, VolumeShutter.ACTION_DOWN, 0, true), "non-volume keys do not shoot");

        VolumeShutter.setForeground(true);
        VolumeShutter.setCaptureScreen(false);
        check(!VolumeShutter.consume(VolumeShutter.VOLUME_DOWN, true), "off the capture screen the volume key is not consumed");
        check(!VolumeShutter.fire(VolumeShutter.VOLUME_DOWN, VolumeShutter.ACTION_DOWN, 0, true), "off the capture screen a press does not shoot");

        VolumeShutter.setCaptureScreen(true);
        VolumeShutter.setForeground(false);
        check(!VolumeShutter.consume(VolumeShutter.VOLUME_UP, true), "a background activity does not consume volume keys");
        check(!VolumeShutter.fire(VolumeShutter.VOLUME_UP, VolumeShutter.ACTION_DOWN, 0, true), "a background activity does not shoot");

        VolumeShutter.setForeground(true);
        check(!VolumeShutter.consume(VolumeShutter.VOLUME_DOWN, false), "the preference off leaves the volume keys alone");
        check(!VolumeShutter.fire(VolumeShutter.VOLUME_UP, VolumeShutter.ACTION_DOWN, 0, false), "the preference off does not shoot");

        check(VolumeShutter.consume(VolumeShutter.VOLUME_DOWN, true), "capture screen, foreground, preference on consumes volume down");
        check(VolumeShutter.consume(VolumeShutter.VOLUME_UP, true), "volume up is the same shutter");
        check(VolumeShutter.fire(VolumeShutter.VOLUME_DOWN, VolumeShutter.ACTION_DOWN, 0, true), "the first down event shoots");
        check(VolumeShutter.fire(VolumeShutter.VOLUME_UP, VolumeShutter.ACTION_DOWN, 0, true), "volume up's first down event shoots");
        check(!VolumeShutter.fire(VolumeShutter.VOLUME_DOWN, VolumeShutter.ACTION_DOWN, 1, true), "holding the key does not shoot again");
        check(!VolumeShutter.fire(VolumeShutter.VOLUME_DOWN, VolumeShutter.ACTION_DOWN, 8, true), "later repeats still do not shoot");
        check(VolumeShutter.consume(VolumeShutter.VOLUME_DOWN, true), "repeats are still consumed so the volume does not climb");
        check(!VolumeShutter.fire(VolumeShutter.VOLUME_DOWN, VolumeShutter.ACTION_UP, 0, true), "releasing the key does not shoot a second time");
        check(VolumeShutter.consume(VolumeShutter.VOLUME_UP, true), "key up is consumed");

        VolumeShutter.setCaptureScreen(false);
        check(!VolumeShutter.consume(VolumeShutter.VOLUME_DOWN, true), "leaving the capture screen restores the volume keys");
        VolumeShutter.setForeground(false);
        System.out.println("PASS " + checks + " volume shutter checks");
    }
}
