import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {AccessibilityInfo, Animated, AppState, BackHandler, Dimensions, Modal, StyleSheet, Vibration} from 'react-native';
import {Text} from 'react-native-paper';
import {afterEach, beforeEach, expect, it, jest} from '@jest/globals';

jest.mock('react-native-safe-area-context', () => ({SafeAreaView: ({children}: any) => children}));
jest.mock('../src/native', () => ({camera: {capture: jest.fn(), captureStill: jest.fn(), focus: jest.fn(), setAudio: jest.fn(), disconnect: jest.fn()}}));
jest.mock('../src/microphonePermission', () => ({requestMicrophonePermission: jest.fn(async () => true), openMicrophoneSettings: jest.fn(async () => {})}));

import CameraWorkspace from '../src/CameraWorkspace';
import LutFlyout from '../src/LutFlyout';
import {camera, CameraState} from '../src/native';
import {openMicrophoneSettings, requestMicrophonePermission} from '../src/microphonePermission';

const state: CameraState = {active: true, busy: false, ready: true, demo: false, lut: null};
const props = {state, buffered: 3, luts: [], onAlbum: jest.fn(), onLut: async () => {}, onImportLut: async () => {}, onRefresh: async () => {}, onConnect: async () => {}};
let tree: renderer.ReactTestRenderer;
const backHandlers: Array<() => boolean | null | undefined> = [];

beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks(); AppState.currentState = 'active';
  backHandlers.length = 0;
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    const wrapped = handler as () => boolean | null | undefined;
    backHandlers.push(wrapped);
    return {remove: () => { const index = backHandlers.lastIndexOf(wrapped); if (index >= 0) backHandlers.splice(index, 1); }};
  });
  jest.spyOn(BackHandler, 'exitApp').mockImplementation(() => undefined);
  jest.mocked(requestMicrophonePermission).mockResolvedValue(true);
  act(() => { tree = renderer.create(<CameraWorkspace {...props}/>); });
});
afterEach(() => { act(() => tree.unmount()); jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks(); });
const press = (label: string) => act(() => {
  const nodes = tree.root.findAllByProps({accessibilityLabel: label});
  const target = nodes.find(node => typeof node.props.style === 'function') || nodes[0];
  target.props.onPress();
});
const tick = (ms: number) => act(() => jest.advanceTimersByTime(ms));
const pressBack = () => act(() => {
  const chain = [...backHandlers].reverse();
  let handled = false;
  for (const handler of chain) if (handler()) { handled = true; break; }
  if (!handled) BackHandler.exitApp();
});

it('opens LUTs as a flat side flyout that stays open for live switching', async () => {
  const onLut = jest.fn(async (_id: string) => {});
  const luts = [{id: 'builtin:acros', name: 'Fuji 风格 · Acros', size: 1, builtIn: true, readOnly: true}, {id: 'mine.cube', name: '我的 LUT', size: 1}];
  act(() => tree.update(<CameraWorkspace {...props} luts={luts} onLut={onLut}/>));
  press('LUT 风格');
  const flyout = tree.root.findByProps({testID: 'lut-flyout'});
  expect(tree.root.findAllByType(Modal).some(node => node.props.visible)).toBe(false);
  const style = StyleSheet.flatten(flyout.props.style);
  expect(style.elevation).toBe(0);
  expect(style.shadowOpacity).toBeUndefined();
  for (const label of ['选择 LUT Acros', '选择 LUT 我的 LUT', '选择 LUT 原色']) {
    await act(async () => {await tree.root.findByProps({accessibilityLabel: label}).props.onPress();});
    expect(tree.root.findAllByType(LutFlyout)).toHaveLength(1);
  }
  expect(onLut.mock.calls.map(call => call[0])).toEqual(['builtin:acros', 'mine.cube', 'off']);
  press('LUT 风格');
  expect(tree.root.findAllByType(LutFlyout)).toHaveLength(0);
  press('LUT 风格'); press('收起 LUT 面板');
  expect(tree.root.findAllByType(LutFlyout)).toHaveLength(0);
});

it('opens the timer beside the shutter and closes LUT and focus while it is open', () => {
  act(() => tree.update(<CameraWorkspace {...props} state={{...state, transport: 'usb'}}/>));
  press('对焦');
  press('定时 关');
  expect(tree.root.findAllByProps({testID: 'focus-flyout'})).toHaveLength(0);
  const flyout = tree.root.findByProps({testID: 'timer-flyout'});
  expect(tree.root.findAllByType(Modal).some(node => node.props.visible)).toBe(false);
  const style = StyleSheet.flatten(flyout.props.style);
  expect(style.elevation).toBe(0);
  expect(style.shadowOpacity).toBeUndefined();
  press('LUT 风格');
  expect(tree.root.findAllByProps({testID: 'timer-flyout'})).toHaveLength(0);
  expect(tree.root.findAllByType(LutFlyout)).toHaveLength(1);
  press('定时 关');
  expect(tree.root.findAllByType(LutFlyout)).toHaveLength(0);
  press('定时 10 秒');
  expect(tree.root.findAllByProps({testID: 'timer-flyout'})).toHaveLength(0);
  expect(tree.root.findByProps({accessibilityLabel: '定时 10 秒'})).toBeTruthy();
  press('定时 10 秒');
  press('关闭定时');
  expect(tree.root.findByProps({accessibilityLabel: '定时 关'})).toBeTruthy();
});

it('keeps the separate AF button removed', () => {
  expect(tree.root.findAllByProps({accessibilityLabel: '自动对焦'})).toHaveLength(0);
});

it('shows one focus control on live USB and keeps near/far in a flat flyout', () => {
  for (const hidden of [{}, {transport: 'wifi' as const}, {transport: 'demo' as const, demo: true}, {transport: 'usb' as const, active: false}]) {
    act(() => tree.update(<CameraWorkspace {...props} state={{...state, ...hidden}}/>));
    for (const label of ['对焦', '近对焦', '远对焦']) expect(tree.root.findAllByProps({accessibilityLabel: label})).toHaveLength(0);
  }
  act(() => tree.update(<CameraWorkspace {...props} state={{...state, transport: 'usb'}}/>));
  expect(tree.root.findAllByProps({testID: 'focus-button'}).length).toBeGreaterThan(0);
  expect(tree.root.findAllByProps({accessibilityLabel: '近对焦'})).toHaveLength(0);
  press('对焦');
  const flyout = tree.root.findByProps({testID: 'focus-flyout'});
  expect(tree.root.findAllByType(Modal).some(node => node.props.visible)).toBe(false);
  const style = StyleSheet.flatten(flyout.props.style);
  expect(style.elevation).toBe(0);
  expect(style.shadowOpacity).toBeUndefined();
  press('近对焦'); press('近对焦'); press('远对焦');
  expect(jest.mocked(camera!.focus).mock.calls).toEqual([[1], [1], [-1]]);
  expect(tree.root.findAllByProps({testID: 'focus-flyout'}).length).toBeGreaterThan(0);
  press('收起对焦面板');
  expect(tree.root.findAllByProps({testID: 'focus-flyout'})).toHaveLength(0);
  press('对焦'); press('LUT 风格');
  expect(tree.root.findAllByProps({testID: 'focus-flyout'})).toHaveLength(0);
  expect(tree.root.findAllByType(LutFlyout)).toHaveLength(1);
  press('对焦');
  expect(tree.root.findAllByType(LutFlyout)).toHaveLength(0);
  expect(tree.root.findAllByProps({testID: 'focus-flyout'}).length).toBeGreaterThan(0);
  press('对焦');
  expect(tree.root.findAllByProps({testID: 'focus-flyout'})).toHaveLength(0);
  press('对焦');
  act(() => tree.update(<CameraWorkspace {...props} state={{...state, transport: 'usb', busy: true}}/>));
  expect(tree.root.findByProps({accessibilityLabel: '近对焦'}).props.disabled).toBe(true);
  const focusControl = tree.root.findAllByProps({testID: 'focus-button'}).find(node => typeof node.props.style === 'function')!;
  expect(focusControl.props.disabled).toBe(true);
});

it('captures an ordinary still with no prebuffer and with a selected LUT', () => {
  act(() => tree.update(<CameraWorkspace {...props} state={{...state, ready: false, lut: 'Classic Chrome'}} buffered={0}/>));
  press('拍摄照片');
  expect(camera!.captureStill).toHaveBeenCalledTimes(1);
  expect(camera!.capture).not.toHaveBeenCalled();
});

it('uses the current motion setting when the countdown completes exactly once', () => {
  press('定时 关'); press('定时 10 秒'); press('开始倒计时'); tick(1000); press('动态照片'); tick(9000);
  expect(camera!.capture).toHaveBeenCalledTimes(1);
  expect(camera!.captureStill).not.toHaveBeenCalled();
  tick(1000); expect(camera!.capture).toHaveBeenCalledTimes(1);
});

it('does not move the countdown when the wall clock changes', () => {
  press('定时 关'); press('定时 10 秒'); press('开始倒计时');
  jest.setSystemTime(Date.now() + 60_000); tick(9900);
  expect(camera!.captureStill).not.toHaveBeenCalled();
  tick(100); expect(camera!.captureStill).toHaveBeenCalledTimes(1);
});

it('still cancels immediately when the timer control is pressed during a countdown', () => {
  press('定时 关'); press('定时 10 秒'); press('开始倒计时'); tick(5000); press('取消定时'); tick(6000);
  expect(camera!.captureStill).not.toHaveBeenCalled();
  expect(camera!.capture).not.toHaveBeenCalled();
  expect(tree.root.findByProps({accessibilityLabel: '拍摄照片'})).toBeTruthy();
});

it.each([{busy: true}, {active: false}])('cancels the countdown when capture becomes unavailable: %j', update => {
  press('定时 关'); press('定时 10 秒'); press('开始倒计时'); tick(5000);
  act(() => tree.update(<CameraWorkspace {...props} state={{...state, ...update}}/>)); tick(6000);
  expect(camera!.capture).not.toHaveBeenCalled(); expect(camera!.captureStill).not.toHaveBeenCalled();
});

it('checks current prebuffer readiness at the countdown boundary', () => {
  press('动态照片'); press('定时 关'); press('定时 10 秒'); press('拍摄动态照片');
  act(() => tree.update(<CameraWorkspace {...props} state={{...state, ready: false}}/>)); tick(10_000);
  expect(camera!.capture).not.toHaveBeenCalled(); expect(camera!.captureStill).not.toHaveBeenCalled();
});

it('cancels before entering the album or unmounting', () => {
  press('定时 关'); press('定时 10 秒'); press('开始倒计时'); press('打开相册'); tick(10_000);
  expect(props.onAlbum).toHaveBeenCalledTimes(1); expect(camera!.captureStill).not.toHaveBeenCalled();
  press('开始倒计时'); act(() => tree.unmount()); tick(10_000);
  expect(camera!.captureStill).not.toHaveBeenCalled();
});

it('cancels in background even before a queued tick runs', () => {
  press('定时 关'); press('定时 10 秒'); press('开始倒计时'); AppState.currentState = 'background'; tick(10_000);
  expect(camera!.captureStill).not.toHaveBeenCalled();
});

it('keeps audio off when microphone permission is denied', async () => {
  jest.mocked(requestMicrophonePermission).mockResolvedValue(false);
  await act(async () => tree.root.findByProps({accessibilityLabel: '收音 关'}).props.onPress());
  expect(requestMicrophonePermission).toHaveBeenCalledTimes(1); expect(camera!.setAudio).not.toHaveBeenCalled();
});

it('restores the native audio preference and switches it off without another permission request', async () => {
  act(() => tree.update(<CameraWorkspace {...props} state={{...state, audio: true}}/>));
  await act(async () => tree.root.findByProps({accessibilityLabel: '收音 开'}).props.onPress());
  expect(requestMicrophonePermission).not.toHaveBeenCalled(); expect(camera!.setAudio).toHaveBeenCalledWith(false);
});

it('asks to connect, names the buffer wait, and says when the previous photo is still saving', () => {
  const disconnected = {...state, active: false, ready: false};
  act(() => tree.update(<CameraWorkspace {...props} state={disconnected}/>));
  press('拍摄照片');
  expect(camera!.captureStill).not.toHaveBeenCalled();
  expect(tree.root.findByProps({testID: 'notice-bar'}).props.children).toBeTruthy();
  expect(JSON.stringify(tree.toJSON())).toContain('请先连接相机');
  const onConnect = jest.fn(async () => {});
  act(() => tree.update(<CameraWorkspace {...props} onConnect={onConnect} state={disconnected}/>));
  press('连接相机');
  expect(onConnect).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(tree.toJSON())).toContain('未连接相机');
  expect(JSON.stringify(tree.toJSON())).toContain('相机选 PC(Tether)');
  act(() => tree.update(<CameraWorkspace {...props} state={{...state, busy: true}}/>));
  press('拍摄照片');
  expect(JSON.stringify(tree.toJSON())).toContain('正在保存上一张');
  act(() => tree.update(<CameraWorkspace {...props} state={{...state, ready: false}} buffered={1.2}/>));
  press('动态照片');
  press('拍摄动态照片');
  expect(camera!.capture).not.toHaveBeenCalled();
  expect(JSON.stringify(tree.toJSON())).toContain('动态照片还在缓存，还需约 2 秒');
});

it('draws a reference frame without changing the preview frame', () => {
  act(() => tree.update(<CameraWorkspace {...props} preview="data:image/jpeg;base64,frame"/>));
  act(() => tree.root.findByProps({testID: 'viewfinder'}).props.onLayout({nativeEvent: {layout: {width: 360, height: 640}}}));
  const frame = () => StyleSheet.flatten(tree.root.findByProps({testID: 'preview-frame'}).props.style);
  const before = frame();
  expect(tree.root.findAllByProps({testID: 'reference-frame'})).toHaveLength(0);
  press('构图参考 关');
  press('构图参考 16:9');
  expect(tree.root.findByProps({testID: 'reference-frame'}).findByType(Text).props.numberOfLines).toBe(1);
  const wide = StyleSheet.flatten(tree.root.findByProps({testID: 'reference-frame'}).props.style);
  expect(wide.width).toBeGreaterThan(wide.height);
  expect(JSON.stringify(tree.toJSON())).toContain('16:9 参考');
  expect(frame()).toEqual(before);
  press('构图参考 16:9');
  press('构图参考 1:1');
  const square = StyleSheet.flatten(tree.root.findByProps({testID: 'reference-frame'}).props.style);
  expect(square.width).toBe(square.height);
  expect(frame()).toEqual(before);
});

it('hides the AF reticle until a feed is available and separates capture modes', () => {
  expect(tree.root.findAllByProps({accessibilityLabel: '中央自动对焦'})).toHaveLength(0);
  act(() => tree.update(<CameraWorkspace {...props} preview="data:image/jpeg;base64,frame"/>));
  expect(tree.root.findByProps({accessibilityLabel: '中央自动对焦'})).toBeTruthy();
  press('动态照片'); press('普通照片'); press('拍摄照片');
  expect(camera!.captureStill).toHaveBeenCalledTimes(1);
  expect(camera!.capture).not.toHaveBeenCalled();
});

it('flashes and vibrates on the shutter, including when a countdown finishes', () => {
  const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
  const timing = jest.spyOn(Animated, 'timing');
  press('拍摄照片');
  expect(vibrate).toHaveBeenCalledWith(20);
  expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({toValue: 0, duration: 140, useNativeDriver: true}));
  vibrate.mockClear(); timing.mockClear();
  press('定时 关');
  press('定时 2 秒');
  press('开始倒计时');
  expect(vibrate).not.toHaveBeenCalled();
  expect(timing).not.toHaveBeenCalled();
  tick(2100);
  expect(vibrate).toHaveBeenCalledWith(20);
  expect(camera!.captureStill).toHaveBeenCalledTimes(2);
});

it('vibrates without covering the frame when reduce motion is on', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  act(() => tree.unmount());
  await act(async () => { tree = renderer.create(<CameraWorkspace {...props}/>); });
  const vibrate = jest.spyOn(Vibration, 'vibrate').mockImplementation(() => {});
  const timing = jest.spyOn(Animated, 'timing');
  press('拍摄照片');
  expect(vibrate).toHaveBeenCalledWith(20);
  expect(timing).not.toHaveBeenCalled();
  const opacity = tree.root.findByProps({testID: 'shutter-flash'}).props.style.find((item: {opacity?: {_value?: number}}) => item?.opacity);
  expect(opacity.opacity._value).toBe(0);
});

it('fades a replacement album thumbnail and leaves the first one still', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false);
  const timing = jest.spyOn(Animated, 'timing');
  act(() => tree.update(<CameraWorkspace {...props} latestPhoto="file://first.jpg"/>));
  await act(async () => { await Promise.resolve(); });
  expect(tree.root.findByProps({testID: 'album-thumbnail'})).toBeTruthy();
  expect(timing).not.toHaveBeenCalled();
  act(() => tree.update(<CameraWorkspace {...props} latestPhoto="file://second.jpg"/>));
  await act(async () => { await Promise.resolve(); });
  expect(timing).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({toValue: 1, duration: 180, useNativeDriver: true}));
});

it('shows the body name only on the HUD and highlights a short connection label', () => {
  const connection = () => tree.root.findAllByProps({accessibilityLabel: '相机连接'}).find(node => typeof node.props.style === 'function')!;
  act(() => tree.update(<CameraWorkspace {...props} state={{...state, transport: 'usb', cameraModel: 'DC-S5'}}/>));
  const control = connection();
  expect(control.findByType(Text).props.children).toBe('USB');
  expect(control.props.accessibilityState.selected).toBe(true);
  expect(StyleSheet.flatten(control.props.style({pressed: false})).backgroundColor).toBe('#344329');
  const hud = tree.root.findByProps({testID: 'hud-source'}).findAllByType(Text).map(node => node.props.children).join('');
  expect(hud).toContain('DC-S5 · USB');
  expect(control.findAllByType(Text).some(node => String(node.props.children).includes('DC-S5'))).toBe(false);
  act(() => tree.update(<CameraWorkspace {...props} state={{...state, transport: 'wifi', cameraModel: 'DC-S5'}}/>));
  const wifi = connection();
  expect(wifi.findByType(Text).props.children).toBe('Wi-Fi');
  expect(wifi.props.accessibilityState.selected).toBe(true);
  expect(tree.root.findByProps({testID: 'hud-source'}).findAllByType(Text).map(node => node.props.children).join('')).toContain('DC-S5 · Wi-Fi');
});

it('pins the timer between the rail and the dock and wraps the guide on a short landscape screen', () => {
  const original = Dimensions.get('window');
  act(() => tree.unmount());
  Dimensions.set({window: {...original, width: 900, height: 400, fontScale: 1.3}, screen: {...original, width: 900, height: 400, fontScale: 1.3}});
  act(() => { tree = renderer.create(<CameraWorkspace {...props} state={{...state, active: false}} notice={{message: '相机正忙，请稍后再按快门', action: {label: '查看诊断', onPress: () => {}}}}/>); });
  expect(tree.root.findByProps({testID: 'notice-bar'}).findAllByType(Text).some(node => node.props.numberOfLines === 3)).toBe(true);
  expect(StyleSheet.flatten(tree.root.findByProps({accessibilityLabel: '连接步骤'}).props.style).flex).toBe(1);
  act(() => tree.root.findByProps({testID: 'camera-tools'}).props.onLayout({nativeEvent: {layout: {width: 64, height: 400, x: 0, y: 0}}}));
  act(() => tree.root.findByProps({testID: 'camera-dock'}).props.onLayout({nativeEvent: {layout: {width: 120, height: 400, x: 0, y: 0}}}));
  press('定时 关');
  const flyout = StyleSheet.flatten(tree.root.findByProps({testID: 'timer-flyout'}).props.style);
  expect(flyout.left).toBe(72);
  expect(flyout.right).toBe(128);
  expect(flyout.top).toBe(8);
  const optionNode = tree.root.findByProps({accessibilityLabel: '定时 2 秒'});
  const option = StyleSheet.flatten(optionNode.props.style({pressed: false}));
  expect(option.flexBasis).toBe(64);
  expect(option.minWidth).toBe(64);
  expect(StyleSheet.flatten(optionNode.parent?.props.style).flexWrap).toBe('wrap');
  act(() => { Dimensions.set({window: original, screen: original}); });
});

it('closes an open panel on back, then asks before leaving a connected or demo camera', () => {
  press('LUT 风格');
  pressBack();
  expect(tree.root.findAllByType(LutFlyout)).toHaveLength(0);
  expect(JSON.stringify(tree.toJSON())).not.toContain('再按一次退出，相机会断开');
  press('定时 关');
  pressBack();
  expect(tree.root.findAllByProps({testID: 'timer-flyout'})).toHaveLength(0);
  act(() => tree.update(<CameraWorkspace {...props} state={{...state, transport: 'usb'}}/>));
  press('对焦');
  pressBack();
  expect(tree.root.findAllByProps({testID: 'focus-flyout'})).toHaveLength(0);
  press('示波器');
  expect(tree.root.findAllByType(Modal).some(node => node.props.visible)).toBe(true);
  pressBack();
  expect(tree.root.findAllByType(Modal).some(node => node.props.visible)).toBe(false);
  press('构图参考 关');
  expect(tree.root.findByProps({testID: 'reference-flyout'})).toBeTruthy();
  pressBack();
  expect(tree.root.findAllByProps({testID: 'reference-flyout'})).toHaveLength(0);
  expect(tree.root.findByProps({accessibilityLabel: '构图参考 关'})).toBeTruthy();
  expect(JSON.stringify(tree.toJSON())).not.toContain('再按一次退出，相机会断开');
  pressBack();
  expect(JSON.stringify(tree.toJSON())).toContain('再按一次退出，相机会断开');
  expect(BackHandler.exitApp).not.toHaveBeenCalled();
  expect(camera!.disconnect).not.toHaveBeenCalled();
  pressBack();
  expect(BackHandler.exitApp).toHaveBeenCalledTimes(1);
  expect(camera!.disconnect).not.toHaveBeenCalled();
  act(() => tree.update(<CameraWorkspace {...props} state={{...state, demo: true}}/>));
  pressBack();
  expect(JSON.stringify(tree.toJSON())).toContain('再按一次退出，相机会断开');
  expect(BackHandler.exitApp).toHaveBeenCalledTimes(1);
});

it('forgets the exit prompt after two seconds and when a panel takes the next press', () => {
  pressBack();
  tick(2000);
  expect(JSON.stringify(tree.toJSON())).not.toContain('再按一次退出，相机会断开');
  pressBack();
  expect(BackHandler.exitApp).not.toHaveBeenCalled();
  press('LUT 风格');
  pressBack();
  expect(tree.root.findAllByType(LutFlyout)).toHaveLength(0);
  expect(JSON.stringify(tree.toJSON())).not.toContain('再按一次退出，相机会断开');
  expect(BackHandler.exitApp).not.toHaveBeenCalled();
});

it('leaves on one back when nothing is connected', () => {
  act(() => tree.update(<CameraWorkspace {...props} state={{...state, active: false}}/>));
  pressBack();
  expect(BackHandler.exitApp).toHaveBeenCalledTimes(1);
  expect(JSON.stringify(tree.toJSON())).not.toContain('再按一次退出，相机会断开');
  expect(camera!.disconnect).not.toHaveBeenCalled();
});

it('lets the connection sheet own back and ignores back while another page covers capture', () => {
  press('LUT 风格');
  act(() => tree.update(<CameraWorkspace {...props} suspendBack/>));
  pressBack();
  expect(tree.root.findAllByType(LutFlyout)).toHaveLength(1);
  expect(BackHandler.exitApp).toHaveBeenCalledTimes(1);
  act(() => tree.update(<CameraWorkspace {...props} focused={false}/>));
  pressBack();
  expect(BackHandler.exitApp).toHaveBeenCalledTimes(2);
});

it('separates the timer and audio labels and lets them wrap instead of truncating', () => {
  const control = (label: string) => tree.root.findAllByProps({accessibilityLabel: label}).find(node => typeof node.props.style === 'function')!;
  const timer = control('定时 关');
  const audio = control('收音 关');
  let sideNode: renderer.ReactTestInstance | null = timer;
  while (sideNode && !(StyleSheet.flatten(sideNode.props.style)?.gap >= 8 && StyleSheet.flatten(sideNode.props.style)?.flexDirection === 'row')) sideNode = sideNode.parent;
  const side = StyleSheet.flatten(sideNode?.props.style);
  expect(side.flexDirection).toBe('row');
  expect(side.alignItems).toBe('center');
  expect(side.gap).toBeGreaterThanOrEqual(8);
  // Each pair spreads over its half of the dock instead of huddling at the edge.
  expect(side.flex).toBe(1);
  expect(side.justifyContent).toBe('space-evenly');
  expect(timer.findByType(Text).props.children).toBe('定时 关');
  expect(audio.findByType(Text).props.children).toBe('收音 关');
  expect(timer.findByType(Text).props.numberOfLines).toBe(2);
  expect(audio.findByType(Text).props.numberOfLines).toBe(2);
  expect(timer.findByType(Text).props.maxFontSizeMultiplier).toBe(1.3);
  const timerStyle = StyleSheet.flatten(timer.props.style({pressed: false}));
  expect(timerStyle.width).toBe(48);
  expect(timerStyle.minHeight).toBeGreaterThanOrEqual(48);
});

it('uses the dark in-app dialog for a missing microphone permission and offers app settings', async () => {
  jest.mocked(requestMicrophonePermission).mockResolvedValue(false);
  await act(async () => tree.root.findByProps({accessibilityLabel: '收音 关'}).props.onPress());
  expect(tree.root.findByProps({testID: 'microphone-confirm'})).toBeTruthy();
  expect(JSON.stringify(tree.toJSON())).toContain('没有麦克风权限');
  expect(camera!.setAudio).not.toHaveBeenCalled();

  press('暂不');
  expect(tree.root.findAllByProps({testID: 'microphone-confirm'})).toHaveLength(0);

  await act(async () => tree.root.findByProps({accessibilityLabel: '收音 关'}).props.onPress());
  await act(async () => tree.root.findByProps({accessibilityLabel: '去设置'}).props.onPress());
  expect(openMicrophoneSettings).toHaveBeenCalledTimes(1);
  expect(camera!.setAudio).not.toHaveBeenCalled();
});

it('names low storage first and opens the storage page from the shutter reason', () => {
  const onStorage = jest.fn();
  act(() => tree.update(<CameraWorkspace {...props} storageLow onStorage={onStorage}/>));
  press('拍摄照片');
  expect(camera!.captureStill).not.toHaveBeenCalled();
  expect(JSON.stringify(tree.toJSON())).toContain('手机存储空间不足，请先清理');
  press('去清理');
  expect(onStorage).toHaveBeenCalledTimes(1);
});
