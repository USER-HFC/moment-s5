import React from 'react';
import {Image, Pressable, StyleSheet} from 'react-native';
import {Text} from 'react-native-paper';
import CameraIcon, {CameraIconName} from './CameraIcon';
import {ui} from './theme';

type Props = {
  icon: CameraIconName; label?: string; accessibilityLabel: string; accessibilityHint?: string;
  active?: boolean; checked?: boolean; destructive?: boolean; disabled?: boolean;
  onPress: () => void; onLongPress?: () => void; thumbnail?: string; testID?: string;
};

export default function CameraControl({icon, label, accessibilityLabel, accessibilityHint, active = false,
  checked, destructive = false, disabled = false, onPress, onLongPress, thumbnail, testID}: Props) {
  return <Pressable testID={testID} accessibilityRole={checked === undefined ? 'button' : 'switch'}
    accessibilityLabel={accessibilityLabel} accessibilityHint={accessibilityHint}
    accessibilityState={checked === undefined ? {selected: active, disabled} : {checked, disabled}}
    disabled={disabled} onPress={onPress} onLongPress={onLongPress} android_ripple={{color: ui.color.pressed}}
    style={({pressed}) => [styles.control, active && styles.active, pressed && styles.pressed, disabled && styles.disabled]}>
    {thumbnail ? <Image accessible={false} source={{uri: thumbnail}} style={styles.thumbnail}/> : <CameraIcon name={icon} active={active} destructive={destructive}/>}
    {label && <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.label, active && styles.activeLabel]}>{label}</Text>}
  </Pressable>;
}

const styles = StyleSheet.create({
  control: {width: ui.icon.touch, height: ui.icon.touch, flexShrink: 0, alignItems: 'center', justifyContent: 'center', gap: ui.space.xs, borderRadius: ui.radius.control, overflow: 'hidden'},
  active: {backgroundColor: ui.color.selected}, pressed: {backgroundColor: ui.color.raised}, disabled: {opacity: .45},
  label: {...ui.type.label, color: ui.color.muted, textAlign: 'center'}, activeLabel: {color: ui.color.accent},
  thumbnail: {width: ui.icon.size, height: ui.icon.size, borderRadius: ui.space.xs, borderWidth: 1, borderColor: ui.color.outline},
});
