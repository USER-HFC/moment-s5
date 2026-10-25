import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {afterEach, beforeEach, describe, expect, it, jest} from '@jest/globals';
import {AppState, NativeModules, PanResponder, StyleSheet, View} from 'react-native';

const mockHandlers = new Map<string, (event: unknown) => void>();
jest.mock('../src/native', () => {
  const {NativeModules: modules} = require('react-native');
  modules.MomentLumix = {setScopesEnabled: jest.fn()};
  return {camera: modules.MomentLumix, cameraEvents: {addListener: jest.fn((name: string, handler: (event: unknown) => void) => {
    mockHandlers.set(name, handler);
    return {remove: () => mockHandlers.delete(name)};
  })}};
});
jest.mock('react-native-safe-area-context', () => ({SafeAreaView: ({children}: {children: React.ReactNode}) => children}));

import ScopeToolbar from '../src/scopes/ScopeToolbar';
import ScopesOverlay, {SCOPE_CONTROLS_IDLE_MS, SCOPE_CONTROLS_REVEAL_MS} from '../src/scopes/ScopesOverlay';
import {changeScopePanel, useScopePanels} from '../src/scopes/useScopes';
import CameraWorkspace from '../src/CameraWorkspace';

function Harness({portrait = true, ratio = 1.5}: {portrait?: boolean; ratio?: number}) {
  const panels = useScopePanels();
  return <View><ScopeToolbar panels={panels} landscape={!portrait}/><ScopesOverlay panels={panels} bounds={{width: 375, height: 560}} active rotateClockwise={portrait} sourceAspectRatio={ratio}/></View>;
}

function event(rotation = 90) {
  return {version: 1, timestampUs: 1000, width: 160, height: 240, rotation, sourceAspectRatio: 1.5, demo: true, postLut: true,
    pixels: 38400, clipLow: 0, clipHigh: 0,
    histogram: Buffer.alloc(1024, 255).toString('base64'), waveform: Buffer.alloc(4096).toString('base64'),
    parade: Buffer.alloc(6144).toString('base64'), vectorscope: Buffer.alloc(4096).toString('base64')};
}

describe('scope overlays and native subscription lifecycle', () => {
  let tree: renderer.ReactTestRenderer | undefined;
  let appStateChanged: (state: string) => void;
  const api = NativeModules.MomentLumix;
  beforeEach(() => {
    jest.useFakeTimers();jest.clearAllMocks();mockHandlers.clear();
    AppState.currentState = 'active';
    changeScopePanel({type: 'closeAll'});
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_, listener: any) => {
      appStateChanged = listener;return {remove: jest.fn()};
    });
  });
  afterEach(() => {
    if (tree) act(() => tree!.unmount());
    tree = undefined;changeScopePanel({type: 'closeAll'});
    jest.clearAllTimers();jest.useRealTimers();jest.restoreAllMocks();
  });
  it('lets the picker open multiple cards and closes one while keeping analysis subscribed', () => {
    act(() => {tree = renderer.create(<Harness/>);});
    expect(api.setScopesEnabled).not.toHaveBeenCalledWith(true, true, 1.5);
    act(() => tree!.root.findByProps({accessibilityLabel: '示波器'}).props.onPress());
    act(() => tree!.root.findByProps({testID: 'scope-option-histogram'}).props.onPress());
    act(() => tree!.root.findByProps({testID: 'scope-option-waveform'}).props.onPress());
    expect(tree!.root.findByProps({testID: 'scope-panel-histogram'})).toBeTruthy();
    expect(tree!.root.findByProps({testID: 'scope-panel-waveform'})).toBeTruthy();
    expect(api.setScopesEnabled).toHaveBeenCalledWith(true, true, 1.5);
    const before = api.setScopesEnabled.mock.calls.length;
    act(() => tree!.root.findByProps({testID: 'scope-move-histogram'}).props.onPress());
    act(() => tree!.root.findByProps({testID: 'scope-close-histogram'}).props.onPress());
    expect(tree!.root.findAllByProps({testID: 'scope-panel-histogram'})).toHaveLength(0);
    expect(tree!.root.findByProps({testID: 'scope-panel-waveform'})).toBeTruthy();
    expect(api.setScopesEnabled.mock.calls).toHaveLength(before);
    act(() => tree!.root.findByProps({testID: 'scope-close-waveform'}).props.onPress());
    expect(mockHandlers.size).toBe(0);
    expect(api.setScopesEnabled).toHaveBeenLastCalledWith(false, true, 1.5);
  });
  it('uses transparent chart overlays with independent resize, accessible move and close controls', () => {
    act(() => {tree = renderer.create(<Harness/>);changeScopePanel({type: 'toggle', kind: 'histogram'});changeScopePanel({type: 'toggle', kind: 'waveform'});});
    const panel = () => StyleSheet.flatten(tree!.root.findByProps({testID: 'scope-panel-histogram'}).props.style);
    const waveform = () => StyleSheet.flatten(tree!.root.findByProps({testID: 'scope-panel-waveform'}).props.style);
    const before = panel(), other = waveform();
    expect(before.backgroundColor).toBeUndefined();expect(before.borderWidth).toBeUndefined();
    expect(tree!.root.findAllByProps({testID: 'scope-resize-histogram'})).toHaveLength(0);
    act(() => tree!.root.findByProps({testID: 'scope-move-histogram'}).props.onAccessibilityAction({nativeEvent: {actionName: 'activate'}}));
    expect(tree!.root.findByProps({testID: 'scope-move-histogram'}).props.accessibilityState.selected).toBe(true);
    expect(tree!.root.findAllByProps({testID: 'scope-close-waveform'})).toHaveLength(0);
    const glyph = tree!.root.findByProps({testID: 'scope-icon-enlarge'});
    expect(glyph.props.width).toBe(20);expect(glyph.props.xml).toContain('stroke-width="1.4"');
    act(() => tree!.root.findByProps({testID: 'scope-resize-histogram'}).props.onPress());
    expect(panel().width).toBeGreaterThan(before.width);
    expect(waveform().width).toBe(other.width);expect(waveform().height).toBe(other.height);
    expect(tree!.root.findByProps({accessibilityLabel: '缩小RGB 直方图'})).toBeTruthy();
    const handle = tree!.root.findByProps({testID: 'scope-move-histogram'});
    const touch = StyleSheet.flatten(handle.props.style);expect(touch.width).toBeGreaterThanOrEqual(48);expect(touch.height).toBeGreaterThanOrEqual(48);
    act(() => handle.props.onAccessibilityAction({nativeEvent: {actionName: 'down'}}));
    const resize = tree!.root.findByProps({testID: 'scope-resize-histogram'});
    expect(StyleSheet.flatten(resize.props.style).height).toBeGreaterThanOrEqual(48);
    act(() => resize.props.onPress());expect(panel().width).toBe(before.width);
    act(() => tree!.root.findByProps({testID: 'scope-close-histogram'}).props.onPress());
    expect(tree!.root.findAllByProps({testID: 'scope-panel-histogram'})).toHaveLength(0);
    expect(tree!.root.findByProps({testID: 'scope-panel-waveform'})).toBeTruthy();
    expect(JSON.stringify(tree!.toJSON())).not.toContain('RGB 触底');
  });
  it('decodes portrait frames, marks stalled frames and suspends analysis in the background', () => {
    act(() => {tree = renderer.create(<Harness/>);changeScopePanel({type: 'toggle', kind: 'waveform'});});
    act(() => mockHandlers.get('cameraScopes')!(event(0)));
    expect(tree!.root.findAllByProps({accessibilityLabel: '亮度波形 实时图表'})).toHaveLength(0);
    act(() => mockHandlers.get('cameraScopes')!(event()));
    expect(tree!.root.findByProps({accessibilityLabel: '亮度波形 实时图表'})).toBeTruthy();
    act(() => jest.advanceTimersByTime(1500));
    expect(JSON.stringify(tree!.toJSON())).toContain('取景暂停');
    act(() => appStateChanged('background'));
    expect(api.setScopesEnabled).toHaveBeenLastCalledWith(false, true, 1.5);
    expect(mockHandlers.size).toBe(0);
    act(() => appStateChanged('active'));
    expect(api.setScopesEnabled).toHaveBeenLastCalledWith(true, true, 1.5);
  });
  it('clamps an actual move gesture and keeps the other chart unchanged', () => {
    const gestures: any[] = [];
    const create = PanResponder.create;
    jest.spyOn(PanResponder, 'create').mockImplementation(config => {gestures.push(config);return create(config);});
    act(() => {tree = renderer.create(<Harness/>);changeScopePanel({type: 'toggle', kind: 'histogram'});changeScopePanel({type: 'toggle', kind: 'waveform'});});
    const panel = () => StyleSheet.flatten(tree!.root.findByProps({testID: 'scope-panel-histogram'}).props.style);
    const other = () => StyleSheet.flatten(tree!.root.findByProps({testID: 'scope-panel-waveform'}).props.style);
    const before = other();
    const drag = gestures[0];
    expect(drag.onMoveShouldSetPanResponder({}, {dx: 10, dy: 0})).toBe(true);
    expect(drag.onMoveShouldSetPanResponderCapture({}, {dx: 10, dy: 0})).toBe(true);
    // Pressable owns its responder handlers. Drag capture must live on a parent View.
    expect(typeof tree!.root.findByProps({testID: 'scope-move-histogram'}).parent!.props.onMoveShouldSetResponderCapture).toBe('function');
    act(() => drag.onPanResponderGrant());
    act(() => drag.onPanResponderMove({}, {dx: 10_000, dy: 10_000}));
    act(() => drag.onPanResponderRelease({}, {dx: 10_000, dy: 10_000}));
    const style = panel();
    expect(style.transform[0].translateX.__getValue() + style.width).toBeLessThanOrEqual(367);
    expect(style.transform[1].translateY.__getValue() + style.height).toBeLessThanOrEqual(552);
    expect(other().width).toBe(before.width);expect(other().height).toBe(before.height);
    expect(other().transform[0].translateX.__getValue()).toBe(before.transform[0].translateX.__getValue());
  });
  it('keeps the empty-state action clear and restores selected scopes when the feed returns', () => {
    const state = {active: false, busy: false, ready: false, demo: false, lut: null};
    const props = {state, buffered: 0, luts: [], onLut: async () => {}, onAlbum: () => {}, onImportLut: async () => {}, onRefresh: async () => {}, onConnect: async () => {}};
    act(() => {tree = renderer.create(<CameraWorkspace {...props}/>);changeScopePanel({type: 'toggle', kind: 'waveform'});});
    act(() => tree!.root.findByProps({testID: 'viewfinder'}).props.onLayout({nativeEvent: {layout: {width: 278, height: 416}}}));
    expect(tree!.root.findByProps({accessibilityLabel: '体验演示'})).toBeTruthy();
    expect(tree!.root.findAllByProps({testID: 'scope-panel-waveform'})).toHaveLength(0);
    expect(mockHandlers.size).toBe(0);
    act(() => tree!.update(<CameraWorkspace {...props} state={{...state, active: true, ready: true}} preview="data:image/jpeg;base64,frame"/>));
    expect(tree!.root.findByProps({testID: 'scope-panel-waveform'})).toBeTruthy();
    expect(api.setScopesEnabled).toHaveBeenLastCalledWith(true, true, 1.5);
    act(() => tree!.update(<CameraWorkspace {...props}/>));
    expect(mockHandlers.size).toBe(0);
  });
  it('reserves actual HUD measurements for scopes and retains all four corners after the last scope closes', () => {
    const state = {active: true, busy: false, ready: true, demo: false, lut: null, exposure: 'ISO 640     f/4.0     1/80', phoneBattery: {percent: 37}};
    const props = {state, preview: 'data:image/jpeg;base64,frame', buffered: 3, luts: [], onLut: async () => {}, onAlbum: () => {}, onImportLut: async () => {}, onRefresh: async () => {}, onConnect: async () => {}};
    act(() => {tree = renderer.create(<CameraWorkspace {...props}/>);});
    act(() => {
      tree!.root.findByProps({testID: 'viewfinder'}).props.onLayout({nativeEvent: {layout: {width: 360, height: 540}}});
      tree!.root.findByProps({testID: 'hud-top'}).props.onLayout({nativeEvent: {layout: {height: 60}}});
      tree!.root.findByProps({testID: 'hud-bottom'}).props.onLayout({nativeEvent: {layout: {height: 80}}});
      changeScopePanel({type: 'toggle', kind: 'waveform'});
    });
    expect(tree!.root.findByType(ScopesOverlay).props.bounds.insets).toEqual({top: 84, bottom: 104, left: 16, right: 16});
    act(() => tree!.root.findByProps({testID: 'scope-close-waveform'}).props.onPress());
    expect(tree!.root.findAllByProps({testID: 'scopes-overlay'})).toHaveLength(0);
    for (const testID of ['hud-source', 'hud-batteries', 'hud-exposure', 'hud-capture']) expect(tree!.root.findByProps({testID})).toBeTruthy();
    expect(JSON.stringify(tree!.toJSON())).toContain('ISO 640');
  });
  it('preserves the session when leaving the camera and applies the new preview orientation on return', () => {
    act(() => {tree = renderer.create(<Harness/>);changeScopePanel({type: 'toggle', kind: 'parade'});changeScopePanel({type: 'toggle', kind: 'vectorscope'});});
    act(() => tree!.unmount());tree = undefined;
    expect(mockHandlers.size).toBe(0);
    expect(api.setScopesEnabled).toHaveBeenLastCalledWith(false, true, 1.5);
    act(() => {tree = renderer.create(<Harness portrait={false}/>);});
    expect(tree!.root.findByProps({testID: 'scope-panel-parade'})).toBeTruthy();
    expect(tree!.root.findByProps({testID: 'scope-panel-vectorscope'})).toBeTruthy();
    expect(api.setScopesEnabled).toHaveBeenLastCalledWith(true, false, 1.5);
  });
  it('reconfigures native cropping when the preview aspect ratio changes and ignores old crop data', () => {
    act(() => {tree = renderer.create(<Harness/>);changeScopePanel({type: 'toggle', kind: 'waveform'});});
    act(() => tree!.update(<Harness ratio={16 / 9}/>));
    expect(api.setScopesEnabled).toHaveBeenLastCalledWith(true, true, 16 / 9);
    act(() => mockHandlers.get('cameraScopes')!(event()));
    expect(tree!.root.findAllByProps({accessibilityLabel: '亮度波形 实时图表'})).toHaveLength(0);
    act(() => mockHandlers.get('cameraScopes')!({...event(), sourceAspectRatio: 16 / 9}));
    expect(tree!.root.findByProps({accessibilityLabel: '亮度波形 实时图表'})).toBeTruthy();
  });
  it('keeps real camera scopes subscribed while selecting built-in and imported LUTs', async () => {
    const onLut = jest.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined);
    const state = {active: true, busy: false, ready: true, demo: true, lut: null as string | null};
    const luts = [
      {id: 'builtin:acros', name: 'Fuji 风格 · Acros', size: 970721, builtIn: true, readOnly: true},
      {id: 'imported.cube', name: '我的 LUT', size: 1024},
    ];
    const props = {state, preview: 'data:image/jpeg;base64,frame', buffered: 3, luts, onLut, onAlbum: () => {}, onImportLut: async () => {}, onRefresh: async () => {}, onConnect: async () => {}};
    act(() => {tree = renderer.create(<CameraWorkspace {...props}/>);});
    act(() => tree!.root.findByProps({testID: 'viewfinder'}).props.onLayout({nativeEvent: {layout: {width: 375, height: 560}}}));
    act(() => tree!.root.findByProps({accessibilityLabel: '示波器'}).props.onPress());
    act(() => tree!.root.findByProps({testID: 'scope-option-waveform'}).props.onPress());
    act(() => tree!.root.findByProps({accessibilityLabel: 'LUT 风格'}).props.onPress());
    const before = api.setScopesEnabled.mock.calls.length;
    for (const lut of luts) {
      const button = tree!.root.findByProps({accessibilityLabel: `选择 LUT ${lut.name.replace('Fuji 风格 · ', '')}`});
      await act(async () => {await button.props.onPress();});
      expect(onLut).toHaveBeenLastCalledWith(lut.id);
      act(() => tree!.update(<CameraWorkspace {...props} state={{...state, lut: lut.name}}/>));
      expect(tree!.root.findByProps({testID: 'scope-panel-waveform'})).toBeTruthy();
      expect(mockHandlers.has('cameraScopes')).toBe(true);
      expect(api.setScopesEnabled.mock.calls).toHaveLength(before);
    }
    act(() => tree!.update(<CameraWorkspace {...props} state={{...state, active: false}}/>));
    expect(mockHandlers.size).toBe(0);
    expect(api.setScopesEnabled.mock.calls.at(-1)?.[0]).toBe(false);
  });
  it('hides chart controls after idle, keeps dragging, and reveals them from a long press or an accessibility action', () => {
    const gestures: any[] = [];
    const create = PanResponder.create;
    jest.spyOn(PanResponder, 'create').mockImplementation(config => {gestures.push(config); return create(config);});
    act(() => {tree = renderer.create(<Harness/>); changeScopePanel({type: 'toggle', kind: 'histogram'});});
    const panel = () => StyleSheet.flatten(tree!.root.findByProps({testID: 'scope-panel-histogram'}).props.style);
    expect(tree!.root.findByProps({testID: 'scope-move-histogram'})).toBeTruthy();
    act(() => jest.advanceTimersByTime(SCOPE_CONTROLS_IDLE_MS - 1));
    expect(tree!.root.findByProps({testID: 'scope-move-histogram'})).toBeTruthy();
    act(() => tree!.root.findByProps({testID: 'scope-move-histogram'}).props.onPress());
    act(() => jest.advanceTimersByTime(SCOPE_CONTROLS_IDLE_MS - 1));
    expect(tree!.root.findByProps({testID: 'scope-resize-histogram'})).toBeTruthy();
    act(() => jest.advanceTimersByTime(1));
    expect(tree!.root.findAllByProps({testID: 'scope-move-histogram'})).toHaveLength(0);
    expect(tree!.root.findAllByProps({testID: 'scope-resize-histogram'})).toHaveLength(0);
    expect(tree!.root.findAllByProps({testID: 'scope-close-histogram'})).toHaveLength(0);
    const reveal = () => tree!.root.findByProps({testID: 'scope-reveal-histogram'});
    expect(reveal().props.delayLongPress).toBe(SCOPE_CONTROLS_REVEAL_MS);
    expect(typeof reveal().parent!.props.onMoveShouldSetResponderCapture).toBe('function');
    act(() => changeScopePanel({type: 'move', kind: 'histogram', position: {x: 0, y: 0}}));
    const startX = panel().transform[0].translateX.__getValue();
    const drag = gestures[0];
    act(() => drag.onPanResponderGrant());
    act(() => drag.onPanResponderMove({}, {dx: 40, dy: 24}));
    act(() => drag.onPanResponderRelease({}, {dx: 40, dy: 24}));
    expect(panel().transform[0].translateX.__getValue()).toBeGreaterThan(startX);
    expect(tree!.root.findAllByProps({testID: 'scope-move-histogram'})).toHaveLength(0);
    const width = panel().width;
    act(() => reveal().props.onAccessibilityAction({nativeEvent: {actionName: 'resize'}}));
    expect(panel().width).toBeGreaterThan(width);
    expect(tree!.root.findAllByProps({testID: 'scope-move-histogram'})).toHaveLength(0);
    act(() => reveal().props.onAccessibilityAction({nativeEvent: {actionName: 'down'}}));
    act(() => reveal().props.onAccessibilityAction({nativeEvent: {actionName: 'activate'}}));
    expect(tree!.root.findByProps({testID: 'scope-move-histogram'})).toBeTruthy();
    expect(tree!.root.findByProps({testID: 'scope-resize-histogram'})).toBeTruthy();
    expect(tree!.root.findByProps({testID: 'scope-close-histogram'})).toBeTruthy();
    act(() => jest.advanceTimersByTime(SCOPE_CONTROLS_IDLE_MS));
    expect(tree!.root.findAllByProps({testID: 'scope-close-histogram'})).toHaveLength(0);
    act(() => reveal().props.onLongPress());
    expect(tree!.root.findByProps({accessibilityLabel: '关闭RGB 直方图'})).toBeTruthy();
    act(() => jest.advanceTimersByTime(SCOPE_CONTROLS_IDLE_MS));
    act(() => reveal().props.onAccessibilityAction({nativeEvent: {actionName: 'close'}}));
    expect(tree!.root.findAllByProps({testID: 'scope-panel-histogram'})).toHaveLength(0);
  });
});
