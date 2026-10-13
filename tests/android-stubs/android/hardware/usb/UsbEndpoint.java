package android.hardware.usb;
public final class UsbEndpoint {
    private final int direction;
    public UsbEndpoint(int direction){this.direction=direction;}
    public int getType(){return 2;}
    public int getDirection(){return direction;}
    public int getAddress(){return direction==128?129:1;}
}
