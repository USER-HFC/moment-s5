package cn.moment.lumix;

import android.content.Context;
import android.view.View;
import com.facebook.react.views.view.ReactViewGroup;
import java.util.ArrayList;

/**
 * UiAutomator asks for views that are not important, and the framework then still
 * walks their descendants. An overlay's page behind has to leave the accessibility
 * tree entirely, or the dump (and some services) keep reading it.
 */
public final class A11yHideView extends ReactViewGroup {
    public A11yHideView(Context context) { super(context); }

    @Override public void addChildrenForAccessibility(ArrayList<View> outChildren) {
        if (getImportantForAccessibility() == IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS) return;
        super.addChildrenForAccessibility(outChildren);
    }
}
