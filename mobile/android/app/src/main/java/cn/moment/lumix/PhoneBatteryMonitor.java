package cn.moment.lumix;

import android.content.*;
import android.os.BatteryManager;
import com.facebook.react.bridge.LifecycleEventListener;
import java.util.function.Consumer;

/** Android's sticky battery broadcast, subscribed only while the host is foreground. */
final class PhoneBatteryMonitor implements LifecycleEventListener,AutoCloseable {
    record Reading(Integer percent,boolean charging) {}
    interface Source {
        Reading subscribe(Consumer<Reading> changed);
        void unsubscribe();
    }
    private static final Reading UNKNOWN=new Reading(null,false);
    private final Source source;
    private final Consumer<Reading> changed;
    private Reading latest=UNKNOWN;
    private boolean subscribed,closed;

    PhoneBatteryMonitor(Context context,Consumer<Reading> changed) {this(new AndroidSource(context),changed);}
    PhoneBatteryMonitor(Source source,Consumer<Reading> changed) {this.source=source;this.changed=changed;}
    synchronized Reading latest() {return latest;}
    static Reading decode(int level,int scale,int status,boolean present) {
        if(!present || scale<=0 || level<0 || level>scale)return UNKNOWN;
        return new Reading((int)Math.round(level*100.0/scale),status==BatteryManager.BATTERY_STATUS_CHARGING || status==BatteryManager.BATTERY_STATUS_FULL);
    }
    private synchronized void receive(Reading reading) {
        if(!subscribed || closed)return;
        latest=reading==null?UNKNOWN:reading;changed.accept(latest);
    }
    @Override public synchronized void onHostResume() {
        if(closed || subscribed)return;
        subscribed=true;
        try {receive(source.subscribe(this::receive));}
        catch(RuntimeException unavailable) {subscribed=false;source.unsubscribe();latest=UNKNOWN;changed.accept(latest);}
    }
    @Override public synchronized void onHostPause() {
        if(subscribed){subscribed=false;source.unsubscribe();}
        latest=UNKNOWN;
    }
    // The React bridge can outlive a recreated Activity (e.g. system font changes).
    @Override public synchronized void onHostDestroy() {onHostPause();}
    @Override public synchronized void close() {closed=true;onHostPause();}

    private static final class AndroidSource implements Source {
        private final Context context;
        private BroadcastReceiver receiver;
        AndroidSource(Context context) {this.context=context;}
        private static Reading read(Intent intent) {
            if(intent==null || !Intent.ACTION_BATTERY_CHANGED.equals(intent.getAction()))return UNKNOWN;
            return decode(intent.getIntExtra(BatteryManager.EXTRA_LEVEL,-1),intent.getIntExtra(BatteryManager.EXTRA_SCALE,-1),intent.getIntExtra(BatteryManager.EXTRA_STATUS,-1),intent.getBooleanExtra(BatteryManager.EXTRA_PRESENT,false));
        }
        @Override public Reading subscribe(Consumer<Reading> changed) {
            receiver=new BroadcastReceiver(){@Override public void onReceive(Context ignored,Intent intent){changed.accept(read(intent));}};
            return read(context.registerReceiver(receiver,new IntentFilter(Intent.ACTION_BATTERY_CHANGED),Context.RECEIVER_NOT_EXPORTED));
        }
        @Override public void unsubscribe() {
            if(receiver==null)return;
            try {context.unregisterReceiver(receiver);}catch(IllegalArgumentException alreadyUnregistered) { /* Failed registration / host teardown. */ }
            receiver=null;
        }
    }
}
