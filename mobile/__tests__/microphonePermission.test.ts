import {Linking, PermissionsAndroid, Platform} from 'react-native';
import {afterEach, expect, it, jest} from '@jest/globals';

jest.mock('../src/native', () => ({camera: {openAppSettings: jest.fn()}}));

import {camera} from '../src/native';
import {openMicrophoneSettings, requestMicrophonePermission} from '../src/microphonePermission';

const originalPlatform = Platform.OS;
const originalNativeSettings = camera?.openAppSettings;
afterEach(() => {
  jest.restoreAllMocks();
  Platform.OS = originalPlatform;
  if (camera) camera.openAppSettings = originalNativeSettings;
});

it('only checks Android microphone permission instead of showing a light system dialog', async () => {
  Platform.OS = 'android';
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
  const request = jest.spyOn(PermissionsAndroid, 'request');
  expect(await requestMicrophonePermission()).toBe(false);
  expect(request).not.toHaveBeenCalled();
});

it('reports the granted state and does not prompt again', async () => {
  Platform.OS = 'android';
  jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(true);
  const request = jest.spyOn(PermissionsAndroid, 'request');
  expect(await requestMicrophonePermission()).toBe(true);
  expect(request).not.toHaveBeenCalled();
});

it('treats a failed permission check as unavailable', async () => {
  Platform.OS = 'android';
  jest.spyOn(PermissionsAndroid, 'check').mockRejectedValue(new Error('permission activity unavailable'));
  expect(await requestMicrophonePermission()).toBe(false);
});

it('opens the app details page through the native bridge', async () => {
  const openSettings = jest.fn(async () => {});
  if (camera) camera.openAppSettings = openSettings;
  await openMicrophoneSettings();
  expect(openSettings).toHaveBeenCalledTimes(1);
});

it('falls back to the platform settings page without the native bridge', async () => {
  if (camera) camera.openAppSettings = undefined;
  const openSettings = jest.spyOn(Linking, 'openSettings').mockResolvedValue(undefined as never);
  await openMicrophoneSettings();
  expect(openSettings).toHaveBeenCalledTimes(1);
});
