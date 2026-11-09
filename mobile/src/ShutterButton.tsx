import React, {useEffect} from 'react';
import {Pressable} from 'react-native';
import {interpolateColor, useAnimatedStyle, useSharedValue} from 'react-native-reanimated';
import {AnimatedView, cn, color, springTo, useMotionReduced} from './ui';

const DISC = 64;
const SQUARE = 28;

type Props = {accessibilityLabel: string; disabled: boolean; waiting: boolean; onPress: () => void};

/**
 * The shutter. The white disc sinks under the finger and springs back with one soft overshoot.
 * While a countdown runs it morphs into the red stop square, as the iPhone record button does,
 * and morphs back when the countdown ends or is cancelled.
 */
export default function ShutterButton({accessibilityLabel, disabled, waiting, onPress}: Props) {
  const reduced = useMotionReduced();
  const held = useSharedValue(0);
  const stop = useSharedValue(waiting ? 1 : 0);
  useEffect(() => { stop.value = springTo(waiting ? 1 : 0, 'snappy', reduced); }, [waiting, reduced, stop]);
  const disc = useAnimatedStyle(() => {
    const w = stop.value;
    const p = held.value * (1 - Math.min(1, Math.max(0, w)));
    const size = DISC + (SQUARE - DISC) * w;
    return {
      width: size, height: size,
      borderRadius: size / 2 + (6 - size / 2) * w,
      backgroundColor: interpolateColor(w, [0, 1], [color.ink, color.leica]),
      opacity: 1 - 0.2 * p,
      transform: [{scale: reduced ? 1 : 1 - 0.1 * p}],
    };
  });
  return <Pressable testID="shutter" accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{disabled}} onPress={onPress}
    onPressIn={() => { held.value = springTo(1, 'press', reduced); }}
    onPressOut={() => { held.value = springTo(0, 'bouncy', reduced); }}
    className={cn('h-[78px] w-[78px] items-center justify-center rounded-full border-4 border-ink', disabled && 'opacity-45')}>
    <AnimatedView testID="shutter-disc" style={disc}/>
  </Pressable>;
}
