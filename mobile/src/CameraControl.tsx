import React, {useEffect, useRef} from 'react';
import {AccessibilityInfo, Animated, Image, Pressable, StyleSheet} from 'react-native';
import {Text} from 'react-native-paper';
import CameraIcon, {CameraIconName} from './CameraIcon';
import {ui} from './theme';

type Props = {
  icon: CameraIconName; label?: string; accessibilityLabel: string; accessibilityHint?: string;
  active?: boolean; checked?: boolean; destructive?: boolean; disabled?: boolean;
  labelLines?: number;
  onPress: () => void; onLongPress?: () => void; thumbnail?: string; testID?: string;
};

function AlbumThumbnail({uri}: {uri: string}) {
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const seen = useRef(uri);
  useEffect(() => {
    if (seen.current === uri) return undefined;
    seen.current = uri;
    let cancel = false;
    const read = AccessibilityInfo.isReduceMotionEnabled?.();
    if (!read) return undefined;
    read.then(reduce => {
      if (cancel) return;
      if (reduce) { opacity.setValue(1); scale.setValue(1); return; }
      opacity.setValue(0);
      scale.setValue(0.82);
      Animated.parallel([
        Animated.timing(opacity, {toValue: 1, duration: 180, useNativeDriver: true}),
        Animated.timing(scale, {toValue: 1, duration: 180, useNativeDriver: true}),
      ]).start();
    }).catch(() => { opacity.setValue(1); scale.setValue(1); });
    return () => { cancel = true; };
  }, [opacity, scale, uri]);
  return <Animated.View testID="album-thumbnail" style={{opacity, transform: [{scale}]}}>
    <Image accessible={false} source={{uri}} style={styles.thumbnail}/>
  </Animated.View>;
}

export default function CameraControl({icon, label, accessibilityLabel, accessibilityHint, active = false,
  checked, destructive = false, disabled = false, labelLines = 1, onPress, onLongPress, thumbnail, testID}: Props) {
  return <Pressable testID={testID} accessibilityRole={checked === undefined ? 'button' : 'switch'}
    accessibilityLabel={accessibilityLabel} accessibilityHint={accessibilityHint}
    accessibilityState={checked === undefined ? {selected: active, disabled} : {checked, disabled}}
    disabled={disabled} onPress={onPress} onLongPress={onLongPress} android_ripple={{color: ui.color.pressed}}
    style={({pressed}) => [styles.control, labelLines > 1 && styles.controlTall, active && styles.active, pressed && styles.pressed, disabled && styles.disabled]}>
    {thumbnail ? <AlbumThumbnail uri={thumbnail}/> : <CameraIcon name={icon} active={active} destructive={destructive}/>}
    {label && <Text numberOfLines={labelLines} adjustsFontSizeToFit minimumFontScale={0.7} maxFontSizeMultiplier={1.3} style={[styles.label, active && styles.activeLabel]}>{label}</Text>}
  </Pressable>;
}

const styles = StyleSheet.create({
  control: {width: ui.icon.touch, height: ui.icon.touch, flexShrink: 0, alignItems: 'center', justifyContent: 'center', gap: ui.space.xs, borderRadius: ui.radius.control, overflow: 'hidden'},
  controlTall: {height: undefined, minHeight: ui.icon.touch, paddingVertical: 2},
  active: {backgroundColor: ui.color.selected}, pressed: {backgroundColor: ui.color.raised}, disabled: {opacity: .45},
  label: {...ui.type.label, color: ui.color.muted, textAlign: 'center'}, activeLabel: {color: ui.color.accent},
  thumbnail: {width: ui.icon.size, height: ui.icon.size, borderRadius: ui.space.xs, borderWidth: 1, borderColor: ui.color.outline},
});
