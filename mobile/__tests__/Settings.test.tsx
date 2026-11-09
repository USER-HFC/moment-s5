import '../jest/androidPlatform';
import React, {useState} from 'react';
import renderer, {act} from 'react-test-renderer';
import {Clipboard, Linking, StyleSheet} from 'react-native';
import {expect, it, jest} from '@jest/globals';
import {buildInfoFromModule, buildInfoText, formatBuiltAt, minAndroidLabel, BuildInfo} from '../src/buildInfo';

jest.mock('react-native-document-picker', () => ({types: {allFiles: '*/*'}, pickSingle: jest.fn(), isCancel: () => false}));
jest.mock('react-native-safe-area-context', () => {
  const React = require('react'); const Context = React.createContext({top: 0, right: 0, bottom: 0, left: 0});
  return {SafeAreaProvider: ({children}: any) => React.createElement(Context.Provider, {value: {top: 0, right: 0, bottom: 0, left: 0}}, children), SafeAreaView: ({children}: any) => children, SafeAreaInsetsContext: Context, useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0})};
});

import App from '../App';
import SettingsScreen, {SettingsPage} from '../src/SettingsScreen';

function SettingsHarness({build, onBack = () => {}}: {build: BuildInfo; onBack?: () => void}) {
  const [page, setPage] = useState<SettingsPage>('list');
  return <SettingsScreen build={build} page={page} onPageChange={setPage} onBack={onBack} onNotice={() => {}}/>;
}

const shown = (tree: renderer.ReactTestRenderer, testID: string) =>
  tree.root.findAllByProps({testID}).map(node => node.props.children).find(value => typeof value === 'string');
const textOf = (tree: renderer.ReactTestRenderer, testID: string) => {
  const children = tree.root.findByProps({testID}).props.children;
  return Array.isArray(children) ? children.flat().join('') : String(children);
};
const build: BuildInfo = {
  versionName: '0.8.0-beta.3', versionCode: '24', builtAt: '2026-10-25T08:19:25Z', git: 'c65b098a9dba',
  buildType: 'release', abi: 'arm64-v8a', minSdk: '33',
};

it('keeps blank build constants visible as unknown', () => {
  expect(buildInfoFromModule(undefined).git).toBe('未知');
  expect(buildInfoFromModule({buildInfo: {versionName: '  ', git: 'abc1234', minSdk: '33'}}).versionName).toBe('未知');
  expect(buildInfoFromModule({buildInfo: {git: 'abc1234'}}).git).toBe('abc1234');
  expect(minAndroidLabel('33')).toBe('Android 13（API 33）');
  expect(minAndroidLabel('未知')).toBe('未知');
  expect(formatBuiltAt('2026-10-25T08:19:25Z')).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  expect(formatBuiltAt('未知')).toBe('未知');
  expect(formatBuiltAt('not-a-date')).toBe('not-a-date');
});

it('opens About from the settings list and returns through both levels', async () => {
  jest.useFakeTimers();
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<App/>); });
  const settings = tree!.root.findAllByProps({testID: 'settings-button'}).find(node => typeof node.props.onPress === 'function' && node.props.hitSlop !== undefined)!;
  // A 36 dp circle with hitSlop still gives a 44 dp target.
  const size = StyleSheet.flatten(settings.props.style).width;
  expect(size + settings.props.hitSlop * 2).toBeGreaterThanOrEqual(44);
  act(() => settings.props.onPress());
  expect(tree!.root.findByProps({testID: 'settings-screen'})).toBeTruthy();
  expect(tree!.root.findByProps({testID: 'settings-about'})).toBeTruthy();
  expect(tree!.root.findByProps({testID: 'settings-diagnostics'})).toBeTruthy();
  expect(tree!.root.findAllByProps({testID: 'about-screen'})).toHaveLength(0);
  act(() => tree!.root.findByProps({testID: 'settings-about'}).props.onPress());
  expect(tree!.root.findByProps({testID: 'about-screen'})).toBeTruthy();
  expect(shown(tree!, 'about-project')).toBe('瞬间 Lumix');
  expect(JSON.stringify(tree!.toJSON())).toContain('动态照片');
  expect(JSON.stringify(tree!.toJSON())).not.toContain('实况');
  expect(shown(tree!, 'about-author')).toBe('USER-HFC 及贡献者');
  expect(textOf(tree!, 'about-version')).toBe('未知（未知）');
  expect(JSON.stringify(tree!.toJSON())).not.toContain('https://github.com');
  expect(JSON.stringify(tree!.toJSON())).toContain('尚未在真实相机上逐一验证');
  expect(shown(tree!, 'about-git')).toBe('未知');
  await act(async () => tree!.root.findByProps({accessibilityLabel: '打开项目主页 GitHub'}).props.onPress());
  expect(openURL).toHaveBeenCalledWith('https://github.com/USER-HFC/moment-s5');
  await act(async () => tree!.root.findByProps({accessibilityLabel: '查看第三方声明 NOTICE'}).props.onPress());
  expect(openURL).toHaveBeenCalledWith('https://github.com/USER-HFC/moment-s5/blob/main/NOTICE.md');
  act(() => tree!.root.findByProps({accessibilityLabel: '返回设置'}).props.onPress());
  expect(tree!.root.findByProps({testID: 'settings-screen'})).toBeTruthy();
  expect(tree!.root.findAllByProps({testID: 'about-screen'})).toHaveLength(0);
  act(() => tree!.root.findByProps({accessibilityLabel: '返回拍摄'}).props.onPress());
  expect(tree!.root.findByProps({testID: 'camera-workspace'})).toBeTruthy();
  expect(tree!.root.findByProps({accessibilityLabel: '拍摄照片'})).toBeTruthy();
  act(() => tree!.unmount());
  jest.clearAllTimers();
  jest.useRealTimers();
});

it('copies all build fields as one readable report', async () => {
  jest.useFakeTimers();
  const setString = jest.spyOn(Clipboard, 'setString').mockImplementation(() => {});
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<SettingsHarness build={build}/>); });
  act(() => tree!.root.findByProps({testID: 'settings-about'}).props.onPress());
  expect(textOf(tree!, 'about-version')).toBe('0.8.0-beta.3（24）');
  expect(shown(tree!, 'about-author')).toBe('USER-HFC 及贡献者');
  expect(shown(tree!, 'about-license')).toBe('MIT');
  const alignsRight = (id: string) => tree!.root.findAllByProps({testID: id}).some(node => StyleSheet.flatten(node.props.style)?.textAlign === 'right');
  for (const id of ['about-author', 'about-license', 'about-version-name', 'about-git', 'about-min-sdk']) expect(alignsRight(id)).toBe(true);
  const pushedRight = (id: string) => tree!.root.findAllByProps({testID: id}).some(node => StyleSheet.flatten(node.parent?.props.style)?.justifyContent === 'space-between');
  expect(pushedRight('about-author')).toBe(true);
  expect(pushedRight('about-license')).toBe(true);
  expect(pushedRight('about-git')).toBe(true);
  expect(shown(tree!, 'about-built-at')).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
  expect(shown(tree!, 'about-git')).toBe('c65b098a9dba');
  act(() => tree!.root.findByProps({accessibilityLabel: '复制版本信息'}).props.onPress());
  const copied = setString.mock.calls[0][0];
  expect(copied).toContain('瞬间 Lumix 0.8.0-beta.3（24）');
  expect(copied).toContain('提交：c65b098a9dba');
  expect(copied).toContain('构建类型：release');
  expect(copied).toContain('ABI：arm64-v8a');
  expect(copied).toContain('最低 Android 版本：Android 13（API 33）');
  expect(copied).toBe(buildInfoText(build));
  expect(tree!.root.findAllByProps({accessibilityLabel: '版本信息已复制'}).length).toBeGreaterThan(0);
  act(() => jest.advanceTimersByTime(5000));
  expect(tree!.root.findAllByProps({accessibilityLabel: '复制版本信息'}).length).toBeGreaterThan(0);
  act(() => tree!.unmount());
  jest.clearAllTimers();
  jest.useRealTimers();
});
