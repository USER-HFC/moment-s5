import React from 'react';
import {LayoutChangeEvent, StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import {CameraState} from '../native';
import {ui} from '../theme';
import {lutDisplayName} from '../lutName';
import {batteryText, exposureReading} from './readings';

type Props = {state: CameraState; buffered: number; motion: boolean; waiting: boolean; onTopLayout: (event: LayoutChangeEvent) => void; onBottomLayout: (event: LayoutChangeEvent) => void};

export default React.memo(function CameraHud({state, buffered, motion, waiting, onTopLayout, onBottomLayout}: Props) {
  const exposure = exposureReading(state);
  const source = !state.active ? '相机未连接' : state.demo ? 'DEMO · 合成演示' : state.transport === 'wifi' ? 'Wi-Fi · 实验性' : 'USB · 已连接';
  const phone = batteryText(state.phoneBattery);
  const camera = state.active && !state.demo ? batteryText(state.cameraBattery) : '—';
  const duration = Number.isFinite(buffered) && buffered >= 0 ? Math.min(3, buffered).toFixed(1) : '—';
  const capture = !state.active ? '未连接' : state.busy ? '处理中…' : waiting ? '倒计时' : motion ? state.ready ? '缓存就绪' : '预缓存中' : '可拍';
  return <>
    <View pointerEvents="none" testID="hud-top" style={[styles.row, styles.top]} onLayout={onTopLayout}>
      <View testID="hud-source" style={styles.source}>
        <Text style={styles.primary}>{source}</Text>
        {state.active && state.transport === 'wifi' && !state.demo && <Text testID="experimental-wifi-badge" style={styles.secondary}>未经真机验证</Text>}
        {state.lut && <Text style={styles.secondary}>LUT · {lutDisplayName(state.lut)}</Text>}
      </View>
      <View testID="hud-batteries" style={styles.right}>
        <Text style={styles.primary} accessibilityLabel={`手机电量${phone === '—' ? '不可用' : phone}${state.phoneBattery?.charging && phone !== '—' ? '，充电中' : ''}`}>手机 {phone}{state.phoneBattery?.charging && phone !== '—' ? ' ↯' : ''}</Text>
        <Text style={styles.secondary} accessibilityLabel={`相机电量${camera === '—' ? '不可用，当前连接未提供机身电量' : camera}`}>相机 {camera}</Text>
      </View>
    </View>
    <View pointerEvents="none" testID="hud-bottom" style={[styles.row, styles.bottom]} onLayout={onBottomLayout}>
      <View testID="hud-exposure" style={styles.exposure}>
        <Text style={styles.secondary}>{exposure.label}</Text>
        <View style={styles.triangle}>
          <Text testID="hud-aperture" style={styles.primary}>{exposure.aperture}</Text>
          <Text testID="hud-shutter" style={styles.primary}>{exposure.shutter}</Text>
          <Text testID="hud-iso" style={styles.primary}>{exposure.iso}</Text>
        </View>
        {!!exposure.detail && <Text testID="hud-exposure-detail" style={styles.secondary}>{exposure.detail}</Text>}
      </View>
      <View testID="hud-capture" style={styles.capture}>
        <Text style={styles.secondary}>{motion ? '动态' : '照片'} · {capture}</Text>
        {motion && <Text style={styles.primary}>缓存 {state.active && !state.busy ? duration : '—'} / 3s</Text>}
      </View>
    </View>
  </>;
});

const ink = {color: ui.color.text, textShadowColor: '#000000CC', textShadowOffset: {width: 0, height: 1}, textShadowRadius: 3};
const styles = StyleSheet.create({
  row: {position: 'absolute', zIndex: 1000, left: ui.space.gutter, right: ui.space.gutter, flexDirection: 'row', justifyContent: 'space-between', gap: ui.space.md},
  top: {top: ui.space.gutter, alignItems: 'flex-start'}, bottom: {bottom: ui.space.gutter, alignItems: 'flex-end'},
  source: {flex: 1, minWidth: 0, gap: ui.space.xs}, right: {flexShrink: 0, alignItems: 'flex-end', gap: ui.space.xs},
  exposure: {flex: 1, minWidth: 0, gap: ui.space.xs}, capture: {maxWidth: '38%', alignItems: 'flex-end', gap: ui.space.xs},
  triangle: {flexDirection: 'row', flexWrap: 'wrap', columnGap: ui.space.md, rowGap: ui.space.xs},
  primary: {...ui.type.caption, ...ink, fontWeight: '600', fontVariant: ['tabular-nums']},
  secondary: {...ui.type.label, ...ink, color: '#D1D8CD'},
});
