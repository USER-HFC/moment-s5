package cn.moment.lumix;

import android.content.Intent;
import android.net.Uri;
import android.provider.Settings;

/** The system page for this app, where the microphone toggle lives. */
public final class AppDetails {
    private AppDetails() {}

    public static Intent intent(String packageName) {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.fromParts("package", packageName, null));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return intent;
    }
}
