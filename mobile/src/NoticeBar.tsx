import React, {useEffect} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import {ui} from './theme';

/** One optional action keeps the contract small: save uses 查看, errors can use 查看诊断. */
export type NoticeAction = {label: string; onPress: () => void};
export type Notice = {message: string; action?: NoticeAction};

const DISMISS_MS = 4500;

export default function NoticeBar({notice, onDismiss}: {notice: Notice | null; onDismiss?: () => void}) {
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => onDismiss?.(), DISMISS_MS);
    return () => clearTimeout(timer);
  }, [notice, onDismiss]);
  if (!notice) return null;
  return <View testID="notice-bar" accessibilityLiveRegion="polite" style={styles.bar}>
    <Text style={styles.message}>{notice.message}</Text>
    {notice.action && <Pressable accessibilityRole="button" accessibilityLabel={notice.action.label} onPress={() => {notice.action?.onPress(); onDismiss?.();}} android_ripple={{color: ui.color.pressed}} style={styles.action}>
      <Text style={styles.actionLabel}>{notice.action.label}</Text>
    </Pressable>}
  </View>;
}

const styles = StyleSheet.create({
  // Flat dark bar: the Material snackbar was light and sat on the mode switch.
  bar: {flexDirection: 'row', alignItems: 'center', gap: ui.space.sm, minHeight: ui.icon.touch, paddingLeft: ui.space.md, paddingRight: ui.space.xs,
    borderRadius: ui.radius.control, borderWidth: 1, borderColor: ui.color.outline, backgroundColor: ui.color.surface, elevation: 0},
  message: {...ui.type.body, flex: 1, color: ui.color.text},
  action: {minWidth: ui.icon.touch, minHeight: ui.icon.touch, paddingHorizontal: ui.space.md, alignItems: 'center', justifyContent: 'center'},
  actionLabel: {...ui.type.body, color: ui.color.accent, fontWeight: '600'},
});
