import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {expect, it, jest} from '@jest/globals';
jest.mock('react-native-document-picker', () => ({types: {allFiles: '*/*'}, pickSingle: jest.fn(), isCancel: () => false}));
jest.mock('react-native-safe-area-context', () => {
  const React = require('react'); const Context = React.createContext({top: 0, right: 0, bottom: 0, left: 0});
  return {SafeAreaProvider: ({children}: any) => React.createElement(Context.Provider, {value: {top: 0, right: 0, bottom: 0, left: 0}}, children), SafeAreaView: ({children}: any) => children, SafeAreaInsetsContext: Context, useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0})};
});
jest.mock('../src/native', () => {
  const listeners = new Map();
  return {camera: {listLuts: async () => [], listMoments: async () => [], getState: async () => ({active: true, busy: false, ready: false, demo: false, lut: null}), diagnostics: async () => '10 已准备快门前照片索引\n11 序列号 SN-SHOULD-NOT-SHOW\n12 进入演示'},
    cameraEvents: {listeners, addListener: (name: string, listener: Function) => {listeners.set(name, listener); return {remove: () => listeners.delete(name)};}}};
});

import App from '../App';
import {cameraEvents} from '../src/native';
import CameraWorkspace from '../src/CameraWorkspace';
import MotionAlbum from '../src/MotionAlbum';

it('shows native capture errors and removes all camera listeners on unmount', async () => {
  jest.useFakeTimers();
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<App/>); });
  const listeners: Map<string, Function> = (cameraEvents as any).listeners;
  expect(listeners.size).toBe(6);
  act(() => listeners.get('phoneBattery')!({percent: 37, charging: true}));
  expect(tree!.root.findByType(CameraWorkspace).props.state.phoneBattery).toEqual({percent: 37, charging: true});
  act(() => listeners.get('cameraExposure')!({value: 'ISO AUTO     f/4.0     1/80', exposureAgeMs: 50}));
  expect(tree!.root.findByType(CameraWorkspace).props.state.exposure).toBe('ISO AUTO     f/4.0     1/80');
  await act(async () => listeners.get('cameraStatus')!({message: '未找到本次 JPEG', ready: false}));
  expect(JSON.stringify(tree!.toJSON())).toContain('未找到本次 JPEG');
  act(() => listeners.get('cameraSaved')!({directory: '/data/moments/M9'}));
  act(() => listeners.get('cameraStatus')!({message: '实况已保存', ready: false}));
  expect(JSON.stringify(tree!.toJSON())).toContain('已保存');
  await act(async () => tree!.root.findByProps({accessibilityLabel: '查看'}).props.onPress());
  expect(tree!.root.findByType(MotionAlbum).props.initialMomentId).toBe('M9');
  act(() => tree!.unmount()); expect(listeners.size).toBe(0);
  jest.clearAllTimers(); jest.useRealTimers();
});

it('opens connection diagnostics from a failed capture without asking the user to hunt for it', async () => {
  jest.useFakeTimers();
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<App/>); });
  const listeners: Map<string, Function> = (cameraEvents as any).listeners;
  await act(async () => listeners.get('cameraFailed')!({error: '传错照片'}));
  const openDiagnostics = () => tree!.root.findByProps({accessibilityLabel: '查看诊断'});
  expect(JSON.stringify(tree!.toJSON())).toContain('照片处理失败：传错照片');
  expect(openDiagnostics().props.accessibilityLabel).toBe('查看诊断');
  expect(JSON.stringify(tree!.toJSON())).not.toContain('请检查连接诊断');
  await act(async () => openDiagnostics().props.onPress());
  const log = tree!.root.findByProps({testID: 'diagnostics-log'}).props.children;
  expect(log).toContain('已准备快门前照片索引');
  expect(log.indexOf('已准备快门前照片索引')).toBeLessThan(log.indexOf('进入演示'));
  expect(log).not.toContain('序列号');
  expect(log).not.toContain('SN-SHOULD-NOT-SHOW');
  await act(async () => listeners.get('cameraFailed')!({}));
  expect(JSON.stringify(tree!.toJSON())).toContain('照片处理失败');
  expect(JSON.stringify(tree!.toJSON())).not.toContain('传错照片');
  expect(openDiagnostics().props.accessibilityLabel).toBe('查看诊断');
  act(() => tree!.unmount());
  jest.clearAllTimers();
  jest.useRealTimers();
});

it('shows photographer copy for bridge failures and keeps the raw text out of the notice', async () => {
  jest.useFakeTimers();
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<App/>); });
  const listeners: Map<string, Function> = (cameraEvents as any).listeners;
  await act(async () => listeners.get('cameraStatus')!({message: 'PTP 指令 0x9404，响应 0x2019（机身忙）', ready: false}));
  expect(JSON.stringify(tree!.toJSON())).toContain('相机正忙，请稍后再按快门');
  expect(JSON.stringify(tree!.toJSON())).not.toContain('0x2019');
  await act(async () => listeners.get('cameraStatus')!({message: 'USB 已拔出 · 照片保留在机身或本机', ready: false}));
  expect(JSON.stringify(tree!.toJSON())).toContain('相机已断开，请检查数据线');
  expect(JSON.stringify(tree!.toJSON())).not.toContain('USB 已拔出');
  await act(async () => listeners.get('cameraFailed')!({error: '机身未在时限内确认 Wi-Fi 连接；已取消请求'}));
  const json = JSON.stringify(tree!.toJSON());
  expect(json).toContain('相机没有确认连接，请在相机上点允许');
  expect(json).not.toContain('照片处理失败');
  expect(json).not.toContain('机身未在时限内确认');
  act(() => tree!.unmount());
  jest.clearAllTimers();
  jest.useRealTimers();
});

it('continues receiving previews when the wall clock moves backwards', async () => {
  jest.useFakeTimers();
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<App/>); });
  const frame = (cameraEvents as any).listeners.get('cameraFrame');
  act(() => frame({jpegBase64: 'first', bufferedUs: 3_000_000, ready: true}));
  expect(tree!.root.findByType(CameraWorkspace).props.preview).toBe('data:image/jpeg;base64,first');
  jest.setSystemTime(Date.now() - 3600_000); act(() => jest.advanceTimersByTime(66));
  act(() => frame({jpegBase64: 'second', bufferedUs: 3_000_000, ready: true}));
  expect(tree!.root.findByType(CameraWorkspace).props.preview).toBe('data:image/jpeg;base64,second');
  act(() => tree!.unmount()); jest.clearAllTimers(); jest.useRealTimers();
});
