package android.hardware.usb;
public final class UsbManager {
    public final UsbDeviceConnection connection=new UsbDeviceConnection();
    public int opened;
    public UsbDeviceConnection openDevice(UsbDevice device){opened++;return connection;}
}
