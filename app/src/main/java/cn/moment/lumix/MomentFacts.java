package cn.moment.lumix;

import java.util.Locale;

/** Display labels shared by the album info panel. Null means the value is absent. */
public final class MomentFacts {
    private MomentFacts() {}

    public static String origin(boolean demo, boolean cameraTriggered) {
        if (demo) return "演示";
        if (cameraTriggered) return "机身快门同步";
        return "App 快门";
    }

    public static String transport(String kind) {
        if (kind == null || kind.isEmpty()) return "未知";
        switch (kind) {
            case "usb": return "USB";
            case "wifi": return "Wi-Fi（实验）";
            case "demo": return "演示";
            default: return kind;
        }
    }

    public static String cameraName(String make, String model) {
        String made = blank(make) ? null : make.trim();
        String named = blank(model) ? null : model.trim();
        if (named == null) return made;
        if (made == null || named.toLowerCase(Locale.ROOT).contains(made.toLowerCase(Locale.ROOT))) return named;
        return made + " " + named;
    }

    public static String iso(int value) { return value > 0 ? "ISO " + value : null; }

    public static String shutter(double seconds) {
        if (!(seconds > 0) || !Double.isFinite(seconds)) return null;
        if (seconds >= 1) return trim(seconds) + "s";
        int n = (int) Math.round(1d / seconds);
        return "1/" + Math.max(1, n);
    }

    public static String aperture(double value) {
        if (!(value > 0) || !Double.isFinite(value)) return null;
        return "f/" + trim(value);
    }

    public static String focal(double millimeters) {
        if (!(millimeters > 0) || !Double.isFinite(millimeters)) return null;
        return trim(millimeters) + " mm";
    }

    public static String dimensions(int width, int height) {
        if (width <= 0 || height <= 0) return null;
        return width + " × " + height;
    }

    private static String trim(double value) {
        double rounded = Math.round(value * 10d) / 10d;
        if (Math.abs(rounded - Math.rint(rounded)) < 0.05) return String.valueOf((int) Math.rint(rounded));
        return String.valueOf(rounded);
    }

    private static boolean blank(String value) { return value == null || value.trim().isEmpty(); }
}
