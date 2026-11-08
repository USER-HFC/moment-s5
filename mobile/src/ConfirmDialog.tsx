import React, {useEffect, useRef} from 'react';
import {AccessibilityInfo, findNodeHandle, Modal, Pressable, StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import {ui} from './theme';

type Props = {
  visible: boolean;
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Red confirm button. Delete and cleanup use this. */
  destructive?: boolean;
  busy?: boolean;
  testID?: string;
  confirmTestID?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * Dark in-app confirmation. A system Alert is light and its destructive action is easy to miss.
 * The dialog is modal for the screen reader and takes focus, matching the other overlays.
 */
export default function ConfirmDialog({visible, title, body, confirmLabel, cancelLabel = '取消', destructive = false, busy = false, testID = 'confirm-dialog', confirmTestID = 'confirm-accept', onCancel, onConfirm}: Props) {
  const titleRef = useRef<View>(null);
  useEffect(() => {
    if (!visible) return undefined;
    const node = findNodeHandle(titleRef.current);
    if (node == null) return undefined;
    const timer = setTimeout(() => AccessibilityInfo.setAccessibilityFocus(node), 300);
    return () => clearTimeout(timer);
  }, [visible, title]);
  const cancel = () => { if (!busy) onCancel(); };
  if (!visible) return null;
  return <Modal visible transparent animationType="none" supportedOrientations={['portrait', 'landscape']} onRequestClose={cancel}>
    <View style={styles.scrim}>
      <View testID={testID} accessibilityViewIsModal style={styles.dialog}>
        <View ref={titleRef} accessible accessibilityRole="header" accessibilityLabel={title}>
          <Text style={styles.title}>{title}</Text>
        </View>
        <Text style={styles.body}>{body}</Text>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" accessibilityLabel={cancelLabel} disabled={busy} onPress={cancel} style={({pressed}) => [styles.button, pressed && styles.pressed]}>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.cancelLabel}>{cancelLabel}</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel={confirmLabel} disabled={busy} testID={confirmTestID} onPress={onConfirm} style={({pressed}) => [styles.button, destructive ? styles.danger : styles.safe, pressed && styles.pressed]}>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={destructive ? styles.dangerLabel : styles.safeLabel}>{confirmLabel}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  </Modal>;
}

const styles = StyleSheet.create({
  scrim: {flex: 1, justifyContent: 'center', padding: ui.space.gutter, backgroundColor: ui.color.scrim},
  dialog: {width: '100%', maxWidth: 420, alignSelf: 'center', gap: ui.space.md, padding: ui.space.lg, borderRadius: ui.radius.sheet, borderWidth: 1, borderColor: ui.color.outline, backgroundColor: ui.color.background, elevation: 0},
  title: {...ui.type.title, color: ui.color.text},
  body: {...ui.type.body, color: ui.color.text},
  actions: {flexDirection: 'row', gap: ui.space.sm},
  button: {flex: 1, minHeight: ui.icon.touch, alignItems: 'center', justifyContent: 'center', borderRadius: ui.radius.control, borderWidth: 1, borderColor: ui.color.outline, paddingHorizontal: ui.space.sm},
  pressed: {opacity: 0.8},
  danger: {backgroundColor: ui.color.destructive, borderColor: ui.color.destructive},
  dangerLabel: {...ui.type.body, color: ui.color.background, fontWeight: '600', textAlign: 'center'},
  safe: {backgroundColor: ui.color.accent, borderColor: ui.color.accent},
  safeLabel: {...ui.type.body, color: ui.color.background, fontWeight: '600', textAlign: 'center'},
  cancelLabel: {...ui.type.body, color: ui.color.text, textAlign: 'center'},
});
