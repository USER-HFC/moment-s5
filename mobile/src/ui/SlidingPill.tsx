import React, {useCallback, useEffect, useRef, useState} from 'react';
import {LayoutChangeEvent, LayoutRectangle, StyleProp, ViewStyle} from 'react-native';
import {useAnimatedStyle, useSharedValue} from 'react-native-reanimated';
import {AnimatedView, springTo, useMotionReduced} from './motion';

/**
 * One highlight that springs from the old choice to the new one, as in an iOS segmented control.
 * Each option reports its frame with onLayout(index); the pill is drawn behind them, absolutely,
 * in the same parent. The first placement jumps; only later changes travel.
 */
export function useSlidingPill(selectedIndex: number) {
  const reduced = useMotionReduced();
  const [frames, setFrames] = useState<Record<number, LayoutRectangle>>({});
  const placed = useRef(false);
  const x = useSharedValue(0); const y = useSharedValue(0); const w = useSharedValue(0); const h = useSharedValue(0);
  const shown = useSharedValue(0);
  const target = selectedIndex >= 0 ? frames[selectedIndex] : undefined;
  useEffect(() => {
    if (!target) { shown.value = springTo(0, 'snappy', reduced); return; }
    if (!placed.current) {
      placed.current = true;
      x.value = target.x; y.value = target.y; w.value = target.width; h.value = target.height; shown.value = 1;
      return;
    }
    x.value = springTo(target.x, 'snappy', reduced); y.value = springTo(target.y, 'snappy', reduced);
    w.value = springTo(target.width, 'snappy', reduced); h.value = springTo(target.height, 'snappy', reduced);
    shown.value = springTo(1, 'snappy', reduced);
  }, [target?.x, target?.y, target?.width, target?.height, reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  const style = useAnimatedStyle(() => ({opacity: shown.value, left: x.value, top: y.value, width: w.value, height: h.value}));
  const onLayout = useCallback((index: number) => (event: LayoutChangeEvent) => {
    const frame = event.nativeEvent.layout;
    setFrames(current => {
      const old = current[index];
      if (old && old.x === frame.x && old.y === frame.y && old.width === frame.width && old.height === frame.height) return current;
      return {...current, [index]: frame};
    });
  }, []);
  return {style, onLayout};
}

/** The pill itself. Put it first inside the options' parent so it draws behind them. */
export function SlidingPill({style, color, testID}: {style: StyleProp<ViewStyle>; color: string; testID?: string}) {
  return <AnimatedView pointerEvents="none" testID={testID} style={[{position: 'absolute', borderRadius: 999, backgroundColor: color}, style]}/>;
}
