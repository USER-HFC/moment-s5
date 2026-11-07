import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {expect, it, jest, beforeEach, afterEach} from '@jest/globals';
import {PermissionsAndroid, Platform, StyleSheet} from 'react-native';
import {Switch, TextInput} from 'react-native-paper';

jest.mock('react-native-safe-area-context', () => ({SafeAreaView: ({children}: any) => children}));
jest.mock('../src/native', () => ({camera: {capture: jest.fn(), remoteShutter: jest.fn(), focus: jest.fn(), setAudio: jest.fn()}}));
import ConnectionSheet from '../src/connection/ConnectionSheet';
import ExperimentalWifiBadge from '../src/connection/ExperimentalWifiBadge';
import {connectionOptions, initialConnectionForm} from '../src/connection/model';
import CameraWorkspace from '../src/CameraWorkspace';

const state = {active: false, busy: false, ready: false, demo: false, lut: null};
const props = {visible: true, state, status: '', debugAllowed: true, onClose: jest.fn(), onUsb: jest.fn(async () => {}), onWifi: jest.fn(async () => {}), onDemo: jest.fn(async () => {}), onDisconnect: jest.fn()};
let tree: renderer.ReactTestRenderer;
const originalPlatform = Platform.OS;
beforeEach(() => {Platform.OS = 'android'; jest.useFakeTimers(); jest.clearAllMocks(); act(() => {tree = renderer.create(<ConnectionSheet {...props}/>);});});
afterEach(() => {act(() => tree.unmount()); jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks(); Platform.OS = originalPlatform;});
const button = (label: string) => {
  const node = tree.root.findAll(item => item.props?.accessibilityLabel === label && typeof item.props.onPress === 'function')[0];
  if (!node) throw new Error(`missing control ${label}`);
  return node;
};
const toggle = (label: string) => tree.root.findAllByType(Switch).find(node => node.props.accessibilityLabel === label)!;
const wifi = () => act(() => button('Wi-Fi（实验）').props.onPress());
const visibleText = () => {
  const lines = tree.root.findAll(node => node.props && 'children' in node.props).flatMap(node => {
    const children = node.props.children;
    return typeof children === 'string' ? [children] : Array.isArray(children) ? children.filter(child => typeof child === 'string') : [];
  });
  return [...new Set(lines)].join('\n');
};

it('defaults to USB and keeps the experimental mark on the Wi-Fi label only', async () => {
  const close = tree.root.findByProps({accessibilityLabel: '关闭'});
  const closeStyle = StyleSheet.flatten(close.props.style({pressed: false}));
  expect(closeStyle.width).toBeGreaterThanOrEqual(48);
  expect(closeStyle.height).toBeGreaterThanOrEqual(48);
  expect(close.props.children?.props?.children ?? JSON.stringify(close.props.children)).toContain('✕');
  const modes = StyleSheet.flatten(tree.root.findByProps({testID: 'connection-modes'}).props.style);
  expect(modes.flexDirection).toBe('row');
  expect(modes.flexWrap).toBe('nowrap');
  for (const id of ['connection-mode-usb', 'connection-mode-wifi', 'connection-mode-demo']) {
    const segment = StyleSheet.flatten(tree.root.findByProps({testID: id}).props.style({pressed: false}));
    expect(segment.flex).toBe(1);
    expect(segment.minHeight).toBeGreaterThanOrEqual(48);
  }
  const usb = visibleText();
  expect(usb).toContain('相机：设置 → USB → PC(Tether)');
  expect(usb).toContain('用支持数据的 USB-C 线');
  expect(usb).toContain('OPPO/ColorOS 在设置里开启 OTG');
  await act(async () => button('连接 USB 相机').props.onPress());
  expect(props.onUsb).toHaveBeenCalledTimes(1); expect(props.onWifi).not.toHaveBeenCalled();
  wifi();
  const copy = visibleText();
  expect(copy.split('实验').length - 1).toBe(1);
  expect(copy).toContain('相机开启 Wi-Fi 遥控拍摄');
  expect(copy).toContain('手机连上相机热点');
  expect(copy).toContain('填 IP，默认 192.168.54.1');
  expect(copy).toContain('我已在系统设置里连上相机 Wi-Fi');
  expect(copy).toContain('打开后直接使用当前网络，不会再弹出连接相机热点的请求。');
  expect(copy).not.toContain('LUMIX Sync');
  expect(copy).not.toContain('合成');
  await act(async () => button('连接 Wi-Fi 相机').props.onPress());
  expect(props.onWifi).toHaveBeenCalledWith({manual: true, cameraIp: '192.168.54.1'});
});
it('validates known SSID and requests permission only for automatic joining', async () => {
  const permission = jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
  const request = jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);
  wifi(); act(() => toggle('我已在系统设置里连上相机 Wi-Fi').props.onValueChange(false));
  await act(async () => button('连接 Wi-Fi 相机').props.onPress());
  expect(props.onWifi).not.toHaveBeenCalled(); expect(permission).not.toHaveBeenCalled();
  const input = tree.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === '相机 Wi-Fi 名称')!;
  expect(tree.root.findByProps({testID: 'connection-status'}).props.children).toContain('相机 Wi-Fi 名称');
  act(() => input.props.onChangeText('S5-fixture'));
  expect(tree.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === '相机 Wi-Fi 密码')!.props.secureTextEntry).toBe(true);
  await act(async () => button('连接 Wi-Fi 相机').props.onPress());
  expect(request).toHaveBeenCalledTimes(1); expect(props.onWifi).not.toHaveBeenCalled();
  expect(tree.root.findByProps({testID: 'connection-status'}).props.children).toContain('权限未授权');
});
it('exposes an independent demo choice without dispatching a camera connection', async () => {
  act(() => button('演示连接方式').props.onPress());
  expect(visibleText()).toContain('演示画面，不连接相机。');
  expect(visibleText()).not.toContain('合成');
  await act(async () => button('体验演示').props.onPress());
  expect(props.onDemo).toHaveBeenCalledTimes(1);
  expect(props.onUsb).not.toHaveBeenCalled(); expect(props.onWifi).not.toHaveBeenCalled();
});
it('reopens on the active Wi-Fi connection and retains the connection state in the top control', () => {
  const connected = {...state, active: true, transport: 'wifi' as const};
  act(() => tree.update(<ConnectionSheet {...props} state={connected}/>));
  expect(button('Wi-Fi（实验）').props.accessibilityState.selected).toBe(true);
  expect(visibleText()).toContain('Wi-Fi 已连接');
  expect(visibleText()).not.toContain('Wi-Fi（实验）已连接');
  act(() => tree.update(<CameraWorkspace state={connected} buffered={0} luts={[]} onAlbum={() => {}} onLut={async () => {}} onImportLut={async () => {}} onRefresh={async () => {}} onConnect={async () => {}}/>));
  expect(tree.root.findByProps({accessibilityLabel: '相机连接'}).props.accessibilityHint).toContain('Wi-Fi已连接');
  expect(tree.root.findByProps({testID: 'experimental-wifi-badge'})).toBeTruthy();
});
it('keeps failures readable and suppresses duplicate submits while awaiting native dispatch', async () => {
  let release: () => void = () => {};
  const onWifi = jest.fn(() => new Promise<void>(resolve => {release = resolve;}));
  act(() => tree.update(<ConnectionSheet {...props} onWifi={onWifi}/>)); wifi();
  const press = button('连接 Wi-Fi 相机').props.onPress;
  act(() => {press(); press();}); expect(onWifi).toHaveBeenCalledTimes(1);
  await act(async () => release());
  act(() => tree.update(<ConnectionSheet {...props} onWifi={async () => {throw new Error('出现多个新原 JPEG，无法确认本次照片');}}/>));
  await act(async () => button('连接 Wi-Fi 相机').props.onPress());
  expect(tree.root.findByProps({testID: 'connection-status'}).props.children).toContain('无法确认本次照片');
});
it('hides debug settings in release and rejects forged debug options', () => {
  act(() => tree.update(<ConnectionSheet {...props} debugAllowed={false}/>)); wifi();
  expect(tree.root.findAllByType(Switch).some(node => node.props.accessibilityLabel === '模拟相机调试')).toBe(false);
  expect(() => connectionOptions({...initialConnectionForm, debug: true}, false)).toThrow('仅限 debug APK');
  expect(connectionOptions({...initialConnectionForm, debug: true}, true)).toEqual({manual: true, cameraIp: '192.168.54.1', debugEndpoint: '10.0.2.2:18080', udpPort: 49152});
});
it('uses a keyboard that can type every dot in an IPv4 address', () => {
  wifi();
  const field = () => tree.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === '相机 IP')!;
  expect(field().props.keyboardType).toBe('numbers-and-punctuation');
  act(() => field().props.onChangeText('10.0.0.8'));
  expect(field().props.value).toBe('10.0.0.8');
  expect(connectionOptions({...initialConnectionForm, cameraIp: field().props.value}, false).cameraIp).toBe('10.0.0.8');
});
it('validates addresses and prevents credentials from entering the manual request', () => {
  expect(() => connectionOptions({...initialConnectionForm, cameraIp: '192.168.54.999'}, false)).toThrow('IPv4');
  expect(() => connectionOptions({...initialConnectionForm, debug: true, udpPort: '65536'}, true)).toThrow('UDP');
  expect(() => connectionOptions({...initialConnectionForm, debug: true, debugEndpoint: 'host:80/cam.cgi'}, true)).toThrow('主机');
  expect(connectionOptions({...initialConnectionForm, ssid: 'private', password: 'private'}, false)).toEqual({manual: true, cameraIp: '192.168.54.1'});
});
it('shows the native status and the experimental badge only for Wi-Fi', () => {
  act(() => tree.update(<ConnectionSheet {...props} status="Wi-Fi 未收到完整取景帧"/>));
  expect(tree.root.findByProps({testID: 'connection-status'}).props.children).toBe('Wi-Fi 未收到完整取景帧');
  act(() => tree.update(<ExperimentalWifiBadge state={{...state, transport: 'usb'}}/>));
  expect(tree.root.findAllByProps({testID: 'experimental-wifi-badge'})).toHaveLength(0);
  act(() => tree.update(<ExperimentalWifiBadge state={{...state, transport: 'wifi', exposure: 'ISO 400'}}/>));
  expect(tree.root.findByProps({testID: 'experimental-wifi-badge'})).toBeTruthy();
});
it('hides focus buttons off USB while respecting reticle capability', () => {
  const workspace = {buffered: 0, luts: [], onAlbum: jest.fn(), onLut: async () => {}, onImportLut: async () => {}, onRefresh: async () => {}, onConnect: async () => {}};
  act(() => tree.update(<CameraWorkspace {...workspace} state={{...state, transport: 'wifi', autofocus: false, manualFocus: false}}/>));
  for (const label of ['自动对焦', '对焦', '近对焦', '远对焦', '中央自动对焦']) expect(tree.root.findAllByProps({accessibilityLabel: label})).toHaveLength(0);
  act(() => tree.update(<CameraWorkspace {...workspace} state={{...state, transport: 'wifi', autofocus: true, manualFocus: false}}/>));
  expect(tree.root.findAllByProps({accessibilityLabel: '自动对焦'})).toHaveLength(0);
  expect(tree.root.findAllByProps({accessibilityLabel: '对焦'})).toHaveLength(0);
  act(() => tree.update(<CameraWorkspace {...workspace} state={{...state, transport: 'usb'}}/>));
  expect(tree.root.findAllByProps({testID: 'focus-button'})).toHaveLength(0);
  act(() => tree.update(<CameraWorkspace {...workspace} state={{...state, transport: 'usb', active: true}}/>));
  expect(tree.root.findAllByProps({testID: 'focus-button'}).length).toBeGreaterThan(0);
  expect(tree.root.findAllByProps({accessibilityLabel: '远对焦'})).toHaveLength(0);
});
