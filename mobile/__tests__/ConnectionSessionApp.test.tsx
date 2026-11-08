import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {afterEach, expect, it, jest} from '@jest/globals';

jest.mock('react-native-document-picker', () => ({types: {allFiles: '*/*'}, pickSingle: jest.fn(), isCancel: () => false}));
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const Context = React.createContext({top: 0, right: 0, bottom: 0, left: 0});
  return {SafeAreaProvider: ({children}: any) => React.createElement(Context.Provider, {value: {top: 0, right: 0, bottom: 0, left: 0}}, children), SafeAreaView: ({children}: any) => children, SafeAreaInsetsContext: Context, useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0})};
});
jest.mock('../src/native', () => {
  const listeners = new Map<string, Function>();
  const snapshot = {active: true, busy: false, ready: true, demo: false, lut: null, transport: 'wifi'};
  const preferences = {
    autoExport: false, syncBodyPhotos: true, rememberCapture: false, onboardingSeen: true,
    volumeShutter: true, reverseFocus: false, shutterVibration: true,
    capture: {motion: false, grid: true, guide: 'off', timerSeconds: 0},
    connection: {method: 'wifi', cameraIp: '10.0.0.8'},
  };
  return {
    snapshot, preferences,
    camera: {
      snapshot, preferences,
      listLuts: async () => [], listMoments: async () => [], getState: jest.fn(async () => ({...snapshot})),
      getPreferences: jest.fn(async () => preferences), setConnectionMemory: jest.fn(async () => {}),
      setCaptureScreen: jest.fn(), diagnostics: async () => '', connect: jest.fn(async () => {}),
      connectWifi: jest.fn(async () => {}), demo: jest.fn(), disconnect: jest.fn(),
      capture: jest.fn(), captureStill: jest.fn(), focus: jest.fn(), setAudio: jest.fn(),
    },
    cameraEvents: {listeners, addListener: (name: string, listener: Function) => {listeners.set(name, listener); return {remove: () => {if (listeners.get(name) === listener) listeners.delete(name);}};}},
  };
});

import App from '../App';
import {camera, cameraEvents} from '../src/native';
import {USB_CAMERA_ATTACHED_EVENT} from '../src/volumeShutter';
import {USER_DISCONNECT_STATUS} from '../src/connection/sessionNotice';

let mounted: renderer.ReactTestRenderer | undefined;
afterEach(() => {
  const snapshot = (camera as unknown as {snapshot: {active: boolean; transport: string}}).snapshot;
  snapshot.active = true;
  snapshot.transport = 'wifi';
  (camera as unknown as {preferences: {connection: {cameraIp: string}}}).preferences.connection.cameraIp = '10.0.0.8';
  if (mounted) act(() => mounted!.unmount());
  mounted = undefined;
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
  jest.clearAllMocks();
});
const listeners = () => (cameraEvents as unknown as {listeners: Map<string, Function>}).listeners;
const text = (tree: renderer.ReactTestRenderer) => JSON.stringify(tree.toJSON());
const press = (tree: renderer.ReactTestRenderer, label: string) => act(() => {
  const nodes = tree.root.findAllByProps({accessibilityLabel: label});
  (nodes.find(node => typeof node.props.onPress === 'function') || nodes.find(node => typeof node.props.style === 'function') || nodes[0]).props.onPress();
});
async function settle() {
  for (let step = 0; step < 8; step += 1) await act(async () => { await Promise.resolve(); });
}
async function mount() {
  jest.useFakeTimers();
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<App/>); });
  mounted = tree;
  await settle();
  return tree;
}


it('remembers the Wi-Fi IP only after the connection is actually up', async () => {
  const snapshot = (camera as unknown as {snapshot: {active: boolean; transport: string}}).snapshot;
  snapshot.active = false;
  snapshot.transport = 'wifi';
  (camera as unknown as {preferences: {connection: {cameraIp: string}}}).preferences.connection.cameraIp = '192.168.54.1';
  const tree = await mount();
  await act(async () => press(tree, '连接相机'));
  const field = tree.root.findAll(node => node.props?.accessibilityLabel === '相机 IP' && typeof node.props.onChangeText === 'function')[0];
  act(() => field.props.onChangeText('10.0.0.8'));
  await act(async () => press(tree, '连接 Wi-Fi 相机'));
  expect(camera!.connectWifi).toHaveBeenCalledWith({manual: true, cameraIp: '10.0.0.8'});
  expect(camera!.setConnectionMemory).not.toHaveBeenCalled();
  snapshot.active = true;
  await act(async () => listeners().get('cameraStatus')!({message: '已连接 · 正在预缓存', ready: false}));
  await settle();
  expect(camera!.setConnectionMemory).toHaveBeenCalledWith('wifi', '10.0.0.8');
});
it('shows the reconnect banner after an unexpected drop and reconnects the remembered way', async () => {
  const tree = await mount();
  await act(async () => listeners().get('cameraStatus')!({message: '相机 Wi-Fi 网络已丢失 · 请重新连接', ready: false}));
  expect(text(tree)).toContain('相机已断开');
  expect(text(tree)).toContain('重新连接');
  await act(async () => press(tree, '重新连接'));
  expect(camera!.connectWifi).toHaveBeenCalledWith({manual: true, cameraIp: '10.0.0.8'});
  expect(camera!.connect).not.toHaveBeenCalled();
});

it('keeps a user disconnect quiet', async () => {
  const tree = await mount();
  await act(async () => listeners().get('cameraStatus')!({message: USER_DISCONNECT_STATUS, ready: false}));
  expect(text(tree)).not.toContain('相机已断开');
  expect(text(tree)).not.toContain('重新连接');
});

it('offers the USB camera found while the app is open and connects only after the tap', async () => {
  const snapshot = (camera as unknown as {snapshot: {active: boolean}}).snapshot;
  snapshot.active = false;
  const tree = await mount();
  expect(camera!.connect).not.toHaveBeenCalled();
  await act(async () => listeners().get(USB_CAMERA_ATTACHED_EVENT)!({}));
  expect(text(tree)).toContain('检测到相机');
  expect(text(tree)).toContain('连接');
  expect(camera!.connect).not.toHaveBeenCalled();
  await act(async () => press(tree, '连接'));
  expect(camera!.connect).toHaveBeenCalledTimes(1);
});
