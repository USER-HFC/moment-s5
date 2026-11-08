import React, {useState} from 'react';
import renderer, {act} from 'react-test-renderer';
import {Linking, StyleSheet} from 'react-native';
import {ui} from '../src/theme';
import {expect, it, jest} from '@jest/globals';

jest.mock('react-native-document-picker', () => ({types: {allFiles: '*/*'}, pickSingle: jest.fn(), isCancel: () => false}));
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const Context = React.createContext({top: 0, right: 0, bottom: 0, left: 0});
  return {SafeAreaProvider: ({children}: any) => React.createElement(Context.Provider, {value: {top: 0, right: 0, bottom: 0, left: 0}}, children), SafeAreaView: ({children}: any) => children, SafeAreaInsetsContext: Context, useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0})};
});

const mockPreferences = {
  autoExport: false, syncBodyPhotos: true, rememberCapture: false, onboardingSeen: true,
  capture: {motion: false, grid: true, guide: 'off' as const, timerSeconds: 0},
};

jest.mock('../src/native', () => ({
  camera: {
    getPreferences: jest.fn(async () => mockPreferences),
    setPreference: jest.fn(async () => {}),
    storageUsage: jest.fn(async () => ({count: 2, bytes: 1536, exportedCount: 1, exportedBytes: 512})),
    clearExportedCopies: jest.fn(async () => ({removed: 1})),
    diagnostics: async () => '',
  },
  cameraEvents: null,
}));

import SettingsScreen, {SettingsPage} from '../src/SettingsScreen';
import {camera} from '../src/native';
import OnboardingCards from '../src/OnboardingCards';
import {BuildInfo} from '../src/buildInfo';

const build: BuildInfo = {versionName: '0.8.0-beta.4', versionCode: '25', builtAt: '2026-11-07T00:00:00Z', git: 'abc', buildType: 'release', abi: 'arm64-v8a', minSdk: '33'};

function Harness({onShowIntro = () => {}, onNotice = () => {}}: {onShowIntro?: () => void; onNotice?: (notice: {message: string}) => void}) {
  const [page, setPage] = useState<SettingsPage>('list');
  return <SettingsScreen build={build} page={page} onPageChange={setPage} onBack={() => {}} onNotice={onNotice} onShowIntro={onShowIntro}/>;
}

const text = (tree: renderer.ReactTestRenderer) => JSON.stringify(tree.toJSON());

it('shows the three shooting preferences and opens the guide with a feedback link', async () => {
  const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true as never);
  const onShowIntro = jest.fn();
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<Harness onShowIntro={onShowIntro}/>); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  const switched = (label: string) => tree!.root.findByProps({accessibilityLabel: label, accessibilityRole: 'switch'});
  expect(text(tree!)).toContain('2 张 · 1.5 KB');
  expect(text(tree!)).toContain('0.8.0-beta.4');
  expect(text(tree!)).not.toContain('查看占用，清理已导出的副本');
  expect(text(tree!)).not.toContain('版本、许可与构建信息');
  expect(switched('拍摄后自动导出到系统相册').props.accessibilityState.checked).toBe(false);
  expect(switched('机身快门照片自动同步').props.accessibilityState.checked).toBe(true);
  expect(switched('记住上次的拍摄设置').props.accessibilityState.checked).toBe(false);
  await act(async () => switched('拍摄后自动导出到系统相册').props.onPress());
  expect(camera!.setPreference).toHaveBeenCalledWith('autoExport', true);
  expect(switched('拍摄后自动导出到系统相册').props.accessibilityState.checked).toBe(true);
  await act(async () => switched('机身快门照片自动同步').props.onPress());
  expect(camera!.setPreference).toHaveBeenCalledWith('syncBodyPhotos', false);
  act(() => tree!.root.findByProps({testID: 'settings-guide'}).props.onPress());
  expect(text(tree!)).toContain('相机：设置 → USB → PC(Tether)');
  expect(text(tree!)).toContain('相机开启 Wi-Fi 遥控拍摄');
  expect(text(tree!)).toContain('连不上');
  expect(text(tree!)).toContain('音量键拍摄');
  expect(text(tree!)).toContain('构图参考');
  expect(text(tree!)).toContain('快门震动');
  expect(text(tree!)).toContain('反转对焦');
  expect(text(tree!)).toContain('传错照片');
  expect(text(tree!)).toContain('机身快门照片自动同步');
  expect(text(tree!)).toContain('不要在机身上回放');
  expect(text(tree!)).not.toContain('传回上一张照片');
  expect(text(tree!)).toContain('Wi-Fi 是实验功能');
  expect(text(tree!)).toContain('请附上连接诊断');
  await act(async () => tree!.root.findByProps({testID: 'guide-feedback'}).props.onPress());
  expect(openURL).toHaveBeenCalledWith('https://github.com/USER-HFC/moment-s5/issues/new');
  act(() => tree!.root.findByProps({testID: 'guide-replay'}).props.onPress());
  expect(onShowIntro).toHaveBeenCalledTimes(1);
  act(() => tree!.unmount());
});

it('confirms before clearing exported copies and says the card and gallery stay', async () => {
  const notices: string[] = [];
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<Harness onNotice={notice => notices.push(notice.message)}/>); });
  act(() => tree!.root.findByProps({testID: 'settings-storage'}).props.onPress());
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
  expect(tree!.root.findByProps({testID: 'storage-count'}).props.children).toBe('2 张');
  expect(tree!.root.findByProps({testID: 'storage-bytes'}).props.children).toBe('1.5 KB');
  expect(tree!.root.findByProps({testID: 'storage-clearable'}).props.children).toBe('可清理 1 张，约 512 B');
  expect(tree!.root.findByProps({testID: 'storage-clear'}).props.accessibilityState.disabled).toBe(false);
  expect(camera!.clearExportedCopies).not.toHaveBeenCalled();
  act(() => tree!.root.findByProps({testID: 'storage-clear'}).props.onPress());
  expect(text(tree!)).toContain('机身 SD 卡和系统相册里的照片不受影响');
  expect(tree!.root.findAllByProps({testID: 'storage-confirm'}).some(node => node.props.accessibilityViewIsModal)).toBe(true);
  expect(tree!.root.findByProps({testID: 'storage-body'}).props.importantForAccessibility).toBe('no-hide-descendants');
  expect(tree!.root.findByProps({testID: 'storage-body'}).props.accessibilityElementsHidden).toBe(true);
  expect(StyleSheet.flatten(tree!.root.findByProps({testID: 'storage-confirm-clear'}).props.style({pressed: false})).backgroundColor).toBe(ui.color.destructive);
  await act(async () => tree!.root.findByProps({testID: 'storage-confirm-clear'}).props.onPress());
  expect(camera!.clearExportedCopies).toHaveBeenCalledTimes(1);
  expect(notices).toEqual(['已清理 1 张已导出的副本']);
  act(() => tree!.unmount());
});

it('disables cleanup when nothing has been exported', async () => {
  jest.mocked(camera!.clearExportedCopies).mockClear();
  // The list and the storage page each ask for usage. Both must see the empty export set.
  jest.mocked(camera!.storageUsage).mockResolvedValue({count: 2, bytes: 1536, exportedCount: 0, exportedBytes: 0});
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<Harness/>); });
  act(() => tree!.root.findByProps({testID: 'settings-storage'}).props.onPress());
  await act(async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); });
  const button = tree!.root.findByProps({testID: 'storage-clear'});
  expect(button.props.accessibilityState.disabled).toBe(true);
  expect(tree!.root.findByProps({testID: 'storage-clearable'}).props.children).toBe('没有可清理的照片');
  act(() => button.props.onPress());
  expect(tree!.root.findAllByProps({testID: 'storage-confirm'})).toHaveLength(0);
  expect(camera!.clearExportedCopies).not.toHaveBeenCalled();
  jest.mocked(camera!.storageUsage).mockResolvedValue({count: 2, bytes: 1536, exportedCount: 1, exportedBytes: 512});
  act(() => tree!.unmount());
});

it('walks three intro cards once and can skip', () => {
  const done = jest.fn();
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<OnboardingCards onDone={done}/>); });
  expect(text(tree!)).toContain('连接相机');
  const card = tree!.root.findByProps({testID: 'onboarding-card-1'});
  expect(card.findByProps({testID: 'camera-icon-usb'})).toBeTruthy();
  const cardStyle = StyleSheet.flatten(card.props.style);
  expect(cardStyle.justifyContent).toBe('center');
  expect(cardStyle.minHeight).toBeGreaterThanOrEqual(320);
  act(() => tree!.root.findByProps({testID: 'onboarding-next'}).props.onPress());
  expect(text(tree!)).toContain('拍动态照片');
  expect(tree!.root.findByProps({testID: 'camera-icon-motion'})).toBeTruthy();
  act(() => tree!.root.findByProps({testID: 'onboarding-next'}).props.onPress());
  expect(text(tree!)).toContain('套用 LUT');
  expect(tree!.root.findByProps({testID: 'camera-icon-lut'})).toBeTruthy();
  expect(text(tree!)).toContain('开始使用');
  act(() => tree!.root.findByProps({testID: 'onboarding-next'}).props.onPress());
  expect(done).toHaveBeenCalledTimes(1);
  done.mockClear();
  act(() => { tree = renderer.create(<OnboardingCards onDone={done}/>); });
  act(() => tree!.root.findByProps({testID: 'onboarding-skip'}).props.onPress());
  expect(done).toHaveBeenCalledTimes(1);
  act(() => tree!.unmount());
});
