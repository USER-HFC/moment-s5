import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {afterEach, expect, it, jest} from '@jest/globals';
import {AppState, BackHandler, Modal, NativeModules} from 'react-native';

jest.mock('react-native-document-picker', () => ({types: {allFiles: '*/*'}, pickSingle: jest.fn(), isCancel: () => false}));
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const Context = React.createContext({top: 0, right: 0, bottom: 0, left: 0});
  return {SafeAreaProvider: ({children}: any) => React.createElement(Context.Provider, {value: {top: 0, right: 0, bottom: 0, left: 0}}, children), SafeAreaView: ({children}: any) => children, SafeAreaInsetsContext: Context, useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0})};
});
jest.mock('../src/native', () => {
  const {NativeModules: modules} = require('react-native');
  const listeners = new Map<string, Function>();
  modules.MomentLumix = {
    setScopesEnabled: jest.fn(),
    listLuts: async () => [],
    listMoments: async () => [],
    getState: async () => ({active: true, busy: false, ready: true, demo: true, lut: null}),
    diagnostics: async () => '',
    demo: jest.fn(),
    disconnect: jest.fn(),
  };
  return {camera: modules.MomentLumix, cameraEvents: {listeners, addListener: (name: string, listener: Function) => { listeners.set(name, listener); return {remove: () => listeners.delete(name)}; }}};
});

import App from '../App';
import {cameraEvents} from '../src/native';
import {changeScopePanel} from '../src/scopes/useScopes';

const backHandlers: Array<() => boolean | null | undefined> = [];
let mounted: renderer.ReactTestRenderer | undefined;
const pressBack = () => act(() => {
  const chain = [...backHandlers].reverse();
  let handled = false;
  for (const handler of chain) if (handler()) { handled = true; break; }
  if (!handled) BackHandler.exitApp();
});
const press = (tree: renderer.ReactTestRenderer, label: string) => act(() => {
  const nodes = tree.root.findAllByProps({accessibilityLabel: label});
  const target = nodes.find(node => typeof node.props.style === 'function') || nodes[0];
  target.props.onPress();
});

afterEach(() => {
  if (mounted) act(() => mounted!.unmount());
  mounted = undefined;
  act(() => changeScopePanel({type: 'closeAll'}));
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

it('keeps motion, timer, guide, grid, scopes and the live view when leaving the capture screen', async () => {
  jest.useFakeTimers();
  AppState.currentState = 'active';
  backHandlers.length = 0;
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    const wrapped = handler as () => boolean | null | undefined;
    backHandlers.push(wrapped);
    return {remove: () => { const index = backHandlers.lastIndexOf(wrapped); if (index >= 0) backHandlers.splice(index, 1); }};
  });
  jest.spyOn(BackHandler, 'exitApp').mockImplementation(() => undefined);
  changeScopePanel({type: 'closeAll'});
  const api = NativeModules.MomentLumix;
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<App/>); });
  mounted = tree;
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
  const frame = (cameraEvents as unknown as {listeners: Map<string, Function>}).listeners.get('cameraFrame')!;
  act(() => frame({jpegBase64: 'frame', bufferedUs: 3_000_000, ready: true, demo: true}));
  act(() => tree.root.findByProps({testID: 'viewfinder'}).props.onLayout({nativeEvent: {layout: {width: 360, height: 540, x: 0, y: 0}}}));
  press(tree, '动态照片');
  press(tree, '定时 关');
  press(tree, '定时 5 秒');
  press(tree, '构图参考 关');
  press(tree, '构图网格');
  press(tree, '示波器');
  press(tree, '亮度波形');
  press(tree, '完成示波器');
  const viewfinder = tree.root.findByProps({accessibilityLabel: '相机实时取景'});
  expect(tree.root.findByProps({testID: 'scope-panel-waveform'})).toBeTruthy();
  expect(api.setScopesEnabled).toHaveBeenLastCalledWith(true, true, 1.5);
  const subscriptions = api.setScopesEnabled.mock.calls.length;

  press(tree, '打开相册');
  const layer = () => tree.root.findByProps({testID: 'camera-layer'});
  expect(layer().props.accessibilityElementsHidden).toBe(true);
  expect(layer().props.importantForAccessibility).toBe('no-hide-descendants');
  expect(layer().props.pointerEvents).toBe('none');
  expect(tree.root.findByProps({accessibilityLabel: '相机实时取景'})).toBe(viewfinder);
  expect(api.setScopesEnabled.mock.calls).toHaveLength(subscriptions);
  press(tree, '返回拍照页面');
  expect(layer().props.accessibilityElementsHidden).toBe(false);
  expect(layer().props.pointerEvents).toBe('auto');
  expect(tree.root.findByProps({accessibilityLabel: '动态照片'}).props.accessibilityState.checked).toBe(true);
  expect(tree.root.findByProps({accessibilityLabel: '定时 5 秒'})).toBeTruthy();
  expect(tree.root.findByProps({testID: 'reference-frame'}).props.accessibilityLabel).toBe('构图参考 16:9');
  expect(tree.root.findAllByProps({accessibilityLabel: '构图参考 16:9'}).some(node => typeof node.props.onPress === 'function')).toBe(true);
  const grid = tree.root.findAllByProps({accessibilityLabel: '构图网格'}).find(node => typeof node.props.style === 'function')!;
  expect(grid.props.accessibilityState.checked).toBe(false);
  expect(tree.root.findByProps({testID: 'scope-panel-waveform'})).toBeTruthy();
  expect(tree.root.findByProps({accessibilityLabel: '相机实时取景'})).toBe(viewfinder);
  expect(api.setScopesEnabled.mock.calls).toHaveLength(subscriptions);

  press(tree, '设置');
  press(tree, '返回拍摄');
  expect(tree.root.findByProps({accessibilityLabel: '动态照片'}).props.accessibilityState.checked).toBe(true);
  expect(tree.root.findByProps({testID: 'reference-frame'}).props.accessibilityLabel).toBe('构图参考 16:9');
  expect(tree.root.findByProps({testID: 'scope-panel-waveform'})).toBeTruthy();
  expect(api.setScopesEnabled.mock.calls).toHaveLength(subscriptions);

  press(tree, '相机连接');
  expect(tree.root.findAllByType(Modal).some(node => node.props.visible)).toBe(true);
  pressBack();
  expect(tree.root.findAllByType(Modal).some(node => node.props.visible)).toBe(false);
  expect(BackHandler.exitApp).not.toHaveBeenCalled();
  expect(api.disconnect).not.toHaveBeenCalled();
});
