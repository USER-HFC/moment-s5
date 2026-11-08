package cn.moment.lumix;

import androidx.annotation.NonNull;
import com.facebook.react.uimanager.ThemedReactContext;
import com.facebook.react.views.view.ReactViewGroup;
import com.facebook.react.views.view.ReactViewManager;

public final class A11yHideViewManager extends ReactViewManager {
    public static final String NAME = "A11yHideView";

    @Override public @NonNull String getName() { return NAME; }

    @Override public @NonNull ReactViewGroup createViewInstance(@NonNull ThemedReactContext context) {
        return new A11yHideView(context);
    }
}
