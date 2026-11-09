import React from 'react';
import {LayoutChangeEvent, Pressable, StyleSheet, View} from 'react-native';
import Svg, {Path} from 'react-native-svg';
import {CameraState} from '../native';
import {cn, color, Text} from '../ui';
import {lutDisplayName} from '../lutName';
import {bufferReadout} from './bufferStatus';
import {batteryText, exposureReading, exposureShown} from './readings';
import {cameraBatteryLow} from '../lowBattery';

type Props = {
  state: CameraState; buffered: number; motion: boolean; waiting: boolean;
  /** Opens the LUT panel. Without it the LUT capsule is only a readout. */
  onLut?: () => void; lutOpen?: boolean;
  onTopLayout: (event: LayoutChangeEvent) => void; onBottomLayout: (event: LayoutChangeEvent) => void;
};

const NUMBERS = {fontVariant: ['tabular-nums' as const]};

/** Readouts float on the picture in translucent black capsules: exposure and batteries on top, LUT and capture state below. */
export default React.memo(function CameraHud({state, buffered, motion, waiting, onLut, lutOpen = false, onTopLayout, onBottomLayout}: Props) {
  const exposure = exposureReading(state);
  const phone = batteryText(state.phoneBattery);
  const camera = batteryText(state.cameraBattery);
  const cameraLow = cameraBatteryLow(state.cameraBattery?.percent);
  // A reading exists only when the body (or a test launch) supplied one; a plain demo has none.
  const showCamera = state.active && camera !== '—';
  const showPhone = state.active && phone !== '—';
  const showExposure = state.active && exposureShown(exposure);
  // 「曝光」alone says nothing; only the qualified labels (最近读数, 已过期) are worth showing.
  const exposureNote = exposure.label === '曝光' ? '' : exposure.label.replace(/^曝光 · /, '');
  const buffer = bufferReadout(buffered, state.ready);
  const showBuffer = state.active && motion && !state.busy && !waiting;
  const capture = state.busy ? '处理中…' : waiting ? '倒计时' : motion && !state.ready ? '缓存中' : '可拍';
  const showCapture = state.active && (motion || state.busy || waiting);
  const lutName = state.lut ? lutDisplayName(state.lut) : '原色';
  return <>
    <View pointerEvents="none" testID="hud-top" style={[styles.band, styles.top]} onLayout={onTopLayout}>
      {showExposure ? <View testID="hud-exposure" accessible accessibilityLabel={`${exposure.label} ${exposure.shutter} ${exposure.aperture} ${exposure.iso}`}
        className="max-w-[72%] shrink rounded-[14px] bg-black/45 px-2.5 py-1 gap-0.5">
        <View className="flex-row flex-wrap items-center gap-x-3">
          <Text testID="hud-shutter" className="text-caption font-semibold" style={NUMBERS}>{exposure.shutter}</Text>
          <Text testID="hud-aperture" className="text-caption font-semibold" style={NUMBERS}>{exposure.aperture}</Text>
          <Text testID="hud-iso" className="text-caption font-semibold" style={NUMBERS}>{exposure.iso}</Text>
        </View>
        {!!exposure.detail && <Text testID="hud-exposure-detail" numberOfLines={2} className="text-[11px] leading-[14px] text-subtle">{exposure.detail}</Text>}
        {!!exposureNote && <Text testID="hud-exposure-note" className="text-[11px] leading-[14px] text-subtle">{exposureNote}</Text>}
      </View> : <View/>}
      {(showPhone || showCamera) && <View testID="hud-batteries" className="flex-row items-center gap-2.5 rounded-full bg-black/45 px-2.5 h-[26px]">
        {showCamera && <Text accessibilityLabel={`相机电量${camera}${cameraLow ? '，电量低' : ''}`}
          className={cn('text-caption font-semibold', cameraLow ? 'text-danger' : 'text-ink')} style={NUMBERS}>相机 {camera}</Text>}
        {showPhone && <View className="flex-row items-center gap-1" accessible accessibilityLabel={`手机电量${phone}${state.phoneBattery?.charging ? '，充电中' : ''}`}>
          <Text className="text-caption font-semibold text-subtle" style={NUMBERS}>手机 {phone}</Text>
          {/* The「↯」glyph falls back to a thin symbol font on many phones; a drawn bolt matches the text. */}
          {state.phoneBattery?.charging && <Svg testID="hud-charging" width={7} height={10} viewBox="0 0 8 11"><Path d="M4.8 0 0 6.2h3.2L2.6 11 8 4.6H4.6z" fill={color.subtle}/></Svg>}
        </View>}
      </View>}
    </View>
    <View pointerEvents="box-none" testID="hud-bottom" style={[styles.band, styles.bottom]} onLayout={onBottomLayout}>
      {state.active && <Pressable testID="lut-pill" accessibilityRole="button" accessibilityLabel="LUT 风格"
        accessibilityHint={lutOpen ? '收起 LUT 面板' : `当前 ${lutName}，展开 LUT 面板，切换时实时预览`} accessibilityState={{expanded: lutOpen}}
        disabled={!onLut} onPress={onLut}
        className={cn('h-8 flex-row items-center gap-1.5 rounded-full px-3 active:opacity-70', lutOpen ? 'bg-ink' : 'bg-black/45')}>
        {!!state.lut && <View className="h-[5px] w-[5px] rounded-full bg-leica"/>}
        <Text numberOfLines={1} className={cn('max-w-[150px] text-caption font-semibold', lutOpen ? 'text-black' : state.lut ? 'text-ink' : 'text-subtle')}>{lutName}</Text>
      </Pressable>}
      {showCapture && <View testID="hud-capture" className="h-8 flex-row items-center gap-2 rounded-full bg-black/45 px-3">
        {showBuffer ? <>
          <View className="h-0.5 w-8 overflow-hidden rounded-full bg-white/30" accessibilityLabel={buffer.label}>
            <View testID="hud-buffer-bar" className="h-0.5 bg-ink" style={{width: `${Math.round(buffer.progress * 100)}%`}}/>
          </View>
          <Text testID="hud-buffer" numberOfLines={1} className="text-caption font-semibold" style={NUMBERS}>{buffer.label}</Text>
        </> : <Text numberOfLines={1} className="text-caption font-semibold">{`${motion ? '动态' : '照片'} · ${capture}`}</Text>}
      </View>}
    </View>
  </>;
});

const styles = StyleSheet.create({
  band: {position: 'absolute', zIndex: 1000, left: 10, right: 10, flexDirection: 'row', gap: 8},
  top: {top: 10, justifyContent: 'space-between', alignItems: 'flex-start'},
  bottom: {bottom: 12, justifyContent: 'center', alignItems: 'center'},
});
