import React, {useEffect, useState} from 'react';
import {StyleProp, ViewStyle} from 'react-native';
import {runOnJS, useAnimatedStyle, useSharedValue} from 'react-native-reanimated';
import {AnimatedView, exitTo, SpringName, springTo, useMotionReduced} from './motion';

/**
 * fade: opacity only. rise: up from below (panels, notices). sink: down from above.
 * pop: a small scale-up (dialogs, badges). sheet: a full slide from the bottom edge.
 * push / pushBack: a page arriving from the right, or (going back) from the left.
 */
export type PresenceKind = 'fade' | 'rise' | 'sink' | 'pop' | 'sheet' | 'push' | 'pushBack';

type Props = {
  visible: boolean;
  kind?: PresenceKind;
  /** Travel for rise/sink/push in dp; sheet uses this as its full drop. */
  distance?: number;
  spring?: SpringName;
  /** Delay before entering, for staggered groups. */
  delay?: number;
  /** Animate on first mount when visible. Off for things that are already on screen at launch. */
  appear?: boolean;
  /** Called once the exit animation has finished and the children are gone. */
  onExited?: () => void;
  /**
   * Layout and position go in style, not className: NativeWind drops position classes such as
   * absolute / inset-0 on this animated view (seen on device), so the prop is not offered.
   */
  style?: StyleProp<ViewStyle>;
  testID?: string;
  pointerEvents?: 'auto' | 'box-none' | 'none' | 'box-only';
  children: React.ReactNode;
};

/**
 * Mounts children on enter, keeps them for the exit, then unmounts.
 *
 * The moment visible turns false the wrapper stops taking touches and leaves the accessibility
 * tree, before any frame of the exit has played. beta.7 lost taps to an invisible exiting copy
 * (Reanimated layout animations); this is the guard against that, and it is tested.
 */
export function Presence({visible, kind = 'rise', distance = 16, spring = 'smooth', delay = 0, appear = true, onExited, style, testID, pointerEvents = 'auto', children}: Props) {
  const reduced = useMotionReduced();
  const [mounted, setMounted] = useState(visible);
  const progress = useSharedValue(visible && !appear ? 1 : 0);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      if (delay > 0 && !reduced) {
        const timer = setTimeout(() => { progress.value = springTo(1, spring, reduced); }, delay);
        return () => clearTimeout(timer);
      }
      progress.value = springTo(1, spring, reduced);
      return undefined;
    }
    if (!mounted) return undefined;
    const finish = () => { setMounted(false); onExited?.(); };
    // Runs on the UI thread: it has to be a worklet itself, since it reaches withTiming through exitTo
    // and the Reanimated plugin only auto-workletizes callbacks written inline in withTiming(...).
    progress.value = exitTo(0, reduced, finished => {
      'worklet';
      if (finished) runOnJS(finish)();
    });
    return undefined;
    // onExited is a notification; a new closure each render must not replay the animation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, reduced, spring, delay]);

  const animated = useAnimatedStyle(() => {
    const p = progress.value;
    const opacity = Math.min(1, Math.max(0, p));
    if (reduced || kind === 'fade') return {opacity};
    const away = 1 - p;
    switch (kind) {
      case 'rise': return {opacity, transform: [{translateY: away * distance}]};
      case 'sink': return {opacity, transform: [{translateY: -away * distance}]};
      case 'pop': return {opacity, transform: [{scale: 1 - away * 0.08}]};
      // The sheet's own body is opaque; fade only the first fifth so it doesn't pop in at the edge.
      case 'sheet': return {opacity: Math.min(1, opacity * 5), transform: [{translateY: away * distance}]};
      case 'push': return {opacity, transform: [{translateX: away * distance}]};
      case 'pushBack': return {opacity, transform: [{translateX: -away * distance}]};
      default: return {opacity};
    }
  });

  if (!mounted && !visible) return null;
  return <AnimatedView testID={testID} style={[style, animated]}
    pointerEvents={visible ? pointerEvents : 'none'}
    accessibilityElementsHidden={!visible} importantForAccessibility={visible ? 'auto' : 'no-hide-descendants'}>
    {children}
  </AnimatedView>;
}
