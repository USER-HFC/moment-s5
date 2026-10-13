import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {jest, expect, it} from '@jest/globals';
import {Button, PaperProvider, Text} from 'react-native-paper';
import LutPresetList from '../src/LutPresetList';
import {LutItem} from '../src/native';

const manifest = require('../android/app/src/main/assets/luts/manifest.json');
const builtIns: LutItem[] = manifest.presets.map((preset: {id: string; name: string; bytes: number}) => ({
  id: preset.id, name: preset.name, size: preset.bytes, builtIn: true, readOnly: true,
}));
const imported: LutItem = {id: 'my-look.cube', name: '我的 LUT', size: 2048};

it('lists all bundled presets as 内置 and selects them through the same callback as imports', async () => {
  const onSelect = jest.fn<(id: string) => Promise<void>>().mockResolvedValue(undefined);
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<PaperProvider><LutPresetList
    luts={[...builtIns, imported]} activeName={builtIns[0].name} disabled={false} onSelect={onSelect}/></PaperProvider>); });
  const buttons = tree!.root.findAllByType(Button);
  expect(builtIns).toHaveLength(8);
  expect(buttons).toHaveLength(9);
  for (const [index, lut] of builtIns.entries()) {
    expect(buttons[index].props.accessibilityLabel).toBe(`选择 LUT 内置 · ${lut.name}`);
    expect(buttons[index].props.accessibilityHint).toContain('只读');
    expect(buttons[index].props.children.join('')).toBe(`内置 · ${lut.name}`);
    await act(async () => { await buttons[index].props.onPress(); });
    expect(onSelect).toHaveBeenLastCalledWith(lut.id);
  }
  expect(buttons[0].props.mode).toBe('contained-tonal');
  expect(buttons[1].props.mode).toBe('text');
  expect(buttons[8].props.accessibilityLabel).toBe('选择 LUT 我的 LUT');
  expect(buttons[8].props.accessibilityHint).toBeUndefined();
  expect(buttons[8].props.children.join('')).toBe('我的 LUT');
  await act(async () => { await buttons[8].props.onPress(); });
  expect(onSelect).toHaveBeenLastCalledWith(imported.id);
  expect(tree!.root.findAllByType(Text).some(node =>
    typeof node.props.children === 'string' && node.props.children.includes('非官方近似'))).toBe(true);
  act(() => tree!.unmount());
});

it('keeps built-in and imported selections disabled while the camera is busy', async () => {
  let tree: renderer.ReactTestRenderer;
  await act(async () => { tree = renderer.create(<PaperProvider><LutPresetList
    luts={[builtIns[0], imported]} activeName={null} disabled onSelect={async () => {}}/></PaperProvider>); });
  expect(tree!.root.findAllByType(Button).every(button => button.props.disabled)).toBe(true);
  act(() => tree!.unmount());
});
