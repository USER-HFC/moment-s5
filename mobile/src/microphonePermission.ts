import {Linking, PermissionsAndroid, Platform} from 'react-native';
import {camera} from './native';

/** True when recording is already allowed. A denial is handled by the in-app dialog, not a system alert. */
export async function requestMicrophonePermission(): Promise<boolean> {
  if (Platform.OS === 'ios') {
    // iOS shows its own prompt the first time; after a denial the in-app dialog points to Settings.
    try { return camera?.requestMicrophone ? await camera.requestMicrophone() : true; } catch { return false; }
  }
  if (Platform.OS !== 'android') return true;
  try {
    return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO);
  } catch {
    return false;
  }
}

/** App details in system settings. The page is where the microphone toggle can be turned on. */
export async function openMicrophoneSettings(): Promise<void> {
  if (camera?.openAppSettings) {
    await camera.openAppSettings();
    return;
  }
  await Linking.openSettings();
}
