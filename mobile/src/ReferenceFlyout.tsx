import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import CameraControl from './CameraControl';
import {GUIDE_ORDER, Guide} from './referenceFrame';
import {ui} from './theme';

type Props = {
  landscape: boolean;
  dock: {width: number; height: number};
  railWidth: number;
  selected: Guide;
  onSelect: (guide: Guide) => void;
  onClose: () => void;
};

const OPTIONS: {value: Guide; label: string; accessibilityLabel: string}[] = GUIDE_ORDER.map(value => ({
  value,
  label: value === 'off' ? '关' : value,
  accessibilityLabel: value === 'off' ? '关闭构图参考' : `构图参考 ${value}`,
}));

// Same flat flyout as the timer: no scrim, no shadow, and it takes the one open panel slot.
export default function ReferenceFlyout({landscape, dock, railWidth, selected, onSelect, onClose}: Props) {
  // Pin both edges so a 1.3× font wrap stays between the tool rail and the shutter dock.
  const anchor = landscape
    ? {left: railWidth + ui.space.sm, right: dock.width + ui.space.sm, top: ui.space.sm}
    : {left: ui.space.sm, right: ui.space.sm, bottom: dock.height + ui.space.sm};
  return <View testID="reference-flyout" accessibilityLabel="构图参考面板" style={[styles.flyout, anchor]}>
    <View style={styles.header}>
      <Text style={styles.title} accessibilityRole="header">构图参考</Text>
      <CameraControl icon="close" accessibilityLabel="收起构图参考" onPress={onClose}/>
    </View>
    <View style={styles.options}>
      {OPTIONS.map(option => {
        const on = option.value === selected;
        return <Pressable key={option.value} accessibilityRole="button" accessibilityLabel={option.accessibilityLabel} accessibilityState={{selected: on}}
          onPress={() => onSelect(option.value)} android_ripple={{color: ui.color.pressed}}
          style={({pressed}) => [styles.option, on && styles.optionOn, pressed && styles.pressed]}>
          <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} maxFontSizeMultiplier={1.3} style={[styles.optionLabel, on && styles.optionLabelOn]}>{option.label}</Text>
        </Pressable>;
      })}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  flyout: {position: 'absolute', zIndex: 30, padding: ui.space.sm, gap: ui.space.xs, borderRadius: ui.radius.control,
    borderWidth: 1, borderColor: ui.color.outline, backgroundColor: ui.color.background, elevation: 0},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: ui.space.sm},
  title: {...ui.type.title, color: ui.color.text},
  options: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch', gap: ui.space.sm},
  option: {flexGrow: 1, flexShrink: 1, flexBasis: 64, minWidth: 64, minHeight: ui.icon.touch, paddingHorizontal: ui.space.xs, alignItems: 'center', justifyContent: 'center',
    borderRadius: ui.radius.small, borderWidth: 1, borderColor: ui.color.outline, backgroundColor: ui.color.surface},
  optionOn: {backgroundColor: ui.color.selected, borderColor: ui.color.accent},
  pressed: {backgroundColor: ui.color.raised},
  optionLabel: {...ui.type.label, color: ui.color.text, fontWeight: '600'},
  optionLabelOn: {color: ui.color.accent},
});
