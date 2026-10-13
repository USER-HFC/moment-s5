package cn.moment.lumix;

import android.hardware.usb.UsbDevice;
import com.facebook.react.bridge.LifecycleEventListener;
import java.util.function.Consumer;

/** Defers USB permission results until foreground and discards cancelled requests. */
final class CameraLifecycle implements LifecycleEventListener {
    private final CaptureEngine engine;
    private final Consumer<UsbDevice> connect;
    private boolean foreground=true;
    private String requestedDevice;
    private UsbDevice pendingDevice;

    CameraLifecycle(CaptureEngine engine,Consumer<UsbDevice> connect) {this.engine=engine;this.connect=connect;}
    synchronized void request(UsbDevice device) {requestedDevice=device.getDeviceName();pendingDevice=null;}
    synchronized void connect(UsbDevice device) {if(foreground)connect.accept(device);else pendingDevice=device;}
    synchronized boolean permission(UsbDevice device,boolean granted) {
        if(requestedDevice==null || device==null || !requestedDevice.equals(device.getDeviceName())) return false;
        requestedDevice=null;
        if(granted)connect(device);
        return true;
    }
    synchronized void cancel() {requestedDevice=null;pendingDevice=null;}
    @Override public synchronized void onHostResume() {
        foreground=true;
        UsbDevice device=pendingDevice;pendingDevice=null;
        if(device!=null)connect.accept(device);
    }
    @Override public synchronized void onHostPause() {foreground=false;engine.disconnect();}
    @Override public synchronized void onHostDestroy() {foreground=false;cancel();engine.disconnect();}
}
