import React, {useState} from 'react';
import renderer, {act} from 'react-test-renderer';
import {Animated, AppState, StyleSheet, Vibration} from 'react-native';
import {afterEach, expect, it, jest} from '@jest/globals';

jest.mock('react-native-document-picker', () => ({types: {allFiles: '*/*'}, pickSingle: jest.fn(), isCancel: () => false}));
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const Context = React.createContext({top: 0, right: 0, bottom: 0, left: 0});
  return {SafeAreaProvider: ({children}: any) => React.createElement(Context.Provider, {value: {top: 0, right: 0, bottom: 0, left: 0}}, children), SafeAreaView: ({children}: any) => children, SafeAreaInsetsContext: Context, useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0})};
});
jest.mock('../src/microphonePermission', () => ({requestMicrophonePermission: jest.fn(async () => true)}));

const mockPreferences = {
  autoExport: false, syncBodyPhotos: true, rememberCapture: false, onboardingSeen: true,
  volumeShutter: true, reverseFocus: false, shutterVibration: true,
  capture: {motion: false, grid: true, guide: 'off' as const, timerSeconds: 0},
};

jest.mock('../src/native', () => {
  const listeners = new Map<string, Function>();
  return {
    camera: {
      capture: jest.fn(), captureStill: jest.fn(), focus: jest.fn(), setAudio: jest.fn(), demo: jest.fn(),
      listLuts: jest.fn(async () => []), listMoments: jest.fn(async () => []),
      getState: jest.fn(async () => ({active: false, busy: false, ready: false, demo: false, lut: null})),
      getPreferences: jest.fn(async () => mockPreferences),
      setPreference: jest.fn(async () => {}),
      setCaptureScreen: jest.fn(),
      setCaptureSettings: jest.fn(async () => {}),
      diagnostics: async () => '',
    },
    cameraEvents: {
      listeners,
      addListener: (name: string, listener: Function) => {
        listeners.set(name, listener);
        return {remove: () => { if (listeners.get(name) === listener) listeners.delete(name); }};
      },
    },
  };
});

import App from '../App';
import CameraWorkspace from '../src/CameraWorkspace';
import GuideScreen from '../src/GuideScreen';
import SettingsScreen, {SettingsPage} from '../src/SettingsScreen';
import {camera, cameraEvents, CameraState} from '../src/native';
import {savePreference} from '../src/preferences';
import {VOLUME_SHUTTER_EVENT} from '../src/volumeShutter';
import {BuildInfo} from '../src/buildInfo';

const state: CameraState = {active: true, busy: false, ready: true, demo: true, lut: null, transport: 'demo'};
const props = {state, buffered: 3, luts: [], onAlbum: jest.fn(), onLut: async () => {}, onImportLut: async () => {}, onRefresh: async () => {}, onConnect: async () => {}};
const build: BuildInfo = {versionName: '0.8.0-beta.6', versionCode: '27', builtAt: '2026-11-08T00:00:00Z', git: 'abc', buildType: 'release', abi: 'arm64-v8a', minSdk: '33'};

function SettingsHarness() {
  const [page, setPage] = useState<SettingsPage>('list');
  return <SettingsScreen build={build} page={page} onPageChange={setPage} onBack={() => {}} onNotice={() => {}}/>;
}

const volumeHandlers = () => (cameraEvents as unknown as {listeners: Map<string, Function>}).listeners;
const volume = () => act(() => {
  const handler = volumeHandlers().get(VOLUME_SHUTTER_EVENT);
  if (!handler) throw new Error('volume shutter listener missing');
  handler();
});
const press = (tree: renderer.ReactTestRenderer, label: string) => act(() => {
  const nodes = tree.root.findAllByProps({accessibilityLabel: label});
  const target = nodes.find(node => typeof node.props.style === 'function') || nodes[0];
  target.props.onPress();
});
const switched = (tree: renderer.ReactTestRenderer, label: string) => tree.root.findByProps({accessibilityLabel: label, accessibilityRole: 'switch'});
let mounted: renderer.ReactTestRenderer | undefined;
afterEach(() => {
  if (mounted) act(() => mounted!.unmount());
  mounted = undefined;
  jest.clearAllTimers();
  jest.useRealTimers();
  AppState.currentState = 'active';
});
async function settle() {
  for (let step = 0; step < 8; step += 1) await act(async () => { await Promise.resolve(); });
}

function resetPreferences() {
  mockPreferences.volumeShutter = true;
  mockPreferences.reverseFocus = false;
  mockPreferences.shutterVibration = true;
  mockPreferences.onboardingSeen = true;
  mockPreferences.rememberCapture = false;
}

it('shows the capture switches and points the focus guide at the reverse switch', async () => {
  resetPreferences();
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<SettingsHarness/>); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  expect(switched(tree!, '音量键拍摄').props.accessibilityState.checked).toBe(true);
  expect(switched(tree!, '反转近 / 远对焦方向').props.accessibilityState.checked).toBe(false);
  expect(switched(tree!, '快门震动').props.accessibilityState.checked).toBe(true);
  await act(async () => switched(tree!, '音量键拍摄').props.onPress());
  await act(async () => switched(tree!, '反转近 / 远对焦方向').props.onPress());
  await act(async () => switched(tree!, '快门震动').props.onPress());
  expect(camera!.setPreference).toHaveBeenCalledWith('volumeShutter', false);
  expect(camera!.setPreference).toHaveBeenCalledWith('reverseFocus', true);
  expect(camera!.setPreference).toHaveBeenCalledWith('shutterVibration', false);
  expect(switched(tree!, '音量键拍摄').props.accessibilityState.checked).toBe(false);
  expect(switched(tree!, '快门震动').props.accessibilityState.checked).toBe(false);
  act(() => tree!.root.findByProps({testID: 'settings-guide'}).props.onPress());
  const guide = JSON.stringify(tree!.toJSON());
  expect(guide).toContain('反转近 / 远对焦方向');
  expect(guide).toContain('按钮上的字不变');
  expect(guide).not.toContain('按另一侧');
  act(() => tree!.unmount());
});

it('keeps the guide reachable on its own page', () => {
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<GuideScreen onBack={() => {}} onShowIntro={() => {}}/>); });
  expect(JSON.stringify(tree!.toJSON())).toContain('打开设置里的「反转近 / 远对焦方向」');
  act(() => tree!.unmount());
});

it('uses the shutter path for a volume event, including the blocked reason, timer, and cancel', async () => {
  resetPreferences();
  AppState.currentState = 'active';
  jest.useFakeTimers();
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<CameraWorkspace {...props}/>); });
  mounted = tree!;
  await settle();
  volume();
  expect(camera!.captureStill).toHaveBeenCalledTimes(1);
  expect(camera!.capture).not.toHaveBeenCalled();

  act(() => tree!.update(<CameraWorkspace {...props} state={{...state, active: false, ready: false}}/>));
  volume();
  expect(camera!.captureStill).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(tree!.toJSON())).toContain('请先连接相机');

  act(() => tree!.update(<CameraWorkspace {...props} state={{...state, busy: true}}/>));
  volume();
  expect(JSON.stringify(tree!.toJSON())).toContain('正在保存上一张');

  act(() => tree!.update(<CameraWorkspace {...props} state={{...state, ready: false}} buffered={1.2}/>));
  press(tree!, '动态照片');
  volume();
  expect(camera!.capture).not.toHaveBeenCalled();
  expect(JSON.stringify(tree!.toJSON())).toContain('动态照片还在缓存，还需约 2 秒');

  act(() => tree!.update(<CameraWorkspace {...props}/>));
  press(tree!, '普通照片');
  press(tree!, '定时 关');
  press(tree!, '定时 2 秒');
  volume();
  expect(camera!.captureStill).toHaveBeenCalledTimes(1);
  expect(tree!.root.findByProps({accessibilityLabel: '取消倒计时'})).toBeTruthy();
  volume();
  act(() => { jest.advanceTimersByTime(3000); });
  expect(camera!.captureStill).toHaveBeenCalledTimes(1);

  press(tree!, '定时 2 秒');
  volume();
  act(() => { jest.advanceTimersByTime(2100); });
  expect(camera!.captureStill).toHaveBeenCalledTimes(2);
});

it('swaps near and far drives without renaming the buttons', async () => {
  resetPreferences();
  mockPreferences.reverseFocus = true;
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<CameraWorkspace {...props} state={{...state, transport: 'usb', demo: false}} preview="data:image/jpeg;base64,frame"/>); });
  mounted = tree!;
  await settle();
  press(tree!, '对焦');
  expect(tree!.root.findByProps({accessibilityLabel: '近对焦'}).findAll(node => node.props.children === '近').length).toBeGreaterThan(0);
  expect(tree!.root.findByProps({accessibilityLabel: '远对焦'}).findAll(node => node.props.children === '远').length).toBeGreaterThan(0);
  press(tree!, '近对焦');
  press(tree!, '远对焦');
  press(tree!, '中央自动对焦');
  expect(jest.mocked(camera!.focus).mock.calls).toEqual([[-1], [1], [0]]);
  mockPreferences.reverseFocus = false;
  await act(async () => { await savePreference('reverseFocus', false); await Promise.resolve(); await Promise.resolve(); });
  press(tree!, '近对焦');
  press(tree!, '远对焦');
  expect(jest.mocked(camera!.focus).mock.calls).toEqual([[-1], [1], [0], [1], [-1]]);
});

it('skips the shutter vibration when that switch is off and still flashes', async () => {
  resetPreferences();
  mockPreferences.shutterVibration = false;
  jest.mocked(camera!.capture).mockClear();
  jest.mocked(camera!.captureStill).mockClear();
  const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
  vibrate.mockClear();
  const timing = jest.spyOn(Animated, 'timing');
  timing.mockClear();
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<CameraWorkspace {...props}/>); });
  mounted = tree!;
  await settle();
  press(tree!, '拍摄照片');
  expect(vibrate).not.toHaveBeenCalled();
  expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({toValue: 0, duration: 140, useNativeDriver: true}));
  expect(camera!.captureStill).toHaveBeenCalledTimes(1);
  volume();
  expect(vibrate).not.toHaveBeenCalled();
  expect(camera!.captureStill).toHaveBeenCalledTimes(2);

  mockPreferences.shutterVibration = true;
  await act(async () => { await savePreference('shutterVibration', true); await Promise.resolve(); await Promise.resolve(); });
  vibrate.mockClear();
  volume();
  expect(vibrate).toHaveBeenCalledWith(20);
  expect(vibrate).toHaveBeenCalledTimes(1);
  vibrate.mockRestore();
});

it('tells native whether the capture screen is showing', async () => {
  resetPreferences();
  jest.useFakeTimers();
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<App/>); });
  mounted = tree!;
  await settle();
  expect(camera!.setCaptureScreen).toHaveBeenCalledWith(true);
  expect(volumeHandlers().get(VOLUME_SHUTTER_EVENT)).toEqual(expect.any(Function));
  press(tree!, '设置');
  expect(camera!.setCaptureScreen).toHaveBeenLastCalledWith(false);
  expect(volumeHandlers().has(VOLUME_SHUTTER_EVENT)).toBe(false);
  press(tree!, '返回拍摄');
  expect(camera!.setCaptureScreen).toHaveBeenLastCalledWith(true);
  expect(volumeHandlers().has(VOLUME_SHUTTER_EVENT)).toBe(true);
  press(tree!, '打开相册');
  expect(camera!.setCaptureScreen).toHaveBeenLastCalledWith(false);
  press(tree!, '返回拍照页面');
  expect(camera!.setCaptureScreen).toHaveBeenLastCalledWith(true);
});

it('leaves the volume keys alone while the intro or the connection sheet covers capture', async () => {
  resetPreferences();
  mockPreferences.onboardingSeen = false;
  jest.mocked(camera!.captureStill).mockClear();
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<App/>); });
  mounted = tree!;
  await settle();
  expect(tree!.root.findByProps({testID: 'onboarding'})).toBeTruthy();
  expect(camera!.setCaptureScreen).toHaveBeenLastCalledWith(false);
  expect(volumeHandlers().has(VOLUME_SHUTTER_EVENT)).toBe(false);
  await act(async () => tree!.root.findByProps({testID: 'onboarding-skip'}).props.onPress());
  expect(camera!.setCaptureScreen).toHaveBeenLastCalledWith(true);
  expect(volumeHandlers().has(VOLUME_SHUTTER_EVENT)).toBe(true);

  press(tree!, '相机连接');
  expect(camera!.setCaptureScreen).toHaveBeenLastCalledWith(false);
  expect(volumeHandlers().has(VOLUME_SHUTTER_EVENT)).toBe(false);
  expect(camera!.captureStill).not.toHaveBeenCalled();
  press(tree!, '关闭');
  expect(camera!.setCaptureScreen).toHaveBeenLastCalledWith(true);
  expect(volumeHandlers().has(VOLUME_SHUTTER_EVENT)).toBe(true);
  mockPreferences.onboardingSeen = true;
});

it('names the LUT on a photo taken with the volume key', async () => {
  resetPreferences();
  const idle = {active: false, busy: false, ready: false, demo: false, lut: null};
  jest.mocked(camera!.capture).mockClear();
  jest.mocked(camera!.captureStill).mockClear();
  jest.mocked(camera!.getState).mockResolvedValue({active: true, busy: false, ready: true, demo: true, lut: 'Classic Chrome'});
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<App/>); });
  mounted = tree!;
  await settle();
  volume();
  expect(camera!.captureStill).toHaveBeenCalledTimes(1);
  expect(camera!.capture).not.toHaveBeenCalled();
  await act(async () => volumeHandlers().get('cameraStatus')!({message: '照片已保存 · Classic Chrome', ready: true}));
  expect(JSON.stringify(tree!.toJSON())).toContain('照片已保存 · Classic Chrome');
  jest.mocked(camera!.getState).mockResolvedValue(idle);
});

it('does not paint a shadow on the new settings rows', async () => {
  resetPreferences();
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<SettingsHarness/>); });
  await act(async () => { await Promise.resolve(); });
  const row = switched(tree!, '快门震动');
  const style = StyleSheet.flatten(row.props.style({pressed: false}));
  expect(style.minHeight).toBeGreaterThanOrEqual(48);
  expect(style.elevation).toBeUndefined();
  act(() => tree!.unmount());
});
