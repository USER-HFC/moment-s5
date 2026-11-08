import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Text} from 'react-native-paper';
import {expect, it, jest} from '@jest/globals';

jest.mock('react-native-safe-area-context', () => ({SafeAreaView: ({children}: any) => children}));
jest.mock('../src/microphonePermission', () => ({requestMicrophonePermission: jest.fn(async () => true)}));

jest.mock('../src/native', () => ({
  camera: {
    capture: jest.fn(), captureStill: jest.fn(), focus: jest.fn(), setAudio: jest.fn(),
    getPreferences: jest.fn(async () => ({
      autoExport: false, syncBodyPhotos: true, rememberCapture: true, onboardingSeen: true,
      capture: {motion: true, grid: false, guide: '1:1', timerSeconds: 5},
      connection: {method: null, cameraIp: '192.168.54.1'},
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

it('restores a saved 3:2 guide and drops a ratio this version does not know', async () => {
  jest.mocked(camera!.setCaptureSettings).mockClear();
  const prefs = {
    autoExport: false, syncBodyPhotos: true, rememberCapture: true, onboardingSeen: true,
    volumeShutter: true, reverseFocus: false, shutterVibration: true,
    connection: {method: null as null, cameraIp: '192.168.54.1'},
  };
  jest.mocked(camera!.getPreferences).mockResolvedValueOnce({...prefs, capture: {motion: false, grid: true, guide: '3:2', timerSeconds: 0}});
  let restored: renderer.ReactTestRenderer;
  await act(async () => { restored = renderer.create(<CameraWorkspace state={state} preview="data:image/jpeg;base64,frame" buffered={3} luts={[]} onAlbum={() => {}} onLut={async () => {}} onImportLut={async () => {}} onRefresh={async () => {}} onConnect={async () => {}}/>); });
  await act(async () => { await Promise.resolve(); });
  act(() => restored!.root.findByProps({testID: 'viewfinder'}).props.onLayout({nativeEvent: {layout: {width: 360, height: 640}}}));
  const button = restored!.root.findAllByProps({accessibilityLabel: '构图参考 3:2'}).find(node => typeof node.props.style === 'function')!;
  expect(button.findByType(Text).props.children).toBe('3:2');
  expect(restored!.root.findByProps({testID: 'reference-frame'}).props.accessibilityLabel).toBe('构图参考 3:2');
  expect(camera!.setCaptureSettings).not.toHaveBeenCalled();
  act(() => restored!.unmount());

  jest.mocked(camera!.getPreferences).mockResolvedValueOnce({...prefs, capture: {motion: false, grid: true, guide: '9:16' as 'off', timerSeconds: 2}});
  let unknown: renderer.ReactTestRenderer;
  await act(async () => { unknown = renderer.create(<CameraWorkspace state={state} buffered={3} luts={[]} onAlbum={() => {}} onLut={async () => {}} onImportLut={async () => {}} onRefresh={async () => {}} onConnect={async () => {}}/>); });
  await act(async () => { await Promise.resolve(); });
  expect(unknown!.root.findByProps({accessibilityLabel: '构图参考 关'})).toBeTruthy();
  expect(unknown!.root.findAllByProps({testID: 'reference-frame'})).toHaveLength(0);
  expect(unknown!.root.findByProps({accessibilityLabel: '定时 2 秒'})).toBeTruthy();
  act(() => unknown!.unmount());
});
