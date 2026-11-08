import React from 'react';
import {LayoutChangeEvent, StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import Svg, {Path} from 'react-native-svg';
import {CameraState} from '../native';
import {ui} from '../theme';
import {lutDisplayName} from '../lutName';
import {hudSource} from '../cameraLabel';
import {bufferReadout} from './bufferStatus';
import {batteryText, exposureReading, exposureShown} from './readings';
import {cameraBatteryLow} from '../lowBattery';

type Props = {state: CameraState; buffered: number; motion: boolean; waiting: boolean; onTopLayout: (event: LayoutChangeEvent) => void; onBottomLayout: (event: LayoutChangeEvent) => void};

export default React.memo(function CameraHud({state, buffered, motion, waiting, onTopLayout, onBottomLayout}: Props) {
  const exposure = exposureReading(state);
  const source = hudSource(state);
  const phone = batteryText(state.phoneBattery);
  const camera = batteryText(state.cameraBattery);
  const cameraLow = cameraBatteryLow(state.cameraBattery?.percent);
  // A reading exists only when the body (or a test launch) supplied one; a plain demo has none.
  const showCamera = state.active && camera !== '—';
  const showPhone = phone !== '—';
  const showExposure = exposureShown(exposure);
  const buffer = bufferReadout(buffered, state.ready);
  const showBuffer = state.active && motion && !state.busy;
  const capture = state.busy ? '处理中…' : waiting ? '倒计时' : motion && !state.ready ? '缓存中' : '可拍';
  const modeName = motion ? '动态' : '照片';
  // The buffer line already says 可拍 or 缓存中. A lone「动态」repeats the mode switch.
  const modeLine = `${modeName} · ${capture}`;
  const showModeLine = !showBuffer || waiting;
  return <>
    <View pointerEvents="none" testID="hud-top" style={[styles.row, styles.top]} onLayout={onTopLayout}>
      <View testID="hud-source" style={styles.source}>
        {state.active && <Text numberOfLines={2} style={styles.primary}>{source}</Text>}
        {state.active && state.transport === 'wifi' && !state.demo && <Text testID="experimental-wifi-badge" style={styles.secondary}>未经真机验证</Text>}
        {state.lut && <Text style={styles.secondary}>LUT · {lutDisplayName(state.lut)}</Text>}
      </View>
      <View testID="hud-batteries" style={styles.right}>
        {showPhone && <View style={styles.battery} accessible accessibilityLabel={`手机电量${phone}${state.phoneBattery?.charging ? '，充电中' : ''}`}>
          <Text style={styles.primary}>手机 {phone}</Text>
          {/* The「↯」glyph falls back to a thin symbol font on many phones; a drawn bolt matches the HUD text. */}
          {state.phoneBattery?.charging && <Svg testID="hud-charging" width={8} height={11} viewBox="0 0 8 11"><Path d="M4.8 0 0 6.2h3.2L2.6 11 8 4.6H4.6z" fill={ui.color.text}/></Svg>}
        </View>}
        {showCamera && <Text style={[styles.secondary, cameraLow && styles.low]} accessibilityLabel={`相机电量${camera}${cameraLow ? '，电量低' : ''}`}>相机 {camera}</Text>}
      </View>
    </View>
    <View pointerEvents="none" testID="hud-bottom" style={[styles.row, styles.bottom]} onLayout={onBottomLayout}>
      {showExposure && <View testID="hud-exposure" style={styles.exposure}>
        <Text style={styles.secondary}>{exposure.label}</Text>
        <View style={styles.triangle}>
          <Text testID="hud-aperture" style={styles.primary}>{exposure.aperture}</Text>
          <Text testID="hud-shutter" style={styles.primary}>{exposure.shutter}</Text>
          <Text testID="hud-iso" style={styles.primary}>{exposure.iso}</Text>
        </View>
        {!!exposure.detail && <Text testID="hud-exposure-detail" style={styles.secondary}>{exposure.detail}</Text>}
      </View>}
      {state.active && <View testID="hud-capture" style={styles.capture}>
        {showModeLine && <Text numberOfLines={2} style={styles.secondary}>{modeLine}</Text>}
        {showBuffer && <>
          <Text testID="hud-buffer" numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.3} style={styles.primary}>{buffer.label}</Text>
          <View style={styles.track} accessibilityLabel={buffer.label}>
            <View testID="hud-buffer-bar" style={[styles.bar, {width: `${Math.round(buffer.progress * 100)}%`}]}/>
          </View>
        </>}
      </View>}
    </View>
  </>;
});

const ink = {color: ui.color.text, textShadowColor: '#000000CC', textShadowOffset: {width: 0, height: 1}, textShadowRadius: 3};
const styles = StyleSheet.create({
  row: {position: 'absolute', zIndex: 1000, left: ui.space.gutter, right: ui.space.gutter, flexDirection: 'row', justifyContent: 'space-between', gap: ui.space.md},
  top: {top: ui.space.gutter, alignItems: 'flex-start'}, bottom: {bottom: ui.space.gutter, alignItems: 'flex-end'},
  source: {flex: 1, minWidth: 0, gap: ui.space.xs}, right: {flexShrink: 0, alignItems: 'flex-end', gap: ui.space.xs},
  exposure: {flex: 1, minWidth: 0, gap: ui.space.xs}, capture: {maxWidth: '54%', flexShrink: 1, marginLeft: 'auto', alignItems: 'flex-end', gap: ui.space.xs},
  triangle: {flexDirection: 'row', flexWrap: 'wrap', columnGap: ui.space.md, rowGap: ui.space.xs},
  battery: {flexDirection: 'row', alignItems: 'center', gap: 4},
  primary: {...ui.type.caption, ...ink, fontWeight: '600', fontVariant: ['tabular-nums']},
  secondary: {...ui.type.label, ...ink, color: '#D1D8CD'},
  low: {color: ui.color.destructive},
  track: {alignSelf: 'stretch', height: 2, borderRadius: 1, backgroundColor: '#D1D8CD55', overflow: 'hidden'},
  bar: {height: 2, backgroundColor: ui.color.accent},
});
