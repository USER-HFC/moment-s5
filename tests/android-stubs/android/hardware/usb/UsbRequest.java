package android.hardware.usb;

import java.nio.ByteBuffer;

/** Interrupt-endpoint placeholder; the fake device exposes no event endpoint. */
public final class UsbRequest {
    public boolean initialize(UsbDeviceConnection connection,UsbEndpoint endpoint){return false;}
    public boolean queue(ByteBuffer buffer){return false;}
    public boolean cancel(){return true;}
    public void close(){}
}
