package cn.moment.s5;

import com.facebook.react.ReactPackage;
import com.facebook.react.bridge.NativeModule;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.uimanager.ViewManager;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

public final class MomentS5Package implements ReactPackage {
    @Override public List<NativeModule> createNativeModules(ReactApplicationContext context) {return Collections.singletonList(new MomentS5Module(context));}
    @Override public List<ViewManager> createViewManagers(ReactApplicationContext context) {return new ArrayList<>();}
}
