import {Alert, PermissionsAndroid, Platform} from 'react-native';

export async function requestMicrophonePermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    const permission = PermissionsAndroid.PERMISSIONS.RECORD_AUDIO;
    if (await PermissionsAndroid.check(permission)) return true;
    const result = await PermissionsAndroid.request(permission, {
      title: '录制环境声',
      message: '动态照片可使用手机麦克风收音。允许后，仅在前台连接相机时录制。',
      buttonPositive: '允许',
      buttonNegative: '取消',
    });
    if (result === PermissionsAndroid.RESULTS.GRANTED) return true;
    Alert.alert('未开启环境声', '没有麦克风权限，本次动态照片将保持无声。可在系统设置中允许录音权限。');
  } catch (e) {
    Alert.alert('未开启环境声', String((e as Error)?.message || e));
  }
  return false;
}
