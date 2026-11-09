import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import Svg, {Circle} from 'react-native-svg';
import {ui} from './theme';

const SIZE = 168;
const STROKE = 10;

/** Remaining-time arc. A full ring is the whole delay; it shrinks with the number. */
export function countdownRing(seconds: number, total: number) {
  const safeTotal = Number.isFinite(total) && total > 0 ? total : 0;
  const left = safeTotal === 0 ? 0 : Math.min(safeTotal, Math.max(0, seconds));
  const fraction = safeTotal === 0 ? 0 : left / safeTotal;
  const radius = (SIZE - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;
  return {size: SIZE, stroke: STROKE, radius, circumference, fraction, dashOffset: circumference * (1 - fraction)};
}

type Props = {seconds: number; total: number};

export default function CountdownOverlay({seconds, total}: Props) {
  const ring = countdownRing(seconds, total);
  const center = ring.size / 2;
  return <View pointerEvents="none" testID="countdown" style={styles.wrap}>
    <View style={styles.frame}>
      <Svg width={ring.size} height={ring.size} accessible={false} style={StyleSheet.absoluteFill}>
        <Circle cx={center} cy={center} r={ring.radius} stroke="#FFFFFF44" strokeWidth={ring.stroke} fill="none"/>
        <Circle testID="countdown-ring" cx={center} cy={center} r={ring.radius} stroke="#FFFFFF" strokeWidth={ring.stroke} fill="none"
          strokeLinecap="round" strokeDasharray={`${ring.circumference} ${ring.circumference}`} strokeDashoffset={ring.dashOffset}
          transform={`rotate(-90 ${center} ${center})`}/>
      </Svg>
      <Text accessibilityLiveRegion="polite" accessibilityLabel={`倒计时 ${seconds}`} maxFontSizeMultiplier={1.3} style={styles.digit}>{seconds}</Text>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  wrap: {...StyleSheet.absoluteFillObject, zIndex: 1100, alignItems: 'center', justifyContent: 'center'},
  frame: {width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center'},
  digit: {fontSize: 72, lineHeight: 80, fontWeight: '700', color: ui.color.text, fontVariant: ['tabular-nums'],
    textShadowColor: '#000000CC', textShadowOffset: {width: 0, height: 1}, textShadowRadius: 8},
});
