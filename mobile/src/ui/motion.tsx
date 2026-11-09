import React, {forwardRef} from 'react';
import {Pressable, StyleProp, TextStyle, View, ViewStyle} from 'react-native';
import Animated, {Easing, useReducedMotion, withSpring, withTiming} from 'react-native-reanimated';
import type {WithSpringConfig, WithTimingConfig} from 'react-native-reanimated';
import {cssInterop} from 'nativewind';

/**
 * One motion language for the whole app. Every animated component takes its curve from here,
 * so the feel is tuned in one place.
 *
 * Springs, not fixed durations: a spring keeps the velocity of the finger and settles on its own,
 * which is what makes iOS motion read as physical. Exits are short eased timings instead, because
 * something leaving should get out of the way, not bounce.
 */
export const spring = {
  /** Finger down / up on a control. Quick, a hair of overshoot on release. */
  press: {damping: 18, stiffness: 420, mass: 0.5},
  /** Small things that move across: switch thumb, segment pill, drawer items. */
  snappy: {damping: 20, stiffness: 320, mass: 0.8},
  /** Panels, sheets and pages: settles without a visible bounce. */
  smooth: {damping: 26, stiffness: 230, mass: 1},
  /** Shutter release and small confirmations: one soft overshoot. */
  bouncy: {damping: 12, stiffness: 260, mass: 0.7},
} satisfies Record<string, WithSpringConfig>;

export type SpringName = keyof typeof spring;

/** Easing for timed motion. standard decelerates into place; exit accelerates away. */
export const curve = {
  standard: Easing.bezier(0.2, 0, 0, 1),
  exit: Easing.bezier(0.4, 0, 1, 1),
  linear: Easing.linear,
};

export const duration = {
  /** Exits and colour changes. */
  fast: 150,
  /** Cross-fades. */
  base: 220,
  /** Reduced-motion stand-in for anything that would have moved. */
  reduced: 120,
};

/**
 * Spring to a value, or a short fade-length timing when the system asks for reduced motion.
 * A `done` callback runs on the UI thread, so it must be a worklet ('worklet' as its first line).
 */
export function springTo(value: number, name: SpringName, reduced: boolean, done?: (finished?: boolean) => void) {
  'worklet';
  return reduced
    ? withTiming(value, {duration: duration.reduced, easing: curve.linear}, done)
    : withSpring(value, spring[name], done);
}

/** Eased exit; with reduced motion the same short linear fade as every other change. */
export function exitTo(value: number, reduced: boolean, done?: (finished?: boolean) => void) {
  'worklet';
  const config: WithTimingConfig = reduced
    ? {duration: duration.reduced, easing: curve.linear}
    : {duration: duration.fast, easing: curve.exit};
  return withTiming(value, config, done);
}

/** Follows Android "Remove animations" / iOS "Reduce Motion". */
export function useMotionReduced() {
  return useReducedMotion?.() ?? false;
}

/**
 * Reanimated components that also take className.
 *
 * NativeWind merges a className style into an existing `style` with Object.assign, which breaks
 * when style is an array holding a Reanimated animated style: both the classes and the animation
 * were lost on device. So className is mapped to its own prop, classStyle, and each component
 * here lays the two out itself: classes first, then style (so animation wins over a class).
 */
type ClassStyled<P> = P & {classStyle?: StyleProp<ViewStyle | TextStyle>};

function withClassStyle<P extends {style?: unknown}>(Base: React.ComponentType<P>, name: string) {
  const Styled = forwardRef<unknown, ClassStyled<P>>(({classStyle, style, ...props}, ref) =>
    <Base {...(props as P)} ref={ref} style={[classStyle, style]}/>);
  Styled.displayName = name;
  (cssInterop as (component: unknown, mapping: Record<string, string>) => void)(Styled, {className: 'classStyle'});
  return Styled as unknown as React.ComponentType<P & {className?: string; ref?: React.Ref<unknown>}>;
}

const RawAnimatedPressable = Animated.createAnimatedComponent(Pressable);
export const AnimatedView = withClassStyle(Animated.View as never, 'MotionView') as unknown as typeof Animated.View & React.ComponentType<{className?: string}>;
export const AnimatedPressable = withClassStyle(RawAnimatedPressable as never, 'MotionPressable') as unknown as typeof RawAnimatedPressable & React.ComponentType<{className?: string}>;
export const AnimatedText = withClassStyle(Animated.Text as never, 'MotionText') as unknown as typeof Animated.Text & React.ComponentType<{className?: string}>;

/** Keep the type of the plain View for refs. */
export type AnimatedViewRef = View;
