import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {afterEach, beforeEach, describe, expect, it, jest} from '@jest/globals';
import {AppState, NativeModules, View} from 'react-native';

const mockHandlers = new Map<string, (event: unknown) => void>();
jest.mock('../src/native', () => {
  const {NativeModules: modules} = require('react-native');
  modules.MomentLumix = {setScopesEnabled: jest.fn()};
  return {cameraEvents: {addListener: jest.fn((name: string, handler: (event: unknown) => void) => {
    mockHandlers.set(name, handler);
    return {remove: () => mockHandlers.delete(name)};
  })}};
});
jest.mock('react-native-safe-area-context', () => ({SafeAreaView: ({children}: {children: React.ReactNode}) => children}));

import ScopeToolbar from '../src/scopes/ScopeToolbar';
import ScopesOverlay from '../src/scopes/ScopesOverlay';
import {changeScopePanel, useScopePanels} from '../src/scopes/useScopes';

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
    act(() => tree!.root.findByProps({testID: 'scope-close-histogram'}).props.onPress());
    expect(tree!.root.findAllByProps({testID: 'scope-panel-histogram'})).toHaveLength(0);
    expect(tree!.root.findByProps({testID: 'scope-panel-waveform'})).toBeTruthy();
    expect(api.setScopesEnabled.mock.calls).toHaveLength(before);
    act(() => tree!.root.findByProps({testID: 'scope-close-waveform'}).props.onPress());
    expect(mockHandlers.size).toBe(0);
    expect(api.setScopesEnabled).toHaveBeenLastCalledWith(false, true, 1.5);
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
});
