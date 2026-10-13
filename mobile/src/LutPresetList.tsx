import React from 'react';
import {StyleSheet} from 'react-native';
import {Button, Text} from 'react-native-paper';
import {LutItem} from './native';
import {theme} from './theme';

type Props = {
  luts: LutItem[];
  activeName: string | null;
  disabled: boolean;
  onSelect: (id: string) => Promise<void>;
};

export default function LutPresetList({luts, activeName, disabled, onSelect}: Props) {
  return <>
    {luts.some(lut => lut.builtIn) && <Text style={styles.note}>内置 Fuji 风格为非官方近似效果，适用于 SDR sRGB / Rec.709，建议使用相机标准照片风格。</Text>}
    {luts.map(lut => <Button key={lut.id} contentStyle={styles.touch} disabled={disabled}
      mode={activeName === lut.name ? 'contained-tonal' : 'text'}
      accessibilityLabel={`选择 LUT ${lut.builtIn ? '内置 · ' : ''}${lut.name}`}
      accessibilityHint={lut.builtIn ? '内置只读预设，作用于监看与渲染照片' : undefined}
      onPress={() => onSelect(lut.id)}>{lut.builtIn ? '内置 · ' : ''}{lut.name}</Button>)}
  </>;
}

const styles = StyleSheet.create({
  touch: {minHeight: 48},
  note: {color: theme.colors.onSurfaceVariant},
});
