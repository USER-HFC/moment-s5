import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {expect, it, jest} from '@jest/globals';
import {Snackbar} from 'react-native-paper';

jest.mock('react-native-document-picker', () => ({types: {allFiles: '*/*'}, pickSingle: jest.fn(), isCancel: () => false}));
jest.mock('react-native-safe-area-context', () => {
  const React = require('react'); const Context = React.createContext({top: 0, right: 0, bottom: 0, left: 0});
  return {SafeAreaProvider: ({children}: any) => React.createElement(Context.Provider, {value: {top: 0, right: 0, bottom: 0, left: 0}}, children), SafeAreaView: ({children}: any) => children, SafeAreaInsetsContext: Context, useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0})};
});
jest.mock('../src/native', () => {
  const listeners = new Map();
  return {camera: {listLuts: async () => [], listMoments: async () => [], getState: async () => ({active: true, busy: false, ready: false, demo: false, lut: null})},
    cameraEvents: {listeners, addListener: (name: string, listener: Function) => {listeners.set(name, listener); return {remove: () => listeners.delete(name)};}}};
});

import App from '../App';
import {cameraEvents} from '../src/native';
import CameraWorkspace from '../src/CameraWorkspace';

it('shows native capture errors and removes all camera listeners on unmount', async () => {
  jest.useFakeTimers();
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<App/>); });
  const listeners: Map<string, Function> = (cameraEvents as any).listeners;
  expect(listeners.size).toBe(4);
  await act(async () => listeners.get('cameraStatus')!({message: '未找到本次 JPEG', ready: false}));
  expect(tree!.root.findByType(Snackbar).props.children).toBe('未找到本次 JPEG');
  act(() => tree!.unmount()); expect(listeners.size).toBe(0);
  jest.clearAllTimers(); jest.useRealTimers();
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
