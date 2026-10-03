import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {jest, expect, it} from '@jest/globals';
import {Dimensions, StyleSheet} from 'react-native';

jest.mock('react-native-document-picker', () => ({types: {allFiles: '*/*'}, pickSingle: jest.fn(), isCancel: () => false}));
jest.mock('react-native-safe-area-context', () => { const React = require('react'); const Context = React.createContext({top: 0, right: 0, bottom: 0, left: 0}); return {SafeAreaProvider: ({children}: any) => React.createElement(Context.Provider, {value: {top: 0, right: 0, bottom: 0, left: 0}}, children), SafeAreaView: ({children}: any) => children, SafeAreaInsetsContext: Context, useSafeAreaInsets: () => ({top: 0, right: 0, bottom: 0, left: 0})}; });

import App from '../App';

it('opens the camera workspace directly', async () => {
  jest.useFakeTimers();
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<App/>); });
  expect(tree!.root.findByProps({testID: 'camera-workspace'})).toBeTruthy();
  expect(tree!.root.findByProps({accessibilityLabel: '动态照片'})).toBeTruthy();
  expect(tree!.root.findByProps({accessibilityLabel: '拍照到相机'})).toBeTruthy();
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
    expect(tree!.root.findByProps({testID: 'camera-tools'})).toBeTruthy();
    expect(tree!.root.findByProps({accessibilityLabel: '动态照片'})).toBeTruthy();
    expect(tree!.root.findByProps({accessibilityLabel: '定时'})).toBeTruthy();
    expect(tree!.root.findByProps({accessibilityLabel: '自动对焦'})).toBeTruthy();
    expect(tree!.root.findByProps({testID: 'preview-frame'})).toBeTruthy();
    expect(tree!.root.findAllByProps({testID: 'camera-modes'})).toHaveLength(0);
    expect(tree!.root.findByProps({testID: 'camera-dock'})).toBeTruthy();
    const bodyStyle = StyleSheet.flatten(tree!.root.findByProps({testID: 'camera-body'}).props.style);
    if (size.width > size.height) expect(bodyStyle.flexDirection).toBe('row');
    else expect(bodyStyle.flexDirection).not.toBe('row');
    act(() => tree!.unmount());
    jest.clearAllTimers();
  }
  Dimensions.set({window: original, screen: original});
  jest.useRealTimers();
});
