import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Linking, StyleSheet} from 'react-native';
import {expect, it, jest} from '@jest/globals';
import {buildInfoFromModule, minAndroidLabel} from '../src/buildInfo';

jest.mock('react-native-document-picker', () => ({types: {allFiles: '*/*'}, pickSingle: jest.fn(), isCancel: () => false}));
jest.mock('react-native-safe-area-context', () => {
  const React = require('react'); const Context = React.createContext({top: 0, right: 0, bottom: 0, left: 0});
  return {SafeAreaProvider: ({children}: any) => React.createElement(Context.Provider, {value: {top: 0, right: 0, bottom: 0, left: 0}}, children), SafeAreaView: ({children}: any) => children, SafeAreaInsetsContext: Context, useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0})};
});

import App from '../App';

const shown = (tree: renderer.ReactTestRenderer, testID: string) =>
  tree.root.findAllByProps({testID}).map(node => node.props.children).find(value => typeof value === 'string');

it('keeps blank build constants visible as unknown', () => {
  expect(buildInfoFromModule(undefined).git).toBe('未知');
  expect(buildInfoFromModule({buildInfo: {versionName: '  ', git: 'abc1234', minSdk: '33'}}).versionName).toBe('未知');
  expect(buildInfoFromModule({buildInfo: {git: 'abc1234'}}).git).toBe('abc1234');
  expect(minAndroidLabel('33')).toBe('Android 13（API 33）');
  expect(minAndroidLabel('未知')).toBe('未知');
});

it('opens about from the capture page and returns without moving capture controls', async () => {
  jest.useFakeTimers();
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<App/>); });
  const settings = tree!.root.findAllByProps({testID: 'settings-button'}).find(node => typeof node.props.style === 'function')!;
  const style = StyleSheet.flatten(settings.props.style({pressed: false}));
  expect(style.width).toBeGreaterThanOrEqual(48);
  expect(style.height).toBeGreaterThanOrEqual(48);
  act(() => settings.props.onPress());
  const about = JSON.stringify(tree!.toJSON());
  expect(shown(tree!, 'about-project')).toBe('瞬间 Lumix / Moment');
  expect(shown(tree!, 'about-author')).toBe('USER-HFC and Moment S5 contributors');
  expect(about).toContain('https://github.com/USER-HFC/moment-s5');
  expect(about).toContain('NOTICE.md');
  expect(about).toContain('MIT');
  expect(about).toContain('尚未在真实相机上逐一验证');
  expect(shown(tree!, 'about-git')).toBe('未知');
  expect(tree!.root.findByProps({testID: 'settings-about'})).toBeTruthy();
  expect(tree!.root.findAllByProps({accessibilityLabel: '拍摄照片'})).toHaveLength(0);
  await act(async () => tree!.root.findByProps({accessibilityLabel: '打开 GitHub 仓库'}).props.onPress());
  expect(openURL).toHaveBeenCalledWith('https://github.com/USER-HFC/moment-s5');
  act(() => tree!.root.findByProps({accessibilityLabel: '返回拍摄'}).props.onPress());
  expect(tree!.root.findByProps({testID: 'camera-workspace'})).toBeTruthy();
  expect(tree!.root.findByProps({accessibilityLabel: '拍摄照片'})).toBeTruthy();
  act(() => tree!.unmount());
  jest.clearAllTimers();
  jest.useRealTimers();
});
