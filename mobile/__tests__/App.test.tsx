import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {jest, expect, it} from '@jest/globals';
import {Dimensions, ScrollView, StyleSheet} from 'react-native';

jest.mock('react-native-document-picker', () => ({types: {allFiles: '*/*'}, pickSingle: jest.fn(), isCancel: () => false}));
jest.mock('react-native-safe-area-context', () => { const React = require('react'); const Context = React.createContext({top: 0, right: 0, bottom: 0, left: 0}); return {SafeAreaProvider: ({children}: any) => React.createElement(Context.Provider, {value: {top: 0, right: 0, bottom: 0, left: 0}}, children), SafeAreaView: ({children}: any) => children, SafeAreaInsetsContext: Context, useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0})}; });

import App from '../App';

it('renders the four cross-platform workspace entries', async () => {
  jest.useFakeTimers();
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<App/>); });
  const PaperText = require('react-native-paper').Text;
  const text = tree!.root.findAllByType(PaperText).map((node: any) => node.props.children).flat().join(' ');
  expect(text).toContain('监看');
  expect(text).toContain('瞬间 Lumix');
  expect(text).not.toContain('瞬间 S5');
  expect(text).toContain('动态照片');
  act(() => tree!.unmount());
  jest.clearAllTimers();
  jest.useRealTimers();
});

it('keeps the camera workspace usable at phone portrait and landscape sizes', async () => {
  jest.useFakeTimers();
  const original = Dimensions.get('window');
  for (const size of [{width: 375, height: 812}, {width: 1920, height: 1080}]) {
    Dimensions.set({window: {...original, ...size}, screen: {...original, ...size}});
    let tree: renderer.ReactTestRenderer;
    await act(async () => { tree = renderer.create(<App/>); });
    const monitor = tree!.root.findAllByProps({accessibilityLabel: '监看'})[0];
    act(() => monitor.props.onPress());
    const scroll = tree!.root.findAllByType(ScrollView).find((node: any) => node.props.nestedScrollEnabled);
    expect(scroll).toBeTruthy();
    const previewSurface = tree!.root.findAllByProps({elevation: 1})[0];
    const previewHost = previewSurface.parent!;
    const previewStyle = StyleSheet.flatten(previewHost.props.style);
    if (size.width < 600) expect(previewStyle.height).toBeCloseTo(210, 5);
    else expect(previewStyle.flex).toBe(1);
    act(() => tree!.unmount());
    jest.clearAllTimers();
  }
  Dimensions.set({window: original, screen: original});
  jest.useRealTimers();
});
