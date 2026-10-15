import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import {CameraState} from '../native';
import {ui} from '../theme';

export default function ExperimentalWifiBadge({state}: {state: Pick<CameraState, 'transport' | 'exposure'>}) {
  if (state.transport !== 'wifi') return null;
  return <View style={styles.badge} testID="experimental-wifi-badge">
    <Text style={styles.label}>Wi-Fi · 实验性 · 未经真机验证</Text>
    {state.exposure && <Text style={styles.detail}>{state.exposure}</Text>}
  </View>;
}
const styles = StyleSheet.create({
  badge: {alignSelf: 'flex-start', backgroundColor: ui.color.badge, borderColor: ui.color.outline, borderWidth: 1, borderRadius: ui.radius.small, paddingHorizontal: ui.space.sm, paddingVertical: ui.space.xs, maxWidth: '100%'},
  label: {...ui.type.label, color: ui.color.text},
  detail: {...ui.type.caption, color: ui.color.muted, marginTop: ui.space.xs},
});
