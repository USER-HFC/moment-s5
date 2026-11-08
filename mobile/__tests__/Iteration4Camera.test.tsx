import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {AppState, BackHandler, Dimensions, Modal, StyleSheet} from 'react-native';
import {Text} from 'react-native-paper';
import {afterEach, beforeEach, expect, it, jest} from '@jest/globals';
import {countdownRing} from '../src/CountdownOverlay';
import {guideRect, shadeOutside} from '../src/referenceFrame';

jest.mock('react-native-safe-area-context', () => ({SafeAreaView: ({children}: any) => children}));
jest.mock('../src/native', () => ({camera: {capture: jest.fn(), captureStill: jest.fn(), focus: jest.fn(), setAudio: jest.fn(), disconnect: jest.fn()}}));
jest.mock('../src/microphonePermission', () => ({requestMicrophonePermission: jest.fn(async () => true)}));

import CameraWorkspace from '../src/CameraWorkspace';
import {camera, CameraState} from '../src/native';

const state: CameraState = {active: true, busy: false, ready: true, demo: true, lut: null};
const props = {state, preview: 'data:image/jpeg;base64,frame', buffered: 3, luts: [], onAlbum: jest.fn(), onLut: async () => {}, onImportLut: async () => {}, onRefresh: async () => {}, onConnect: async () => {}};
const originalWindow = Dimensions.get('window');
let tree: renderer.ReactTestRenderer;
const backHandlers: Array<() => boolean | null | undefined> = [];

beforeEach(() => {
  jest.useFakeTimers();
  jest.clearAllMocks();
  AppState.currentState = 'active';
  backHandlers.length = 0;
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    const wrapped = handler as () => boolean | null | undefined;
    backHandlers.push(wrapped);
    return {remove: () => { const index = backHandlers.lastIndexOf(wrapped); if (index >= 0) backHandlers.splice(index, 1); }};
  });
  jest.spyOn(BackHandler, 'exitApp').mockImplementation(() => undefined);
});
afterEach(() => {
  act(() => tree?.unmount());
  Dimensions.set({window: originalWindow, screen: originalWindow});
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
});

const press = (label: string) => act(() => {
  const nodes = tree.root.findAllByProps({accessibilityLabel: label});
  const target = nodes.find(node => typeof node.props.style === 'function') || nodes[0];
  target.props.onPress();
});
const pressBack = () => act(() => {
  const chain = [...backHandlers].reverse();
  let handled = false;
  for (const handler of chain) if (handler()) { handled = true; break; }
  if (!handled) BackHandler.exitApp();
});
const mount = (window: {width: number; height: number}) => {
  Dimensions.set({window: {...originalWindow, ...window}, screen: {...originalWindow, ...window}});
  act(() => { tree = renderer.create(<CameraWorkspace {...props}/>); });
};
const layoutFinder = (width: number, height: number) => act(() => {
  tree.root.findByProps({testID: 'viewfinder'}).props.onLayout({nativeEvent: {layout: {width, height, x: 0, y: 0}}});
});
const rectOf = (node: renderer.ReactTestInstance) => {
  const style = StyleSheet.flatten(node.props.style);
  return {left: style.left, top: style.top, width: style.width, height: style.height};
};
// View is a forwardRef around a host view, so a testID matches twice. Keep the outer one.
const labeled = (testID: string) => tree.root.findAllByProps({testID}).filter(node => node.parent?.props?.testID !== testID);

it('opens a flat reference panel, shows the ratio on the button, and lets back close it first', () => {
  mount({width: 360, height: 740});
  press('构图参考 关');
  const flyout = tree.root.findByProps({testID: 'reference-flyout'});
  expect(tree.root.findAllByType(Modal).some(node => node.props.visible)).toBe(false);
  const style = StyleSheet.flatten(flyout.props.style);
  expect(style.elevation).toBe(0);
  expect(style.shadowOpacity).toBeUndefined();
  expect(style.backgroundColor).toBe('#101210');
  for (const label of ['关闭构图参考', '构图参考 3:2', '构图参考 16:9', '构图参考 1:1', '构图参考 4:5']) {
    expect(tree.root.findByProps({accessibilityLabel: label}).props.accessibilityState.selected).toBe(label === '关闭构图参考');
  }
  const option = tree.root.findByProps({accessibilityLabel: '构图参考 3:2'});
  expect(StyleSheet.flatten(option.props.style({pressed: false})).minHeight).toBeGreaterThanOrEqual(48);
  press('定时 关');
  expect(tree.root.findAllByProps({testID: 'reference-flyout'})).toHaveLength(0);
  expect(tree.root.findByProps({testID: 'timer-flyout'})).toBeTruthy();
  press('构图参考 关');
  expect(tree.root.findAllByProps({testID: 'timer-flyout'})).toHaveLength(0);
  press('构图参考 3:2');
  expect(tree.root.findAllByProps({testID: 'reference-flyout'})).toHaveLength(0);
  const button = tree.root.findAllByProps({accessibilityLabel: '构图参考 3:2'}).find(node => typeof node.props.style === 'function')!;
  expect(button.findByType(Text).props.children).toBe('3:2');
  press('构图参考 3:2');
  pressBack();
  expect(tree.root.findAllByProps({testID: 'reference-flyout'})).toHaveLength(0);
  expect(button.findByType(Text).props.children).toBe('3:2');
  expect(JSON.stringify(tree.toJSON())).not.toContain('再按一次退出，相机会断开');
  expect(BackHandler.exitApp).not.toHaveBeenCalled();
});

it('pins the reference panel between the rail and the dock in landscape', () => {
  mount({width: 900, height: 400});
  act(() => tree.root.findByProps({testID: 'camera-tools'}).props.onLayout({nativeEvent: {layout: {width: 64, height: 400, x: 0, y: 0}}}));
  act(() => tree.root.findByProps({testID: 'camera-dock'}).props.onLayout({nativeEvent: {layout: {width: 120, height: 400, x: 0, y: 0}}}));
  press('构图参考 关');
  const flyout = StyleSheet.flatten(tree.root.findByProps({testID: 'reference-flyout'}).props.style);
  expect(flyout.left).toBe(72);
  expect(flyout.right).toBe(128);
  expect(flyout.top).toBe(8);
  expect(flyout.elevation).toBe(0);
  const option = tree.root.findByProps({accessibilityLabel: '构图参考 4:5'});
  expect(StyleSheet.flatten(option.props.style({pressed: false})).flexBasis).toBe(64);
  expect(StyleSheet.flatten(option.parent?.props.style).flexWrap).toBe('wrap');
});

it('dims outside a portrait 3:2 guide and draws the thirds inside it', () => {
  mount({width: 360, height: 740});
  layoutFinder(360, 640);
  const preview = () => StyleSheet.flatten(tree.root.findByProps({testID: 'preview-frame'}).props.style);
  const before = preview();
  const fullGrid = StyleSheet.flatten(tree.root.findByProps({testID: 'composition-grid'}).props.style);
  expect(fullGrid.left).toBe(0);
  expect(fullGrid.right).toBe(0);
  expect(fullGrid.top).toBe(0);
  expect(fullGrid.bottom).toBe(0);
  expect(tree.root.findAllByProps({testID: 'reference-shade'})).toHaveLength(0);
  press('构图参考 关');
  press('构图参考 3:2');
  expect(preview()).toEqual(before);
  const frame = preview();
  const guide = guideRect(frame.width, frame.height, '3:2');
  const reference = rectOf(tree.root.findByProps({testID: 'reference-frame'}));
  expect(reference).toEqual(guide);
  expect(StyleSheet.flatten(tree.root.findByProps({testID: 'reference-frame'}).props.style).backgroundColor).toBe('transparent');
  expect(guide.width).toBeGreaterThan(guide.height);
  expect(guide.height).toBeLessThan(frame.height);
  const shades = labeled('reference-shade').map(rectOf);
  expect(shades).toEqual(shadeOutside(frame.width, frame.height, guide));
  expect(shades).toHaveLength(2);
  expect(StyleSheet.flatten(labeled('reference-shade')[0].props.style).backgroundColor).toBe('#00000073');
  const grid = tree.root.findByProps({testID: 'composition-grid'});
  expect(rectOf(grid)).toEqual(guide);
  const marks = new Set<unknown>();
  const visit = (node: renderer.ReactTestInstance) => {
    const style = StyleSheet.flatten(node.props.style);
    if (typeof style?.left === 'string') marks.add(style.left);
    if (typeof style?.top === 'string') marks.add(style.top);
    node.children.forEach(child => { if (typeof child !== 'string') visit(child); });
  };
  visit(grid);
  expect([...marks]).toEqual(['33.33%', '66.67%']);
  expect(JSON.stringify(tree.toJSON())).toContain('3:2 参考');
});

it('dims the short sides in landscape and keeps a full-frame 3:2 guide clear', () => {
  mount({width: 900, height: 400});
  layoutFinder(760, 360);
  const frame = () => StyleSheet.flatten(tree.root.findByProps({testID: 'preview-frame'}).props.style);
  press('构图参考 关');
  press('构图参考 4:5');
  const preview = frame();
  const tall = guideRect(preview.width, preview.height, '4:5');
  expect(tall.height).toBeGreaterThan(tall.width);
  expect(tall.width).toBeLessThan(preview.width);
  expect(labeled('reference-shade').map(rectOf)).toEqual(shadeOutside(preview.width, preview.height, tall));
  expect(rectOf(tree.root.findByProps({testID: 'composition-grid'}))).toEqual(tall);
  expect(rectOf(tree.root.findByProps({testID: 'reference-frame'}))).toEqual(tall);
  press('构图参考 4:5');
  press('构图参考 3:2');
  const filled = guideRect(preview.width, preview.height, '3:2');
  expect(filled.width).toBeCloseTo(preview.width, 4);
  expect(filled.height).toBeCloseTo(preview.height, 4);
  expect(tree.root.findAllByProps({testID: 'reference-shade'})).toHaveLength(0);
  expect(rectOf(tree.root.findByProps({testID: 'composition-grid'}))).toEqual(filled);
  expect(frame()).toEqual(preview);
});

it('shows a large remaining-time ring that steps down with the seconds', () => {
  mount({width: 360, height: 740});
  const full = countdownRing(10, 10);
  expect(full.fraction).toBe(1);
  expect(full.dashOffset).toBeCloseTo(0, 4);
  expect(countdownRing(5, 10).fraction).toBeCloseTo(0.5, 4);
  expect(countdownRing(0, 10).dashOffset).toBeCloseTo(countdownRing(0, 10).circumference, 4);
  press('定时 关');
  press('定时 10 秒');
  press('开始倒计时');
  const ring = () => tree.root.findByProps({testID: 'countdown-ring'});
  const digit = () => tree.root.findByProps({testID: 'countdown'}).findByType(Text);
  expect(ring().props.strokeDashoffset).toBeCloseTo(0, 4);
  expect(ring().props.stroke).toBe('#D6F58B');
  expect(digit().props.children).toBe(10);
  expect(digit().props.accessibilityLabel).toBe('倒计时 10');
  const digitStyle = StyleSheet.flatten(digit().props.style);
  expect(digitStyle.fontWeight).toBe('700');
  expect(digitStyle.fontSize).toBeGreaterThanOrEqual(64);
  act(() => { jest.advanceTimersByTime(4000); });
  expect(digit().props.children).toBe(6);
  expect(ring().props.strokeDashoffset).toBeCloseTo(countdownRing(6, 10).dashOffset, 4);
  expect(ring().props.strokeDashoffset).toBeGreaterThan(0);
  press('取消定时');
  expect(tree.root.findAllByProps({testID: 'countdown'})).toHaveLength(0);
  act(() => { jest.advanceTimersByTime(10_000); });
  expect(camera!.captureStill).not.toHaveBeenCalled();
});
