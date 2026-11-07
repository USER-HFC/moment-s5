import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {Clipboard, Share, StyleSheet} from 'react-native';
import {expect, it, jest} from '@jest/globals';
import {Notice} from '../src/notice';

jest.mock('../src/native', () => ({
  camera: {diagnostics: jest.fn(async () => '1 第一条\n序列号 SECRET\nserial number ABC\n2 第二条')},
  cameraEvents: null,
}));

import DiagnosticsScreen from '../src/DiagnosticsScreen';
import {camera} from '../src/native';
import {openDiagnosticsPage, presentDiagnostics, registerDiagnosticsOpener, scrollDiagnosticsToEnd} from '../src/connection/diagnostics';

it('drops serial lines and keeps older records above newer ones', () => {
  expect(presentDiagnostics('1 第一条\n序列号 SECRET\n\nSerial Number ABC\n2 第二条')).toBe('1 第一条\n2 第二条');
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
  const notices: Notice[] = [];
  const setString = jest.spyOn(Clipboard, 'setString').mockImplementation(() => {});
  const share = jest.spyOn(Share, 'share').mockResolvedValue({action: Share.sharedAction, activityType: undefined});
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<DiagnosticsScreen onBack={() => {}} onNotice={notice => notices.push(notice)}/>); });
  await act(async () => { await Promise.resolve(); });
  const log = tree!.root.findByProps({testID: 'diagnostics-log'});
  expect(log.props.children).toBe('1 第一条\n2 第二条');
  expect(StyleSheet.flatten(log.props.style).fontFamily).toBe('monospace');
  const scroll = tree!.root.findByProps({testID: 'diagnostics-scroll'});
  expect(typeof scroll.props.onContentSizeChange).toBe('function');
  expect(() => scroll.props.onContentSizeChange()).not.toThrow();
  await act(async () => tree!.root.findByProps({testID: 'diagnostics-copy'}).props.onPress());
  expect(setString).toHaveBeenCalledWith('1 第一条\n2 第二条');
  expect(notices).toEqual([{message: '诊断记录已复制'}]);
  expect(tree!.root.findByProps({accessibilityLabel: '诊断记录已复制'})).toBeTruthy();
  await act(async () => tree!.root.findByProps({testID: 'diagnostics-share'}).props.onPress());
  expect(share).toHaveBeenCalledWith({title: '连接诊断', message: '1 第一条\n2 第二条'});
  act(() => jest.advanceTimersByTime(5000));
  expect(tree!.root.findByProps({accessibilityLabel: '复制诊断记录'})).toBeTruthy();
  act(() => tree!.unmount());
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
