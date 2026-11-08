package com.moments5rn

import android.content.Context
import android.os.Bundle
import android.view.KeyEvent
import android.view.View
import android.view.ViewGroup
import android.view.Window
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.view.WindowManager
import cn.moment.lumix.MomentS5Module
import cn.moment.lumix.VolumeShutter
import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate
import com.facebook.react.views.modal.ReactModalHostView

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

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    // <StatusBar hidden /> only sets FLAG_FULLSCREEN. targetSdk 35 still draws the status-bar
    // icons over the content, and a Modal or a focus change never puts that flag back.
    applyImmersive()
  }

  override fun onResume() {
    super.onResume()
    applyImmersive()
    VolumeShutter.setForeground(true)
  }

  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    // Focus returns after a Modal, a share sheet, or resume. Re-apply so the bars do not stay up.
    // A Modal is its own window and is the one focused while it is open.
    applyImmersive()
    if (!hasFocus) window.decorView.post { applyImmersive() }
  }

  // Safe area insets follow the visible system bars, so hiding them here drops the status-bar
  // padding instead of leaving a reserved gap. A cutout inset remains.
  private fun applyImmersive() {
    applyImmersiveWindow(window)
    applyImmersiveToModals(window.decorView)
  }

  private fun applyImmersiveWindow(target: Window) {
    val attrs = target.attributes
    if (attrs.layoutInDisplayCutoutMode != WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES) {
      attrs.layoutInDisplayCutoutMode = WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES
      target.attributes = attrs
    }
    // RN 0.76 copies only this flag onto a Modal. Keep it set; the controller below is what hides the bars.
    target.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
    target.clearFlags(WindowManager.LayoutParams.FLAG_FORCE_NOT_FULLSCREEN)
    target.setDecorFitsSystemWindows(false)
    val controller = target.insetsController ?: return
    controller.systemBarsBehavior = WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
    controller.hide(WindowInsets.Type.systemBars())
  }

  private fun applyImmersiveToModals(view: View) {
    if (view is ReactModalHostView) view.dialog?.window?.let { applyImmersiveWindow(it) }
    if (view is ViewGroup) {
      for (index in 0 until view.childCount) applyImmersiveToModals(view.getChildAt(index))
    }
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
