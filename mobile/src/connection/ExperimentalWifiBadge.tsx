import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import {CameraState} from '../native';

export default function ExperimentalWifiBadge({state}: {state: Pick<CameraState, 'transport' | 'exposure'>}) {
  if (state.transport !== 'wifi') return null;
  return <View style={styles.badge} testID="experimental-wifi-badge">
    <Text style={styles.label}>Wi-Fi · 实验性 · 未经真机验证</Text>
    {state.exposure && <Text style={styles.detail}>{state.exposure}</Text>}
  </View>;
}
const styles = StyleSheet.create({badge: {backgroundColor: '#161b16e6', borderColor: '#657255', borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4, maxWidth: 260}, label: {fontSize: 10, lineHeight: 12, color: '#d6e6b6'}, detail: {fontSize: 10, lineHeight: 12, color: '#c9cebf', marginTop: 2}});
