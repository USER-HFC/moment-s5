import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import {LutItem} from './native';
import {ui} from './theme';
import CameraIcon from './CameraIcon';
import {lutDisplayName} from './lutName';

export {lutDisplayName};
const STRIPS: Record<string, string[]> = {
  off: ['#E2D3B1', '#97AF99', '#4B7676', '#294343'],
  acros: ['#F0F0EB', '#ACACA7', '#686862', '#282823'],
  eterna: ['#CBC2A7', '#A4A995', '#5F7771', '#3A4948'],
  velvia: ['#EFBA77', '#B4C65C', '#439283', '#254F63'],
  astia: ['#EBD4BD', '#B7BBA2', '#7A9F9C', '#445B68'],
  'classic-chrome': ['#DCC6A5', '#AEA997', '#7E9295', '#404D5A'],
  'classic-negative': ['#E1B58D', '#A3AB85', '#698E91', '#344856'],
  'pro-neg': ['#DDC5B3', '#B7B59D', '#829E97', '#4E656A'],
};
function strip(id: string) {return Object.entries(STRIPS).find(([key]) => id.includes(key))?.[1] || ['#D8C5A2', '#A5AA88', '#6E8D8C', '#374F5C'];}
type Props = {luts: LutItem[]; activeName: string | null; disabled: boolean; onSelect: (id: string) => Promise<void>;
  /** Narrow rows for the side flyout, so most of the viewfinder stays visible. */
  compact?: boolean};

export default function LutPresetList({luts, activeName, disabled, onSelect, compact = false}: Props) {
  const groups = [
    {title: '原色', items: [{id: 'off', name: '原色', size: 0}] as LutItem[]},
    {title: compact ? '内置（非官方）' : '内置 Fuji 风格（非官方）', items: luts.filter(lut => lut.builtIn)},
    {title: '已导入', items: luts.filter(lut => !lut.builtIn)},
  ];
  return <>{groups.map(group => group.items.length > 0 && <View key={group.title} style={styles.group}>
    {group.title !== '原色' && <Text style={styles.section}>{group.title}</Text>}
    {group.items.map(lut => {
      const selected = lut.id === 'off' ? !activeName : activeName === lut.name;
      return <Pressable key={lut.id} accessibilityRole="button" accessibilityLabel={`选择 LUT ${lutDisplayName(lut.name)}`}
        accessibilityHint={lut.builtIn ? '内置只读预设，作用于监看与渲染照片' : undefined}
        accessibilityState={{selected, disabled}} disabled={disabled} onPress={() => onSelect(lut.id)}
        style={({pressed}) => [styles.row, compact && styles.rowCompact, selected && styles.selected, pressed && styles.pressed, disabled && styles.disabled]}>
        <View accessible={false} style={[styles.swatch, compact && styles.swatchCompact]}>{strip(lut.id).map((color, index) => <View key={index} style={[styles.color, {backgroundColor: color}]}/>)}</View>
        <Text numberOfLines={1} style={[styles.name, compact && styles.nameCompact, selected && styles.active]}>{lutDisplayName(lut.name)}</Text>
        {selected && !compact && <CameraIcon name="check" active/>}
      </Pressable>;
    })}
  </View>)}{luts.some(lut => lut.builtIn) && <Text style={styles.note}>{compact ? '非官方近似 · SDR' : '非官方近似 · SDR sRGB / Rec.709'}</Text>}</>;
}
const styles = StyleSheet.create({
  group: {gap: ui.space.xs}, section: {...ui.type.caption, color: ui.color.muted, marginTop: ui.space.md, marginBottom: ui.space.xs},
  row: {minHeight: 56, padding: ui.space.sm, borderRadius: ui.radius.small, flexDirection: 'row', alignItems: 'center', gap: ui.space.md},
  selected: {backgroundColor: ui.color.selected}, pressed: {backgroundColor: ui.color.raised}, disabled: {opacity: .45},
  swatch: {width: 48, height: 32, borderRadius: ui.space.xs, flexDirection: 'row', overflow: 'hidden'}, color: {flex: 1},
  rowCompact: {minHeight: ui.icon.touch, paddingVertical: ui.space.xs, gap: ui.space.sm}, swatchCompact: {width: 28, height: 20},
  name: {...ui.type.body, color: ui.color.text, flex: 1}, nameCompact: {fontSize: 13, lineHeight: 18}, active: {color: ui.color.accent}, note: {...ui.type.caption, color: ui.color.muted, marginTop: ui.space.md},
});
