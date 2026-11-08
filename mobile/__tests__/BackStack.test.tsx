import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {afterEach, expect, it, jest} from '@jest/globals';
import {AppState, BackHandler} from 'react-native';

jest.mock('react-native-document-picker', () => ({types: {allFiles: '*/*'}, pickSingle: jest.fn(), isCancel: () => false}));
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const Context = React.createContext({top: 0, right: 0, bottom: 0, left: 0});
  return {SafeAreaProvider: ({children}: any) => React.createElement(Context.Provider, {value: {top: 0, right: 0, bottom: 0, left: 0}}, children), SafeAreaView: ({children}: any) => children, SafeAreaInsetsContext: Context, useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0})};
});
jest.mock('../src/native', () => {
  const {NativeModules: modules} = require('react-native');
  const listeners = new Map<string, Function>();
  const shot = {active: true, busy: false, ready: true, demo: true, lut: null};
  const photo = {id: 'M1', source: 'DEMO.JPG', createdAt: 1_700_000_000_000, complete: true, captureMode: 'photo', imageUri: 'content://moment/image', demo: true};
  modules.MomentLumix = {
    setScopesEnabled: jest.fn(),
    setCaptureScreen: jest.fn(),
    listLuts: async () => [],
    listMoments: async () => [photo],
    getState: jest.fn(async () => ({...shot})),
    getPreferences: async () => ({autoExport: false, syncBodyPhotos: true, rememberCapture: false, onboardingSeen: true, volumeShutter: true, reverseFocus: false, shutterVibration: true, capture: {motion: false, grid: true, guide: 'off', timerSeconds: 0}}),
    diagnostics: async () => '',
    demo: jest.fn(),
    disconnect: jest.fn(),
    capture: jest.fn(),
    captureStill: jest.fn(),
    shot,
  };
  return {camera: modules.MomentLumix, cameraEvents: {listeners, addListener: (name: string, listener: Function) => { listeners.set(name, listener); return {remove: () => { if (listeners.get(name) === listener) listeners.delete(name); }}; }}};
});

import App from '../App';
import {camera, cameraEvents} from '../src/native';

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
const shown = (tree: renderer.ReactTestRenderer, testID: string) => tree.root.findAllByProps({testID}).length > 0;
const exitText = '再按一次退出，相机会断开';

afterEach(() => {
  if (mounted) act(() => mounted!.unmount());
  mounted = undefined;
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

async function settle() {
  for (let step = 0; step < 6; step += 1) await act(async () => { await Promise.resolve(); });
}

/** A capture-state change must not put the mounted camera handler back in front of the visible page. */
async function nudgeCapture() {
  const shot = (camera as unknown as {shot: {active: boolean}}).shot;
  const listeners = (cameraEvents as unknown as {listeners: Map<string, Function>}).listeners;
  shot.active = false;
  await act(async () => listeners.get('cameraStatus')!({message: '', ready: false}));
  await settle();
  shot.active = true;
  await act(async () => listeners.get('cameraStatus')!({message: '', ready: true}));
  await settle();
}

it('walks back from the viewer to the album, the settings list, and the exit prompt', async () => {
  jest.useFakeTimers();
  AppState.currentState = 'active';
  backHandlers.length = 0;
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    const wrapped = handler as () => boolean | null | undefined;
    backHandlers.push(wrapped);
    return {remove: () => { const index = backHandlers.lastIndexOf(wrapped); if (index >= 0) backHandlers.splice(index, 1); }};
  });
  jest.spyOn(BackHandler, 'exitApp').mockImplementation(() => undefined);
  let tree!: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<App/>); });
  mounted = tree;
  await settle();

  press(tree, 'LUT 风格');
  expect(shown(tree, 'lut-flyout')).toBe(true);
  pressBack();
  expect(shown(tree, 'lut-flyout')).toBe(false);
  expect(JSON.stringify(tree.toJSON())).not.toContain(exitText);
  expect(BackHandler.exitApp).not.toHaveBeenCalled();
  pressBack();
  expect(JSON.stringify(tree.toJSON())).toContain(exitText);
  expect(BackHandler.exitApp).not.toHaveBeenCalled();
  expect(camera!.disconnect).not.toHaveBeenCalled();

  press(tree, '打开相册');
  await settle();
  act(() => tree.root.findByProps({testID: 'album-cell-M1'}).props.onPress());
  expect(shown(tree, 'motion-viewer')).toBe(true);
  await nudgeCapture();
  pressBack();
  expect(shown(tree, 'motion-viewer')).toBe(false);
  expect(shown(tree, 'album-grid')).toBe(true);
  expect(JSON.stringify(tree.toJSON())).not.toContain(exitText);
  expect(BackHandler.exitApp).not.toHaveBeenCalled();
  pressBack();
  expect(shown(tree, 'album-grid')).toBe(false);
  expect(shown(tree, 'camera-workspace')).toBe(true);
  expect(BackHandler.exitApp).not.toHaveBeenCalled();

  press(tree, '设置');
  expect(shown(tree, 'settings-screen')).toBe(true);
  press(tree, '打开关于');
  expect(shown(tree, 'about-screen')).toBe(true);
  expect(shown(tree, 'settings-screen')).toBe(false);
  await nudgeCapture();
  pressBack();
  expect(shown(tree, 'about-screen')).toBe(false);
  expect(shown(tree, 'settings-screen')).toBe(true);
  expect(JSON.stringify(tree.toJSON())).not.toContain(exitText);
  expect(BackHandler.exitApp).not.toHaveBeenCalled();
  pressBack();
  expect(shown(tree, 'settings-screen')).toBe(false);
  expect(shown(tree, 'camera-workspace')).toBe(true);
  expect(BackHandler.exitApp).not.toHaveBeenCalled();
});
