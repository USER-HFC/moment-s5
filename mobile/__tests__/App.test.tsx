import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {jest, expect, it} from '@jest/globals';

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
