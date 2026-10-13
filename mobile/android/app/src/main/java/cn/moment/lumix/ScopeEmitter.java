package cn.moment.lumix;

import android.util.Base64;
import com.facebook.react.bridge.Arguments;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.WritableMap;
import com.facebook.react.modules.core.DeviceEventManagerModule;

/** Versioned, fixed-size scope payload; no JPEGs or pixel arrays cross this event. */
final class ScopeEmitter implements AutoCloseable {
    private final ScopeStream stream;
    ScopeEmitter(ReactApplicationContext context) {
        stream=new ScopeStream((data,timestampUs,demo,rotation,sourceAspectRatio)->{
            if(!context.hasActiveCatalystInstance())return;
            WritableMap event=Arguments.createMap();
            event.putInt("version",1);event.putDouble("timestampUs",timestampUs);
            event.putInt("width",data.width);event.putInt("height",data.height);event.putInt("rotation",rotation);
            event.putDouble("sourceAspectRatio",sourceAspectRatio);
            event.putBoolean("demo",demo);event.putBoolean("postLut",true);
            event.putInt("pixels",data.pixels);event.putInt("clipLow",data.clipLow);event.putInt("clipHigh",data.clipHigh);
            event.putString("histogram",Base64.encodeToString(data.histogram,Base64.NO_WRAP));
            event.putString("waveform",Base64.encodeToString(data.waveform,Base64.NO_WRAP));
            event.putString("parade",Base64.encodeToString(data.parade,Base64.NO_WRAP));
            event.putString("vectorscope",Base64.encodeToString(data.vectorscope,Base64.NO_WRAP));
            context.getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter.class).emit("cameraScopes",event);
        });
    }
    void configure(boolean enabled,boolean rotateClockwise,double sourceAspectRatio) {stream.configure(enabled,rotateClockwise,sourceAspectRatio);}
    void offer(byte[] jpeg,boolean demo) {stream.offer(jpeg,demo);}
    @Override public void close() {stream.close();}
}
