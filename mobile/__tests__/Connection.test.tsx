import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {expect, it, jest, beforeEach, afterEach} from '@jest/globals';
import {PermissionsAndroid, Platform, Text, TextInput} from 'react-native';

jest.mock('react-native-safe-area-context', () => ({SafeAreaView: ({children}: any) => children}));
jest.mock('../src/native', () => ({camera: {capture: jest.fn(), remoteShutter: jest.fn(), focus: jest.fn(), setAudio: jest.fn()}}));
import ConnectionSheet from '../src/connection/ConnectionSheet';
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
const toggle = (label: string) => tree.root.findAll(node => node.props?.accessibilityLabel === label && node.props.accessibilityRole === 'switch' && typeof node.props.onPress === 'function')[0];
const wifi = () => act(() => button('Wi-Fi（实验）').props.onPress());
const visibleText = () => {
  const lines = tree.root.findAll(node => node.props && 'children' in node.props).flatMap(node => {
    const children = node.props.children;
    return typeof children === 'string' ? [children] : Array.isArray(children) ? children.filter(child => typeof child === 'string') : [];
  });
  return [...new Set(lines)].join('\n');
};

it('defaults to USB and keeps the experimental mark on the Wi-Fi label only', async () => {
  // Round close button: 30 dp circle, hitSlop brings the target to 44.
  const close = tree.root.findAll(node => node.props?.accessibilityLabel === '关闭' && node.props.hitSlop !== undefined)[0];
  expect(30 + close.props.hitSlop * 2).toBeGreaterThanOrEqual(44);
  expect(tree.root.findByProps({testID: 'connection-modes'}).props.className).toContain('flex-row');
  for (const id of ['connection-mode-usb', 'connection-mode-wifi', 'connection-mode-demo']) {
    expect(tree.root.findByProps({testID: id}).props.className).toContain('flex-1');
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
  expect(copy).toContain('确认相机 IP，一般不用改');
  expect(copy).toContain('我已在系统设置里连上相机 Wi-Fi');
  expect(copy).toContain('打开后直接使用当前网络，不会再弹出连接相机热点的请求。');
  expect(copy).not.toContain('LUMIX Sync');
  expect(copy).not.toContain('合成');
  await act(async () => button('连接 Wi-Fi 相机').props.onPress());
  expect(props.onWifi).toHaveBeenCalledWith({manual: true, cameraIp: '192.168.54.1'});
});

it('keeps every segment on one line and puts a small experimental badge beside Wi-Fi', () => {
  const label = (text: string) => tree.root.findAllByType(Text).find(node => node.props.children === text)!;
  expect(visibleText()).not.toContain('Wi-Fi（实验）');
  for (const text of ['USB', 'Wi-Fi', '演示', '实验']) {
    expect(label(text).props.numberOfLines).toBe(1);
    expect(label(text).props.maxFontSizeMultiplier).toBe(1.3);
  }
  expect(label('实验').props.className).toContain('text-[10px]');
});

it('reopens on the remembered way and IP instead of always starting on USB', () => {
  act(() => tree.update(<ConnectionSheet {...props} remembered={{method: 'wifi', cameraIp: '10.0.0.8'}}/>));
  expect(button('Wi-Fi（实验）').props.accessibilityState.selected).toBe(true);
  const field = () => tree.root.findAllByType(TextInput).find(node => node.props.accessibilityLabel === '相机 IP')!;
  expect(field().props.value).toBe('10.0.0.8');
  act(() => tree.update(<ConnectionSheet {...props} remembered={{method: 'demo', cameraIp: '10.0.0.8'}}/>));
  expect(button('演示连接方式').props.accessibilityState.selected).toBe(true);
  act(() => tree.update(<ConnectionSheet {...props} state={{...state, active: true, transport: 'usb'}} remembered={{method: 'demo', cameraIp: '10.0.0.8'}}/>));
  expect(button('USB 连接方式').props.accessibilityState.selected).toBe(true);
});
it('validates known SSID and requests permission only for automatic joining', async () => {
  const permission = jest.spyOn(PermissionsAndroid, 'check').mockResolvedValue(false);
  const request = jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);
  wifi(); act(() => toggle('我已在系统设置里连上相机 Wi-Fi').props.onPress());
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
  expect(tree.root.findAll(node => node.props?.children === 'Wi-Fi 实验').length).toBeGreaterThan(0);
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
  expect(tree.root.findByProps({testID: 'connection-status'}).props.children).toBe('拍到了多张新照片，无法确定是哪一张，请查看相机存储卡');
});
it('hides debug settings in release and rejects forged debug options', () => {
  act(() => tree.update(<ConnectionSheet {...props} debugAllowed={false}/>)); wifi();
  expect(tree.root.findAll(node => node.props?.accessibilityRole === 'switch' && String(node.props.accessibilityLabel).includes('模拟相机调试')).length).toBe(0);
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
it('shows the native status in plain words', () => {
  act(() => tree.update(<ConnectionSheet {...props} status="Wi-Fi 未收到完整取景帧"/>));
  expect(tree.root.findByProps({testID: 'connection-status'}).props.children).toBe('收不到取景画面，请检查相机是否在拍摄模式，以及手机网络');
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
  act(() => tree.root.findAll(node => node.props?.accessibilityLabel === '拍摄控制' && typeof node.props.onPress === 'function')[0].props.onPress());
  expect(tree.root.findAllByProps({testID: 'focus-button'}).length).toBeGreaterThan(0);
  expect(tree.root.findAllByProps({accessibilityLabel: '远对焦'})).toHaveLength(0);
});
