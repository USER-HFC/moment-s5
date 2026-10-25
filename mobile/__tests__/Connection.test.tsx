import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {expect, it, jest, beforeEach, afterEach} from '@jest/globals';
import {PermissionsAndroid, Platform} from 'react-native';
import {Button, Switch, TextInput, Text} from 'react-native-paper';

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
const button = (label: string) => tree.root.findAllByType(Button).find(node => node.props.accessibilityLabel === label)!;
const toggle = (label: string) => tree.root.findAllByType(Switch).find(node => node.props.accessibilityLabel === label)!;
const wifi = () => act(() => button('Wi-Fi 实验连接方式').props.onPress());

it('defaults to USB and gives Wi-Fi an explicit experimental badge', async () => {
  await act(async () => button('连接 USB 相机').props.onPress());
  expect(props.onUsb).toHaveBeenCalledTimes(1); expect(props.onWifi).not.toHaveBeenCalled();
  wifi(); expect(tree.root.findAllByType(Text).some(node => node.props.children === '实验性 · 未经真机验证')).toBe(true);
  await act(async () => button('连接 Wi-Fi 实验相机').props.onPress());
  expect(props.onWifi).toHaveBeenCalledWith({manual: true, cameraIp: '192.168.54.1'});
});
it('validates known SSID and requests permission only for automatic joining', async () => {
  const permission = jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
  const request = jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);
  wifi(); act(() => toggle('已手动连接相机 Wi-Fi').props.onValueChange(false));
  await act(async () => button('连接 Wi-Fi 实验相机').props.onPress());
  expect(props.onWifi).not.toHaveBeenCalled(); expect(permission).not.toHaveBeenCalled();
  const input = tree.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === '相机 Wi-Fi SSID')!;
  act(() => input.props.onChangeText('S5-fixture'));
  expect(tree.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === '相机 Wi-Fi 密码')!.props.secureTextEntry).toBe(true);
  await act(async () => button('连接 Wi-Fi 实验相机').props.onPress());
  expect(request).toHaveBeenCalledTimes(1); expect(props.onWifi).not.toHaveBeenCalled();
  expect(tree.root.findByProps({testID: 'connection-status'}).props.children).toContain('权限未授权');
});
it('exposes an independent synthetic demo choice without dispatching a camera connection', async () => {
  act(() => button('合成演示方式').props.onPress());
  await act(async () => button('启动合成演示').props.onPress());
  expect(props.onDemo).toHaveBeenCalledTimes(1);
  expect(props.onUsb).not.toHaveBeenCalled(); expect(props.onWifi).not.toHaveBeenCalled();
});
it('reopens on the active Wi-Fi connection and retains the connection state in the top control', () => {
  const connected = {...state, active: true, transport: 'wifi' as const};
  act(() => tree.update(<ConnectionSheet {...props} state={connected}/>));
  expect(button('Wi-Fi 实验连接方式').props.accessibilityState.selected).toBe(true);
  expect(JSON.stringify(tree.toJSON())).toContain('Wi-Fi（实验）已连接');
  act(() => tree.update(<CameraWorkspace state={connected} buffered={0} luts={[]} onAlbum={() => {}} onLut={async () => {}} onImportLut={async () => {}} onRefresh={async () => {}} onConnect={async () => {}}/>));
  expect(tree.root.findByProps({accessibilityLabel: '相机连接'}).props.accessibilityHint).toContain('Wi-Fi已连接');
  expect(tree.root.findByProps({testID: 'experimental-wifi-badge'})).toBeTruthy();
});
it('keeps failures readable and suppresses duplicate submits while awaiting native dispatch', async () => {
  let release: () => void = () => {};
  const onWifi = jest.fn(() => new Promise<void>(resolve => {release = resolve;}));
  act(() => tree.update(<ConnectionSheet {...props} onWifi={onWifi}/>)); wifi();
  const press = button('连接 Wi-Fi 实验相机').props.onPress;
  act(() => {press(); press();}); expect(onWifi).toHaveBeenCalledTimes(1);
  await act(async () => release());
  act(() => tree.update(<ConnectionSheet {...props} onWifi={async () => {throw new Error('出现多个新原 JPEG，无法确认本次照片');}}/>));
  await act(async () => button('连接 Wi-Fi 实验相机').props.onPress());
  expect(tree.root.findByProps({testID: 'connection-status'}).props.children).toContain('无法确认本次照片');
});
it('hides debug settings in release and rejects forged debug options', () => {
  act(() => tree.update(<ConnectionSheet {...props} debugAllowed={false}/>)); wifi();
  expect(tree.root.findAllByType(Switch).some(node => node.props.accessibilityLabel === '模拟相机调试')).toBe(false);
  expect(() => connectionOptions({...initialConnectionForm, debug: true}, false)).toThrow('仅限 debug APK');
  expect(connectionOptions({...initialConnectionForm, debug: true}, true)).toEqual({manual: true, cameraIp: '192.168.54.1', debugEndpoint: '10.0.2.2:18080', udpPort: 49152});
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
  for (const label of ['自动对焦', '近对焦', '远对焦', '中央自动对焦']) expect(tree.root.findAllByProps({accessibilityLabel: label})).toHaveLength(0);
  act(() => tree.update(<CameraWorkspace {...workspace} state={{...state, transport: 'wifi', autofocus: true, manualFocus: false}}/>));
  expect(tree.root.findAllByProps({accessibilityLabel: '自动对焦'})).toHaveLength(0);
  expect(tree.root.findAllByProps({accessibilityLabel: '远对焦'})).toHaveLength(0);
  act(() => tree.update(<CameraWorkspace {...workspace} state={{...state, transport: 'usb'}}/>));
  expect(tree.root.findAllByProps({accessibilityLabel: '远对焦'})).toHaveLength(0);
});
