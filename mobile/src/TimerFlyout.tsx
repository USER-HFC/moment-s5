import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import CameraControl from './CameraControl';
import {ui} from './theme';

type Props = {
  landscape: boolean;
  dock: {width: number; height: number};
  /** null is off. */
  selected: number | null;
  onSelect: (seconds: number | null) => void;
  onClose: () => void;
};

const OPTIONS: {value: number | null; label: string; accessibilityLabel: string}[] = [
  {value: null, label: '关', accessibilityLabel: '关闭定时'},
  {value: 2, label: '2 秒', accessibilityLabel: '定时 2 秒'},
  {value: 5, label: '5 秒', accessibilityLabel: '定时 5 秒'},
  {value: 10, label: '10 秒', accessibilityLabel: '定时 10 秒'},
  {value: 30, label: '30 秒', accessibilityLabel: '定时 30 秒'},
];

// Same flat flyout as LUT and focus: no scrim, no shadow, and it closes those panels by taking the one open slot.
export default function TimerFlyout({landscape, dock, selected, onSelect, onClose}: Props) {
  const anchor = landscape
    ? {right: dock.width + ui.space.sm, top: ui.space.sm}
    : {left: ui.space.sm, right: ui.space.sm, bottom: dock.height + ui.space.sm};
  return <View testID="timer-flyout" accessibilityLabel="定时面板" style={[styles.flyout, anchor]}>
    <View style={styles.header}>
      <Text style={styles.title} accessibilityRole="header">定时</Text>
      <CameraControl icon="close" accessibilityLabel="收起定时面板" onPress={onClose}/>
    </View>
    <View style={styles.options}>
      {OPTIONS.map(option => {
        const on = option.value === selected;
        return <Pressable key={option.accessibilityLabel} accessibilityRole="button" accessibilityLabel={option.accessibilityLabel} accessibilityState={{selected: on}}
          onPress={() => onSelect(option.value)} android_ripple={{color: ui.color.pressed}}
          style={({pressed}) => [styles.option, landscape && styles.optionFixed, on && styles.optionOn, pressed && styles.pressed]}>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.optionLabel, on && styles.optionLabelOn]}>{option.label}</Text>
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
  options: {flexDirection: 'row', alignItems: 'stretch', gap: ui.space.sm},
  option: {flex: 1, minWidth: ui.icon.touch, minHeight: ui.icon.touch, paddingHorizontal: ui.space.xs, alignItems: 'center', justifyContent: 'center',
    borderRadius: ui.radius.small, borderWidth: 1, borderColor: ui.color.outline, backgroundColor: ui.color.surface},
  optionFixed: {flexGrow: 0, flexBasis: 'auto'},
  optionOn: {backgroundColor: ui.color.selected, borderColor: ui.color.accent},
  pressed: {backgroundColor: ui.color.raised},
  optionLabel: {...ui.type.label, color: ui.color.text, fontWeight: '600'},
  optionLabelOn: {color: ui.color.accent},
});
