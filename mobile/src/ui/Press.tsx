import React, {forwardRef} from 'react';
import {GestureResponderEvent, PressableProps, View} from 'react-native';
import {useAnimatedStyle, useSharedValue} from 'react-native-reanimated';
import {AnimatedPressable, springTo, useMotionReduced} from './motion';

export type PressFeel = {
  /** Scale while held. 1 keeps the size (list rows, wide fields). */
  scale?: number;
  /** Opacity while held. */
  dim?: number;
};

/** Default feels: capsules shrink a little, round icons a little more, rows only dim. */
export const feel = {
  button: {scale: 0.96, dim: 0.85},
  round: {scale: 0.9, dim: 0.8},
  item: {scale: 0.92, dim: 0.85},
  row: {scale: 1, dim: 1},
  none: {scale: 1, dim: 1},
} satisfies Record<string, PressFeel>;

/**
 * Press feedback driven by one spring: in on touch-down, back out on release, so a quick tap
 * still shows a small dip and comes back with the same curve as everything else.
 */
export function usePressMotion({scale = 0.96, dim = 0.85}: PressFeel = {}, rest = 1) {
  const reduced = useMotionReduced();
  const held = useSharedValue(0);
  const style = useAnimatedStyle(() => {
    const t = held.value;
    return {
      opacity: rest * (1 - (1 - dim) * t),
      transform: [{scale: reduced ? 1 : 1 - (1 - scale) * t}],
    };
  });
  return {
    style,
    pressIn: () => { held.value = springTo(1, 'press', reduced); },
    pressOut: () => { held.value = springTo(0, 'press', reduced); },
  };
}

/** Disabled controls fade to this. The animated style owns opacity, so don't also set an opacity class. */
export const DISABLED_OPACITY = 0.4;

type Props = PressableProps & {className?: string; feel?: PressFeel;
  /** Resting opacity; defaults to DISABLED_OPACITY when disabled, else 1. */
  restOpacity?: number};

/**
 * Pressable with the shared press spring. Takes className like the NativeWind Pressable;
 * a style function is resolved with a static pressed=false, the spring is the pressed state.
 */
export const PressableMotion = forwardRef<View, Props>(function PressableMotion({feel: pressFeel = feel.button, restOpacity, style, onPressIn, onPressOut, disabled, ...props}, ref) {
  const motion = usePressMotion(pressFeel, restOpacity ?? (disabled ? DISABLED_OPACITY : 1));
  const resolved = typeof style === 'function' ? style({pressed: false, hovered: false} as never) : style;
  return <AnimatedPressable ref={ref} disabled={disabled} {...props} style={[resolved, motion.style]}
    onPressIn={(event: GestureResponderEvent) => { if (!disabled) motion.pressIn(); onPressIn?.(event); }}
    onPressOut={(event: GestureResponderEvent) => { motion.pressOut(); onPressOut?.(event); }}/>;
});
