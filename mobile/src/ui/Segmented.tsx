import React, {useEffect} from 'react';
import {Pressable, View} from 'react-native';
import {interpolateColor, useAnimatedStyle, useSharedValue} from 'react-native-reanimated';
import {cn} from './cn';
import {AnimatedView, springTo, useMotionReduced} from './motion';
import {Text} from './Text';
import {SlidingPill, useSlidingPill} from './SlidingPill';

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
  const selectedIndex = role === 'radio' ? segments.findIndex(segment => segment.selected) : -1;
  const pill = useSlidingPill(selectedIndex);

  return <View testID={testID} accessibilityLabel={accessibilityLabel} accessibilityRole={role === 'radio' ? 'radiogroup' : undefined}
    className={cn('rounded-full bg-grouped p-[3px] gap-[2px]', vertical ? 'flex-col' : 'flex-row', className)}>
    {role === 'radio' && <SlidingPill style={pill.style} color="#FFFFFF" testID={testID ? `${testID}-pill` : undefined}/>}
    {segments.map((segment, index) => <Pressable key={String(segment.value)} testID={segment.testID} accessibilityRole={role}
      accessibilityLabel={segment.accessibilityLabel ?? segment.label} accessibilityState={{checked: segment.selected, selected: segment.selected}}
      onPress={() => onSelect(segment.value)}
      onLayout={pill.onLayout(index)}
      className={cn('min-h-[38px] items-center justify-center rounded-full px-2 active:opacity-70', vertical ? 'w-full' : 'flex-1')}>
      <SegmentFill on={segment.selected} show={role === 'checkbox'}/>
      <SegmentLabel on={segment.selected} label={segment.label}/>
    </Pressable>)}
  </View>;
}
