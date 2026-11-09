import React from 'react';
import {Pressable, View} from 'react-native';
import {cn} from './cn';
import {Text} from './Text';

export type Segment<T> = {value: T; label: string; accessibilityLabel?: string; selected: boolean; badge?: string};

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

/** iOS-style segmented capsule: selected segment is white with black text, the rest are grey. */
export function Segmented<T>({segments, onSelect, role = 'radio', vertical = false, className, testID, accessibilityLabel}: Props<T>) {
  return <View testID={testID} accessibilityLabel={accessibilityLabel} accessibilityRole={role === 'radio' ? 'radiogroup' : undefined}
    className={cn('rounded-full bg-grouped p-[3px] gap-[2px]', vertical ? 'flex-col' : 'flex-row', className)}>
    {segments.map(segment => <Pressable key={String(segment.value)} accessibilityRole={role}
      accessibilityLabel={segment.accessibilityLabel ?? segment.label} accessibilityState={{checked: segment.selected, selected: segment.selected}}
      onPress={() => onSelect(segment.value)}
      className={cn('min-h-[38px] items-center justify-center rounded-full px-2 active:opacity-70', vertical ? 'w-full' : 'flex-1', segment.selected && 'bg-ink')}>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}
        className={cn('text-[14px] leading-[18px] font-semibold', segment.selected ? 'text-black' : 'text-[#D1D1D6]')}
        style={{fontVariant: ['tabular-nums']}}>{segment.label}</Text>
    </Pressable>)}
  </View>;
}
