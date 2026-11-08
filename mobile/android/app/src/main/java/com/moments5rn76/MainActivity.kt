package com.moments5rn

import android.content.Context
import android.view.KeyEvent
import cn.moment.lumix.MomentS5Module
import cn.moment.lumix.VolumeShutter
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

class MainActivity : ReactActivity() {

  /**
   * Returns the name of the main component registered from JavaScript. This is used to schedule
   * rendering of the component.
   */
  override fun getMainComponentName(): String = "MomentLumix"

  /**
   * Returns the instance of the [ReactActivityDelegate]. We use [DefaultReactActivityDelegate]
   * which allows you to enable New Architecture with a single boolean flags [fabricEnabled]
   */
  override fun createReactActivityDelegate(): ReactActivityDelegate =
      DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)

  override fun onResume() {
    super.onResume()
    VolumeShutter.setForeground(true)
  }

  override fun onPause() {
    // Drop the foreground flag before the window can lose the key, so a late event is not eaten.
    VolumeShutter.setForeground(false)
    super.onPause()
  }

  // Catch the key before the window turns it into a volume change. Repeats stay consumed and do not shoot.
  override fun dispatchKeyEvent(event: KeyEvent): Boolean {
    val enabled = volumeShutterEnabled()
    if (!VolumeShutter.consume(event.keyCode, enabled)) return super.dispatchKeyEvent(event)
    if (VolumeShutter.fire(event.keyCode, event.action, event.repeatCount, enabled)) MomentS5Module.emitVolumeShutter()
    return true
  }

  private fun volumeShutterEnabled(): Boolean {
    return getSharedPreferences(VolumeShutter.PREFS, Context.MODE_PRIVATE)
        .getBoolean(VolumeShutter.PREF_ENABLED, true)
  }
}
