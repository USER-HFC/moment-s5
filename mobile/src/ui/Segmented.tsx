import React, {useEffect, useState} from 'react';
import {LayoutRectangle, Pressable, View} from 'react-native';
import {interpolateColor, useAnimatedStyle, useSharedValue} from 'react-native-reanimated';
import {cn} from './cn';
import {AnimatedView, springTo, useMotionReduced} from './motion';
import {Text} from './Text';

export type Segment<T> = {value: T; label: string; accessibilityLabel?: string; selected: boolean; testID?: string};

type Props<T> = {
  segments: Segment<T>[];
  onSelect: (value: T) => void;
  /** checkbox for multi-select (scopes), radio for one value (timer, reference). */
  role?: 'radio' | 'checkbox';
  vertical?: boolean;
  className?: string;
  testID?: string;
  accessibilityLabel?: string;
};

const SELECTED_TEXT = '#000000';
const IDLE_TEXT = '#D1D1D6';

/** A segment's own tone: white fill and black text, eased in and out. Used for multi-select. */
function SegmentFill({on, show}: {on: boolean; show: boolean}) {
  const reduced = useMotionReduced();
  const value = useSharedValue(on ? 1 : 0);
  useEffect(() => { value.value = springTo(on ? 1 : 0, 'snappy', reduced); }, [on, reduced, value]);
  const style = useAnimatedStyle(() => ({opacity: value.value, transform: [{scale: reduced ? 1 : 0.9 + 0.1 * value.value}]}));
  if (!show) return null;
  return <AnimatedView pointerEvents="none" style={[{position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, borderRadius: 999, backgroundColor: '#FFFFFF'}, style]}/>;
}

function SegmentLabel({on, label}: {on: boolean; label: string}) {
  const reduced = useMotionReduced();
  const value = useSharedValue(on ? 1 : 0);
  useEffect(() => { value.value = springTo(on ? 1 : 0, 'snappy', reduced); }, [on, reduced, value]);
  const style = useAnimatedStyle(() => ({color: interpolateColor(value.value, [0, 1], [IDLE_TEXT, SELECTED_TEXT])}));
  return <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} animated
    className="text-[14px] leading-[18px] font-semibold" style={[{fontVariant: ['tabular-nums'], color: on ? SELECTED_TEXT : IDLE_TEXT}, style]}>{label}</Text>;
}

/**
 * iOS-style segmented capsule. One choice (radio): a single white pill springs to the picked
 * segment. Several (checkbox): each segment fills in on its own.
 */
export function Segmented<T>({segments, onSelect, role = 'radio', vertical = false, className, testID, accessibilityLabel}: Props<T>) {
  const reduced = useMotionReduced();
  const [frames, setFrames] = useState<Record<number, LayoutRectangle>>({});
  const selectedIndex = segments.findIndex(segment => segment.selected);
  const target = role === 'radio' && selectedIndex >= 0 ? frames[selectedIndex] : undefined;
  const x = useSharedValue(0); const y = useSharedValue(0); const w = useSharedValue(0); const h = useSharedValue(0);
  const shown = useSharedValue(0);
  const [placed, setPlaced] = useState(false);
  useEffect(() => {
    if (!target) { shown.value = springTo(0, 'snappy', reduced); return; }
    if (!placed) {
      // First placement jumps; only later changes travel.
      x.value = target.x; y.value = target.y; w.value = target.width; h.value = target.height; shown.value = 1;
      setPlaced(true);
      return;
    }
    x.value = springTo(target.x, 'snappy', reduced); y.value = springTo(target.y, 'snappy', reduced);
    w.value = springTo(target.width, 'snappy', reduced); h.value = springTo(target.height, 'snappy', reduced);
    shown.value = springTo(1, 'snappy', reduced);
  }, [target?.x, target?.y, target?.width, target?.height, reduced]); // eslint-disable-line react-hooks/exhaustive-deps
  const pill = useAnimatedStyle(() => ({
    opacity: shown.value, left: x.value, top: y.value, width: w.value, height: h.value,
  }));

  return <View testID={testID} accessibilityLabel={accessibilityLabel} accessibilityRole={role === 'radio' ? 'radiogroup' : undefined}
    className={cn('rounded-full bg-grouped p-[3px] gap-[2px]', vertical ? 'flex-col' : 'flex-row', className)}>
    {role === 'radio' && <AnimatedView pointerEvents="none" testID={testID ? `${testID}-pill` : undefined}
      style={[{position: 'absolute', borderRadius: 999, backgroundColor: '#FFFFFF'}, pill]}/>}
    {segments.map((segment, index) => <Pressable key={String(segment.value)} testID={segment.testID} accessibilityRole={role}
      accessibilityLabel={segment.accessibilityLabel ?? segment.label} accessibilityState={{checked: segment.selected, selected: segment.selected}}
      onPress={() => onSelect(segment.value)}
      onLayout={event => { const frame = event.nativeEvent.layout; setFrames(current => ({...current, [index]: frame})); }}
      className={cn('min-h-[38px] items-center justify-center rounded-full px-2 active:opacity-70', vertical ? 'w-full' : 'flex-1')}>
      <SegmentFill on={segment.selected} show={role === 'checkbox'}/>
      <SegmentLabel on={segment.selected} label={segment.label}/>
    </Pressable>)}
  </View>;
}
