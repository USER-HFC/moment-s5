import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {expect, it, jest} from '@jest/globals';

jest.mock('react-native-document-picker', () => ({types: {allFiles: '*/*'}, pickSingle: jest.fn(), isCancel: () => false}));
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const Context = React.createContext({top: 0, right: 0, bottom: 0, left: 0});
  return {SafeAreaProvider: ({children}: any) => React.createElement(Context.Provider, {value: {top: 0, right: 0, bottom: 0, left: 0}}, children), SafeAreaView: ({children}: any) => children, SafeAreaInsetsContext: Context, useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0})};
});

const mockState = {
  autoExport: true,
  onboardingSeen: false,
  listeners: new Map<string, Function>(),
};

jest.mock('../src/native', () => ({
  camera: {
    listLuts: async () => [], listMoments: async () => [],
    getState: async () => ({active: false, busy: false, ready: false, demo: false, lut: null}),
    getPreferences: jest.fn(async () => ({
      autoExport: mockState.autoExport, syncBodyPhotos: true, rememberCapture: false, onboardingSeen: mockState.onboardingSeen,
      capture: {motion: false, grid: true, guide: 'off', timerSeconds: 0},
    })),
    setPreference: jest.fn(async () => {}),
    exportMoment: jest.fn(async () => 'content://photo'),
    diagnostics: async () => '',
  },
  cameraEvents: {addListener: (name: string, listener: Function) => { mockState.listeners.set(name, listener); return {remove: () => mockState.listeners.delete(name)}; }},
}));

import App from '../App';
import {camera} from '../src/native';

it('shows the intro once, then exports a saved photo and reports a failure', async () => {
  jest.useFakeTimers();
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<App/>); });
  await act(async () => { await Promise.resolve(); });
  expect(tree!.root.findByProps({testID: 'onboarding-card-1'})).toBeTruthy();
  await act(async () => tree!.root.findByProps({testID: 'onboarding-skip'}).props.onPress());
  expect(camera!.setPreference).toHaveBeenCalledWith('onboardingSeen', true);
  expect(tree!.root.findAllByProps({testID: 'onboarding'})).toHaveLength(0);
  (camera!.exportMoment as jest.Mock).mockImplementationOnce(async () => { throw new Error('系统相册创建失败'); });
  await act(async () => mockState.listeners.get('cameraSaved')!({directory: '/data/moments/M3'}));
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  expect(camera!.exportMoment).toHaveBeenCalledWith('M3');
  expect(JSON.stringify(tree!.toJSON())).toContain('自动导出失败：系统相册创建失败');
  mockState.autoExport = false;
  (camera!.exportMoment as jest.Mock).mockClear();
  await act(async () => mockState.listeners.get('cameraSaved')!({directory: '/data/moments/M4'}));
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  expect(camera!.exportMoment).not.toHaveBeenCalled();
  act(() => tree!.unmount());
  jest.clearAllTimers();
  jest.useRealTimers();
  mockState.autoExport = true;
  mockState.onboardingSeen = false;
});
