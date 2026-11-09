import React, {useEffect, useRef} from 'react';
import {AccessibilityInfo, findNodeHandle, Modal, StyleSheet, View} from 'react-native';
import {Tappable as Pressable} from './ui';
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

// iOS-style alert card: grouped grey, white primary, destructive in red text on grey.
const styles = StyleSheet.create({
  scrim: {flex: 1, justifyContent: 'center', padding: 32, backgroundColor: ui.color.scrim},
  dialog: {width: '100%', maxWidth: 360, alignSelf: 'center', gap: 10, paddingTop: 22, paddingHorizontal: 18, paddingBottom: 18, borderRadius: 22, backgroundColor: ui.color.surface, elevation: 0},
  title: {fontSize: 17, lineHeight: 22, fontWeight: '600', color: ui.color.text, textAlign: 'center'},
  body: {fontSize: 14, lineHeight: 20, color: '#D1D1D6', textAlign: 'center'},
  actions: {flexDirection: 'row', gap: 10, marginTop: 8},
  button: {flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 999, paddingHorizontal: 12, backgroundColor: ui.color.raised},
  pressed: {opacity: 0.7},
  danger: {backgroundColor: ui.color.raised},
  dangerLabel: {fontSize: 16, lineHeight: 21, color: ui.color.destructive, fontWeight: '600', textAlign: 'center'},
  safe: {backgroundColor: ui.color.text},
  safeLabel: {fontSize: 16, lineHeight: 21, color: '#000000', fontWeight: '600', textAlign: 'center'},
  cancelLabel: {fontSize: 16, lineHeight: 21, color: ui.color.text, textAlign: 'center'},
});
