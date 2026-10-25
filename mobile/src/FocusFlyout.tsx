import React from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import CameraControl from './CameraControl';
import CameraIcon from './CameraIcon';
import {ui} from './theme';

type Props = {
  landscape: boolean;
  /** Size of the tool rail the flyout opens from. */
  rail: {width: number; height: number};
  disabled: boolean;
  /** Same wiring as the old near/far buttons: -1 is far, +1 is near. */
  onFocus: (direction: -1 | 1) => void;
  onClose: () => void;
};

type FocusButtonProps = {
  direction: -1 | 1; label: string; detail: string; accessibilityLabel: string;
  icon: 'near' | 'far'; disabled: boolean; onPress: (direction: -1 | 1) => void;
};

function FocusButton({direction, label, detail, accessibilityLabel, icon, disabled, onPress}: FocusButtonProps) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel}
    accessibilityHint={`${detail}，可连续点按`} disabled={disabled}
    onPress={() => onPress(direction)} android_ripple={{color: ui.color.pressed}}
    style={({pressed}) => [styles.focusButton, pressed && styles.focusPressed, disabled && styles.disabled]}>
    <CameraIcon name={icon}/>
    <Text style={styles.focusLabel}>{label}</Text>
    <Text style={styles.focusDetail}>{detail}</Text>
  </Pressable>;
}

// Same flat flyout as LUT: no scrim and no shadow, so the viewfinder stays usable while stepping focus.
export default function FocusFlyout({landscape, rail, disabled, onFocus, onClose}: Props) {
  const anchor = landscape ? {left: rail.width, top: ui.space.sm} : {top: rail.height, left: ui.space.gutter};
  return <View testID="focus-flyout" accessibilityLabel="手动对焦面板" style={[styles.flyout, styles.panel, anchor]}>
    <View style={styles.header}>
      <Text style={styles.title} accessibilityRole="header">对焦</Text>
      <CameraControl icon="close" accessibilityLabel="收起对焦面板" onPress={onClose}/>
    </View>
    <View style={styles.buttons}>
      <FocusButton direction={1} label="近" detail="向近处" accessibilityLabel="近对焦" icon="near" disabled={disabled} onPress={onFocus}/>
      <FocusButton direction={-1} label="远" detail="向远处" accessibilityLabel="远对焦" icon="far" disabled={disabled} onPress={onFocus}/>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  // Flat on purpose: outline only, no elevation or shadow.
  flyout: {position: 'absolute', zIndex: 10, borderRadius: ui.radius.control, borderWidth: 1,
    borderColor: ui.color.outline, backgroundColor: ui.color.background, elevation: 0},
  panel: {width: 208, maxWidth: '82%', padding: ui.space.sm, gap: ui.space.xs},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: ui.space.sm},
  title: {...ui.type.title, color: ui.color.text},
  buttons: {flexDirection: 'row', gap: ui.space.sm},
  focusButton: {flex: 1, minHeight: 88, paddingVertical: ui.space.sm, alignItems: 'center', justifyContent: 'center', gap: ui.space.xs,
    borderRadius: ui.radius.small, borderWidth: 1, borderColor: ui.color.outline, backgroundColor: ui.color.surface},
  focusPressed: {backgroundColor: ui.color.raised},
  disabled: {opacity: .45},
  focusLabel: {...ui.type.title, color: ui.color.text},
  focusDetail: {...ui.type.caption, color: ui.color.muted},
});
