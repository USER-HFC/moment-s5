import {Alert, PermissionsAndroid, Platform} from 'react-native';
import {afterEach, expect, it, jest} from '@jest/globals';
import {requestMicrophonePermission} from '../src/microphonePermission';

const originalPlatform = Platform.OS;
afterEach(() => { jest.restoreAllMocks(); Platform.OS = originalPlatform; });

it('requests Android microphone permission only if it is missing', async () => {
  Platform.OS = 'android';
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
  const request = jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
  expect(await requestMicrophonePermission()).toBe(true);
  expect(request).toHaveBeenCalledWith(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, expect.any(Object));
});

it('reports denial and does not enable audio', async () => {
  Platform.OS = 'android';
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
  jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  expect(await requestMicrophonePermission()).toBe(false); expect(alert).toHaveBeenCalledTimes(1);
});

it('does not prompt again for a granted permission', async () => {
  Platform.OS = 'android';
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
  const request = jest.spyOn(PermissionsAndroid, 'request');
  expect(await requestMicrophonePermission()).toBe(true); expect(request).not.toHaveBeenCalled();
});

it('handles a failed system permission request without an unhandled rejection', async () => {
  Platform.OS = 'android';
  jest.spyOn(PermissionsAndroid, 'check').mockRejectedValue(new Error('permission activity unavailable'));
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  expect(await requestMicrophonePermission()).toBe(false);
  expect(alert).toHaveBeenCalledWith('未开启环境声', 'permission activity unavailable');
});
