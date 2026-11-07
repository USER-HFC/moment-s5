import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {expect, it, jest} from '@jest/globals';

jest.mock('react-native-safe-area-context', () => ({SafeAreaView: ({children}: any) => children}));
jest.mock('../src/microphonePermission', () => ({requestMicrophonePermission: jest.fn(async () => true)}));

jest.mock('../src/native', () => ({
  camera: {
    capture: jest.fn(), captureStill: jest.fn(), focus: jest.fn(), setAudio: jest.fn(),
    getPreferences: jest.fn(async () => ({
      autoExport: false, syncBodyPhotos: true, rememberCapture: true, onboardingSeen: true,
      capture: {motion: true, grid: false, guide: '1:1', timerSeconds: 5},
    })),
    setCaptureSettings: jest.fn(async () => {}),
  },
  cameraEvents: null,
}));

import CameraWorkspace from '../src/CameraWorkspace';
import {camera, CameraState} from '../src/native';

const state: CameraState = {active: true, busy: false, ready: true, demo: true, lut: null};

it('restores the last capture setup and writes the next change', async () => {
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<CameraWorkspace state={state} buffered={3} luts={[]} onAlbum={() => {}} onLut={async () => {}} onImportLut={async () => {}} onRefresh={async () => {}} onConnect={async () => {}}/>); });
  await act(async () => { await Promise.resolve(); });
  const switched = (label: string) => tree!.root.findByProps({accessibilityLabel: label, accessibilityRole: 'switch'});
  expect(tree!.root.findByProps({accessibilityLabel: '动态照片'}).props.accessibilityState.checked).toBe(true);
  expect(switched('构图网格').props.accessibilityState.checked).toBe(false);
  expect(tree!.root.findByProps({accessibilityLabel: '构图参考 1:1'})).toBeTruthy();
  expect(tree!.root.findByProps({accessibilityLabel: '定时 5 秒'})).toBeTruthy();
  await act(async () => switched('构图网格').props.onPress());
  expect(camera!.setCaptureSettings).toHaveBeenCalledWith({motion: true, grid: true, guide: '1:1', timerSeconds: 5});
  act(() => tree!.unmount());
});
