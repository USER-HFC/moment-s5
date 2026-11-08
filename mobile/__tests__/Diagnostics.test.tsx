import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Clipboard, Platform, Share, StyleSheet} from 'react-native';
import {expect, it, jest} from '@jest/globals';
import {Notice} from '../src/notice';

jest.mock('../src/native', () => ({
  camera: {
    diagnostics: jest.fn(async () => '1 第一条\n序列号 SECRET\nserial number ABC\n2 第二条'),
    getState: jest.fn(async () => ({active: true, busy: false, ready: true, demo: false, lut: null, transport: 'usb' as const})),
    buildInfo: {
      versionName: '0.8.0-beta.6', versionCode: '40', builtAt: '2026-11-09T00:00:00Z',
      git: 'deadbeefcafe', buildType: 'release', abi: 'arm64-v8a', minSdk: '33',
    },
  },
  cameraEvents: null,
}));

import DiagnosticsScreen from '../src/DiagnosticsScreen';
import {camera} from '../src/native';
import {buildInfoFromModule} from '../src/buildInfo';
import {connectionModeLabel, diagnosticFacts, diagnosticHeader, diagnosticShareText, formatDiagnosticClock, openDiagnosticsPage, presentDiagnostics, registerDiagnosticsOpener, scrollDiagnosticsToEnd} from '../src/connection/diagnostics';

const device = {Release: '15', Version: 35, Model: 'Pixel 8', Serial: 'SN-DO-NOT-SHARE', Fingerprint: 'google/sdk/secret:user/release-keys', Manufacturer: 'Google'};

it('prefixes a shared report with version, build, Android, phone and connection only', () => {
  const build = buildInfoFromModule(camera);
  expect(connectionModeLabel(null)).toBe('未连接');
  expect(connectionModeLabel({active: false, transport: 'usb'})).toBe('未连接');
  expect(connectionModeLabel({active: true, demo: true, transport: 'usb'})).toBe('演示');
  expect(connectionModeLabel({active: true, transport: 'demo'})).toBe('演示');
  expect(connectionModeLabel({active: true, transport: 'wifi'})).toBe('Wi-Fi');
  expect(connectionModeLabel({active: true, transport: 'usb'})).toBe('USB');
  expect(connectionModeLabel({active: true, transport: 'other'})).toBe('未连接');
  const facts = diagnosticFacts(build, device, 'USB');
  const header = diagnosticHeader(facts);
  expect(header).toBe([
    'App 版本：0.8.0-beta.6',
    '构建号：40',
    'Android 版本：Android 15',
    '手机型号：Pixel 8',
    '连接方式：USB',
  ].join('\n'));
  const shared = diagnosticShareText(facts, presentDiagnostics('1 第一条\n序列号 SECRET\nserial number ABC\n2 第二条'));
  expect(shared.startsWith(`${header}\n\n`)).toBe(true);
  expect(shared.endsWith('1 第一条\n2 第二条')).toBe(true);
  for (const hidden of ['SN-DO-NOT-SHARE', 'google/sdk/secret', 'deadbeefcafe', 'arm64-v8a', '序列号', 'SECRET', 'Serial']) {
    expect(shared).not.toContain(hidden);
  }
  expect(diagnosticHeader(diagnosticFacts(build, {Version: 35, Model: '  sdk_gphone64_arm64\nSN  '}, '演示'))).toBe([
    'App 版本：0.8.0-beta.6',
    '构建号：40',
    'Android 版本：Android API 35',
    '手机型号：sdk_gphone64_arm64 SN',
    '连接方式：演示',
  ].join('\n'));
  expect(diagnosticFacts({versionName: '  ', versionCode: ''}, null, '  ').androidVersion).toBe('未知');
  expect(diagnosticHeader(diagnosticFacts({versionName: '  ', versionCode: ''}, {Release: 'Android 14'}, ''))).toContain('App 版本：未知');
  expect(diagnosticHeader(diagnosticFacts({versionName: '  ', versionCode: ''}, {Release: 'Android 14'}, ''))).toContain('Android 版本：Android 14');
  expect(diagnosticShareText(facts, '   ')).toBe(header);
});

it('drops serial lines and shows wall-clock time instead of milliseconds since boot', () => {
  expect(presentDiagnostics('1 第一条\n序列号 SECRET\n\nSerial Number ABC\n2 第二条')).toBe('1 第一条\n2 第二条');
  const epoch = 1_730_000_000_000;
  expect(formatDiagnosticClock(epoch)).toMatch(/^\d{2}:\d{2}:\d{2}$/);
  expect(presentDiagnostics(`192380 ${epoch} 进入演示：全部图像由 App 生成，不代表真实相机画面`)).toBe(`${formatDiagnosticClock(epoch)} 进入演示：全部图像由 App 生成，不代表真实相机画面`);
  expect(presentDiagnostics(`192380 ${epoch} 序列号 SECRET`)).toBe('');
  expect(presentDiagnostics('serialNumber=ABC')).toBe('');
  expect(presentDiagnostics('serialized USB step')).toBe('serialized USB step');
  expect(presentDiagnostics('\n  \n')).toBe('');
  const view = {scrollToEnd: jest.fn()};
  scrollDiagnosticsToEnd(view);
  expect(view.scrollToEnd).toHaveBeenCalledWith({animated: false});
  scrollDiagnosticsToEnd(null);
});

it('opens the diagnostics page only while App is registered', () => {
  const open = jest.fn();
  openDiagnosticsPage();
  expect(open).not.toHaveBeenCalled();
  const unregister = registerDiagnosticsOpener(open);
  openDiagnosticsPage();
  expect(open).toHaveBeenCalledTimes(1);
  unregister();
  openDiagnosticsPage();
  expect(open).toHaveBeenCalledTimes(1);
});

it('shows the log in a monospace scroller, then copies and shares that same text', async () => {
  jest.useFakeTimers();
  const previous = Platform.constants;
  Object.defineProperty(Platform, 'constants', {configurable: true, value: device});
  const notices: Notice[] = [];
  const setString = jest.spyOn(Clipboard, 'setString').mockImplementation(() => {});
  const share = jest.spyOn(Share, 'share').mockResolvedValue({action: Share.sharedAction, activityType: undefined});
  const report = diagnosticShareText(diagnosticFacts(buildInfoFromModule(camera), device, 'USB'), '1 第一条\n2 第二条');
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<DiagnosticsScreen onBack={() => {}} onNotice={notice => notices.push(notice)}/>); });
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
  const log = tree!.root.findByProps({testID: 'diagnostics-log'});
  expect(log.props.children).toBe('1 第一条\n2 第二条');
  const context = tree!.root.findByProps({testID: 'diagnostics-context'});
  expect(context.props.accessibilityLabel).toBe(diagnosticHeader(diagnosticFacts(buildInfoFromModule(camera), device, 'USB')));
  expect(context.findAll((node) => node.props.children === 'USB' && typeof node.type === 'string').length).toBeGreaterThan(0);
  expect(StyleSheet.flatten(log.props.style).fontFamily).toBe('monospace');
  const scroll = tree!.root.findByProps({testID: 'diagnostics-scroll'});
  expect(typeof scroll.props.onContentSizeChange).toBe('function');
  expect(() => scroll.props.onContentSizeChange()).not.toThrow();
  await act(async () => tree!.root.findByProps({testID: 'diagnostics-copy'}).props.onPress());
  expect(setString).toHaveBeenCalledWith(report);
  expect(notices).toEqual([{message: '诊断记录已复制'}]);
  expect(tree!.root.findByProps({accessibilityLabel: '诊断记录已复制'})).toBeTruthy();
  await act(async () => tree!.root.findByProps({testID: 'diagnostics-share'}).props.onPress());
  expect(share).toHaveBeenCalledWith({title: '连接诊断', message: report});
  expect(report).not.toContain('SN-DO-NOT-SHARE');
  expect(report).not.toContain('deadbeefcafe');
  act(() => jest.advanceTimersByTime(5000));
  expect(tree!.root.findByProps({accessibilityLabel: '复制诊断记录'})).toBeTruthy();
  act(() => tree!.unmount());
  Object.defineProperty(Platform, 'constants', {configurable: true, value: previous});
  jest.clearAllTimers();
  jest.useRealTimers();
});

it('shows the empty state until a refresh brings a record', async () => {
  const diagnostics = camera!.diagnostics as unknown as ReturnType<typeof jest.fn>;
  diagnostics.mockResolvedValueOnce('\n序列号 ONLY\n');
  diagnostics.mockResolvedValueOnce('3 连上了');
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<DiagnosticsScreen onBack={() => {}} onNotice={() => {}}/>); });
  await act(async () => { await Promise.resolve(); });
  expect(tree!.root.findByProps({testID: 'diagnostics-empty'}).props.children).toBe('还没有诊断记录，连接相机后再来看');
  expect(tree!.root.findByProps({testID: 'diagnostics-copy'}).props.disabled).toBe(true);
  expect(tree!.root.findByProps({testID: 'diagnostics-share'}).props.disabled).toBe(true);
  await act(async () => tree!.root.findByProps({accessibilityLabel: '刷新诊断记录'}).props.onPress());
  await act(async () => { await Promise.resolve(); });
  expect(tree!.root.findByProps({testID: 'diagnostics-log'}).props.children).toBe('3 连上了');
  expect(tree!.root.findAllByProps({testID: 'diagnostics-empty'})).toHaveLength(0);
  act(() => tree!.unmount());
});
