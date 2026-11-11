import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {expect, it, jest, beforeEach, afterEach} from '@jest/globals';
import {Platform, TextInput} from 'react-native';

jest.mock('react-native-safe-area-context', () => ({SafeAreaView: ({children}: any) => children}));
import ConnectionSheet from '../src/connection/ConnectionSheet';

const state = {active: false, busy: false, ready: false, demo: false, lut: null};
const props = {visible: true, state, status: '', debugAllowed: true, onClose: jest.fn(), onUsb: jest.fn(async () => {}), onWifi: jest.fn(async () => {}), onDemo: jest.fn(async () => {}), onDisconnect: jest.fn()};
let tree: renderer.ReactTestRenderer;
beforeEach(() => {jest.clearAllMocks(); act(() => {tree = renderer.create(<ConnectionSheet {...props}/>);});});
afterEach(() => {act(() => tree.unmount());});
const press = (label: string) => tree.root.findAll(node => node.props?.accessibilityLabel === label && typeof node.props.onPress === 'function')[0].props.onPress();
const visibleText = () => tree.root.findAll(node => node.props && typeof node.props.children === 'string').map(node => node.props.children as string).join('\n');

it('renders as iOS here', () => expect(Platform.OS).toBe('ios'));

it('sends an iPhone to Settings for the hotspot and never asks for its name or password', async () => {
  act(() => press('Wi-Fi（实验）'));
  const copy = visibleText();
  expect(copy).toContain('在「设置」→「无线局域网」加入相机热点');
  expect(copy).not.toContain('我已在系统设置里连上相机 Wi-Fi');
  expect(tree.root.findAllByType(TextInput).map(input => input.props.accessibilityLabel)).toEqual(['相机 IP']);
  await act(async () => press('连接 Wi-Fi 相机'));
  expect(props.onWifi).toHaveBeenCalledWith({manual: true, cameraIp: '192.168.54.1'});
});

it('points the debug fixture at the Mac the simulator shares a network with', async () => {
  act(() => press('Wi-Fi（实验）'));
  act(() => press('模拟相机调试（仅 debug）'));
  expect(tree.root.findAllByType(TextInput).find(input => input.props.accessibilityLabel === '调试主机:端口')!.props.value).toBe('127.0.0.1:18080');
  expect(visibleText()).toContain('模拟器和 Mac 共用网络');
  await act(async () => press('连接 Wi-Fi 相机'));
  expect(props.onWifi).toHaveBeenCalledWith({manual: true, cameraIp: '192.168.54.1', debugEndpoint: '127.0.0.1:18080', udpPort: 49152});
});

it('drops a stale failure once a field changes', async () => {
  props.onWifi.mockImplementationOnce(async () => { throw new Error('手机还没连上相机 Wi-Fi；请先在「设置」→「无线局域网」加入相机网络，再回来连接'); });
  act(() => press('Wi-Fi（实验）'));
  await act(async () => press('连接 Wi-Fi 相机'));
  expect(tree.root.findByProps({testID: 'connection-status'}).props.children).toContain('还没连上相机 Wi-Fi');
  act(() => tree.root.findAllByType(TextInput)[0].props.onChangeText('192.168.54.2'));
  expect(tree.root.findAllByProps({testID: 'connection-status'})).toHaveLength(0);
});

it('keeps a USB failure under USB and off the Wi-Fi tab', async () => {
  await act(async () => press('USB 连接方式'));
  await act(async () => press('连接 USB 相机'));
  // The native side reports the outcome as a status line after connect() resolves.
  act(() => tree.update(<ConnectionSheet {...props} status="当前设备不支持 USB 主机连接（模拟器没有 USB）"/>));
  expect(tree.root.findByProps({testID: 'connection-status'}).props.children).toBe('这台手机不能用 USB 连接相机');
  act(() => press('Wi-Fi（实验）'));
  expect(tree.root.findAllByProps({testID: 'connection-status'})).toHaveLength(0);
  act(() => press('USB 连接方式'));
  expect(tree.root.findByProps({testID: 'connection-status'}).props.children).toBe('这台手机不能用 USB 连接相机');
});
