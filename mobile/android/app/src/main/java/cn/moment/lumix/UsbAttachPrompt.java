package cn.moment.lumix;

/**
 * What the existing USB broadcast should do. An attach only asks; the notice button connects.
 * Action strings are UsbManager.ACTION_USB_DEVICE_ATTACHED and DETACHED.
 */
public final class UsbAttachPrompt {
    public static final String EVENT = "usbCameraAttached";
    public static final String ATTACHED = "android.hardware.usb.action.USB_DEVICE_ATTACHED";
    public static final String DETACHED = "android.hardware.usb.action.USB_DEVICE_DETACHED";
    public static final int NONE = 0;
    public static final int DETACH = 1;
    public static final int PROMPT = 2;

    private UsbAttachPrompt() {}

    public static int action(String intentAction, boolean candidate, boolean foreground, boolean sessionActive) {
        if (DETACHED.equals(intentAction)) return candidate ? DETACH : NONE;
        if (ATTACHED.equals(intentAction) && candidate && foreground && !sessionActive) return PROMPT;
        return NONE;
    }
}
