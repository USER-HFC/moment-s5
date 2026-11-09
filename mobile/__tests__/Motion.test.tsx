import {afterEach, expect, it, jest} from '@jest/globals';
import React from 'react';
import {StyleSheet, Text, View} from 'react-native';
import renderer, {act} from 'react-test-renderer';
import * as Reanimated from 'react-native-reanimated';
import {Presence, Segmented} from '../src/ui';
import ShutterButton from '../src/ShutterButton';

// The Reanimated mock finishes every animation at once. These tests hold an exit open to look at it mid-way.
function holdAnimations() {
  const timing = jest.spyOn(Reanimated, 'withTiming').mockImplementation(((value: number) => value) as never);
  const spring = jest.spyOn(Reanimated, 'withSpring').mockImplementation(((value: number) => value) as never);
  return () => { timing.mockRestore(); spring.mockRestore(); };
}

afterEach(() => { jest.restoreAllMocks(); });

// The animated host view Presence renders (not the Presence element itself, which also carries the testID).
const wrapperOf = (tree: renderer.ReactTestRenderer) =>
  tree.root.findAll(node => node.props.testID === 'panel' && typeof node.type === 'string')[0];

it('stops taking touches and leaves the accessibility tree the moment an exit starts', () => {
  const release = holdAnimations();
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<Presence testID="panel" visible><Text>选项</Text></Presence>); });
  expect(wrapperOf(tree).props.pointerEvents).toBe('auto');
  act(() => tree.update(<Presence testID="panel" visible={false}><Text>选项</Text></Presence>));
  // Still on screen (the exit has not finished), but it can no longer swallow a tap or be read.
  const leaving = wrapperOf(tree);
  expect(leaving).toBeTruthy();
  expect(leaving.props.pointerEvents).toBe('none');
  expect(leaving.props.accessibilityElementsHidden).toBe(true);
  expect(leaving.props.importantForAccessibility).toBe('no-hide-descendants');
  release();
});

it('unmounts after the exit and reports it once', () => {
  const onExited = jest.fn();
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<Presence testID="panel" visible onExited={onExited}><Text>选项</Text></Presence>); });
  act(() => tree.update(<Presence testID="panel" visible={false} onExited={onExited}><Text>选项</Text></Presence>));
  expect(JSON.stringify(tree.toJSON())).not.toContain('选项');
  expect(onExited).toHaveBeenCalledTimes(1);
});

it('does not report an exit for something that was never shown', () => {
  const onExited = jest.fn();
  act(() => { renderer.create(<Presence visible={false} onExited={onExited}><Text>选项</Text></Presence>); });
  expect(onExited).not.toHaveBeenCalled();
});

it('comes back if shown again while leaving', () => {
  const release = holdAnimations();
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<Presence testID="panel" visible><Text>选项</Text></Presence>); });
  act(() => tree.update(<Presence testID="panel" visible={false}><Text>选项</Text></Presence>));
  act(() => tree.update(<Presence testID="panel" visible><Text>选项</Text></Presence>));
  expect(wrapperOf(tree).props.pointerEvents).toBe('auto');
  release();
});

it('morphs the shutter disc into the red stop square during a countdown', () => {
  const size = (tree: renderer.ReactTestRenderer) => StyleSheet.flatten(tree.root.findAll(node => node.props.testID === 'shutter-disc' && typeof node.type !== 'string')[0].props.style);
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<ShutterButton accessibilityLabel="拍摄照片" disabled={false} waiting={false} onPress={() => {}}/>); });
  expect(size(tree)).toMatchObject({width: 64, height: 64, borderRadius: 32});
  act(() => { tree = renderer.create(<ShutterButton accessibilityLabel="取消定时" disabled={false} waiting onPress={() => {}}/>); });
  expect(size(tree)).toMatchObject({width: 28, height: 28, borderRadius: 6});
});

it('draws one sliding pill for a single choice and per-segment fills for several', () => {
  const segments = [{value: 'a', label: '关', selected: false}, {value: 'b', label: '3:2', selected: true}];
  let tree!: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<View><Segmented testID="choice" segments={segments} onSelect={() => {}}/></View>); });
  expect(tree.root.findAllByProps({testID: 'choice-pill'}).length).toBeGreaterThan(0);
  act(() => { tree = renderer.create(<View><Segmented testID="many" role="checkbox" segments={segments} onSelect={() => {}}/></View>); });
  expect(tree.root.findAllByProps({testID: 'many-pill'})).toHaveLength(0);
  const checked = tree.root.findAll(node => node.props.accessibilityRole === 'checkbox' && typeof node.type !== 'string').map(node => node.props.accessibilityState.checked);
  expect(checked).toContain(true);
});
