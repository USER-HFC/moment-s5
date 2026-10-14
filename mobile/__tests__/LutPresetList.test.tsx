import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {jest, expect, it} from '@jest/globals';
import {Pressable} from 'react-native';
import {PaperProvider, Text} from 'react-native-paper';
import LutPresetList, {lutDisplayName} from '../src/LutPresetList';
import {LutItem} from '../src/native';

const manifest = require('../android/app/src/main/assets/luts/manifest.json');
const builtIns: LutItem[] = manifest.presets.map((preset: {id: string; name: string; bytes: number}) => ({
  id: preset.id, name: preset.name, size: preset.bytes, builtIn: true, readOnly: true,
}));
const imported: LutItem = {id: 'my-look.cube', name: '我的 LUT', size: 2048};

it('lists original color first, all read-only built-ins and imports with concise selected rows', async () => {
  const onSelect = jest.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined);
  let tree: renderer.ReactTestRenderer;
  await act(async () => {tree = renderer.create(<PaperProvider><LutPresetList
    luts={[...builtIns, imported]} activeName={builtIns[0].name} disabled={false} onSelect={onSelect}/></PaperProvider>);});
  const buttons = tree!.root.findAllByType(Pressable);
  expect(builtIns).toHaveLength(8);
  expect(buttons).toHaveLength(10);
  expect(buttons[0].props.accessibilityLabel).toBe('选择 LUT 原色');
  await act(async () => {await buttons[0].props.onPress();});
  expect(onSelect).toHaveBeenLastCalledWith('off');
  for (const [index, lut] of builtIns.entries()) {
    const button = buttons[index + 1];
    expect(button.props.accessibilityLabel).toBe(`选择 LUT ${lutDisplayName(lut.name)}`);
    expect(button.props.accessibilityHint).toContain('只读');
    expect(button.props.accessibilityState.selected).toBe(index === 0);
    await act(async () => {await button.props.onPress();});
    expect(onSelect).toHaveBeenLastCalledWith(lut.id);
  }
  expect(buttons[9].props.accessibilityLabel).toBe('选择 LUT 我的 LUT');
  expect(buttons[9].props.accessibilityHint).toBeUndefined();
  await act(async () => {await buttons[9].props.onPress();});
  expect(onSelect).toHaveBeenLastCalledWith(imported.id);
  expect(tree!.root.findAllByType(Text).some(node => node.props.children === '内置 Fuji 风格（非官方）')).toBe(true);
  act(() => tree!.unmount());
});

it('keeps original color, built-in and imported selections disabled while busy', async () => {
  let tree: renderer.ReactTestRenderer;
  await act(async () => {tree = renderer.create(<PaperProvider><LutPresetList
    luts={[builtIns[0], imported]} activeName={null} disabled onSelect={async () => {}}/></PaperProvider>);});
  const rows = tree!.root.findAllByType(Pressable);
  expect(rows).toHaveLength(3);
  expect(rows.every(button => button.props.disabled)).toBe(true);
  expect(rows[0].props.accessibilityState.selected).toBe(true);
  act(() => tree!.unmount());
});
