import React from 'react';
import {Image, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import {LutItem} from './native';
import {lutDisplayName} from './lutName';
import {ui} from './theme';

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

type Props = {
  luts: LutItem[];
  selectedId: string;
  savedId: string | null;
  thumbnails: Record<string, string | undefined>;
  originalUri?: string;
  disabled?: boolean;
  onSelect: (id: string) => void;
};

export default function LutFilmstrip({luts, selectedId, savedId, thumbnails, originalUri, disabled = false, onSelect}: Props) {
  const items = [{id: 'off', name: '原色', builtIn: false, size: 0} as LutItem, ...luts];
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip} testID="lut-filmstrip">
    {items.map((lut) => {
      const selected = lut.id === selectedId;
      const saved = lut.id === savedId;
      const source = thumbnails[lut.id] || (lut.id === 'off' ? originalUri : undefined);
      return <Pressable key={lut.id} accessibilityRole="button" accessibilityLabel={`选择 LUT ${lutDisplayName(lut.name)}`}
        accessibilityState={{selected, disabled}} disabled={disabled} onPress={() => onSelect(lut.id)}
        style={({pressed}) => [styles.item, selected && styles.selected, pressed && styles.pressed, disabled && styles.disabled]}>
        <View style={[styles.frame, selected && styles.frameSelected]}>
          {source ? <Image testID={`lut-thumb-${lut.id}`} accessible={false} source={{uri: source}} style={styles.thumb} resizeMode="cover"/> : <View style={styles.swatch}>
            {strip(lut.id).map((color) => <View key={color} style={[styles.swatchColor, {backgroundColor: color}]}/>)}
          </View>}
          {selected && <Text style={styles.current}>当前</Text>}
          {saved && <Text style={styles.saved}>已保存</Text>}
        </View>
        <Text numberOfLines={2} maxFontSizeMultiplier={1.3} style={[styles.name, selected && styles.nameSelected]}>{lutDisplayName(lut.name)}</Text>
      </Pressable>;
    })}
  </ScrollView>;
}

const styles = StyleSheet.create({
  strip: {gap: ui.space.sm, paddingVertical: ui.space.xs, paddingRight: ui.space.sm},
  item: {width: 92, gap: 2, padding: 2, borderRadius: ui.radius.small},
  selected: {backgroundColor: ui.color.selected}, pressed: {opacity: 0.75}, disabled: {opacity: 0.45},
  frame: {width: 88, height: 58, borderRadius: ui.radius.small, overflow: 'hidden', backgroundColor: ui.color.surface, borderWidth: 2, borderColor: 'transparent'},
  frameSelected: {borderColor: ui.color.accent},
  thumb: {width: '100%', height: '100%'},
  swatch: {flex: 1, flexDirection: 'row'}, swatchColor: {flex: 1},
  current: {position: 'absolute', left: 2, top: 2, ...ui.type.label, fontSize: 9, lineHeight: 12, color: ui.color.background, backgroundColor: ui.color.accent, paddingHorizontal: 3, borderRadius: 3, overflow: 'hidden'},
  saved: {position: 'absolute', left: 2, bottom: 2, ...ui.type.label, fontSize: 9, lineHeight: 12, color: ui.color.text, backgroundColor: ui.color.overlay, paddingHorizontal: 3, borderRadius: 3, overflow: 'hidden'},
  name: {...ui.type.label, lineHeight: 14, minHeight: 28, color: ui.color.muted, textAlign: 'center'}, nameSelected: {color: ui.color.accent},
});
