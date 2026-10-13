package android.hardware.usb;
public final class UsbInterface {
    public int getInterfaceClass(){return 6;}
    public int getEndpointCount(){return 2;}
    public int getId(){return 0;}
    public UsbEndpoint getEndpoint(int i){return new UsbEndpoint(i==0?128:0);}
}
