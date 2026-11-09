import React, {useEffect} from 'react';
import {interpolateColor, useAnimatedStyle, useSharedValue} from 'react-native-reanimated';
import {AnimatedView, springTo, useMotionReduced} from './motion';
import {Pressable, StyleSheet, View} from 'react-native';
import {ChevronLeft, ChevronRight} from 'lucide-react-native';
import {cn} from './cn';
import {Icon} from './Icon';
import {Text} from './Text';
import {color} from './tokens';
import {RoundButton} from './Button';

/** Pushed-page header: a round back button, then the large title under it, as in iOS Settings. */
export function PageHeader({title, backLabel, onBack, right}: {title: string; backLabel: string; onBack: () => void; right?: React.ReactNode}) {
  return <View className="px-4 pb-2">
    <View className="h-14 flex-row items-center justify-between">
      <RoundButton size={36} accessibilityLabel={backLabel} onPress={onBack}><Icon as={ChevronLeft} size={22}/></RoundButton>
      {right}
    </View>
    <Text accessibilityRole="header" className="text-large" style={{letterSpacing: -0.4}}>{title}</Text>
  </View>;
}

/** Inset grouped card with a small grey heading and an optional footer note. */
export function ListGroup({title, footer, children, className}: {title?: string; footer?: string; children: React.ReactNode; className?: string}) {
  const rows = React.Children.toArray(children).filter(Boolean);
  return <View className={cn('gap-1.5', className)}>
    {!!title && <Text className="px-4 text-footnote text-muted">{title}</Text>}
    <View className="overflow-hidden rounded-card bg-grouped">
      {rows.map((row, index) => <View key={index}>
        {index > 0 && <View className="ml-4 bg-separator" style={{height: StyleSheet.hairlineWidth}}/>}
        {row}
      </View>)}
    </View>
    {!!footer && <Text className="px-4 text-footnote text-muted">{footer}</Text>}
  </View>;
}

type RowProps = {
  label: string; detail?: string; value?: string; accessibilityLabel: string; testID?: string;
  onPress?: () => void; danger?: boolean; chevron?: boolean; leading?: React.ReactNode;
};

/** Navigation or action row: label (and a note under it), value on the right, chevron when it opens a page. */
export function ListRow({label, detail, value, accessibilityLabel, testID, onPress, danger = false, chevron = !!onPress, leading}: RowProps) {
  return <Pressable testID={testID} accessibilityRole={onPress ? 'button' : 'text'} accessibilityLabel={accessibilityLabel}
    disabled={!onPress} onPress={onPress} className="min-h-[52px] flex-row items-center gap-3 px-4 py-2.5 active:bg-raised">
    {leading}
    <View className="min-w-0 flex-1 gap-0.5">
      <Text className={cn('text-body', danger && 'text-danger')}>{label}</Text>
      {!!detail && <Text className="text-footnote text-muted">{detail}</Text>}
    </View>
    {!!value && <Text numberOfLines={1} className="max-w-[55%] text-right text-body text-muted" style={{fontVariant: ['tabular-nums']}}>{value}</Text>}
    {chevron && <Icon as={ChevronRight} size={18} color={color.faint} strokeWidth={2}/>}
  </Pressable>;
}

/** iOS switch: white track when on, grey when off; the thumb springs across and swaps tone. */
export function Switch({value}: {value: boolean}) {
  const reduced = useMotionReduced();
  const on = useSharedValue(value ? 1 : 0);
  useEffect(() => { on.value = springTo(value ? 1 : 0, 'snappy', reduced); }, [value, reduced, on]);
  const track = useAnimatedStyle(() => ({backgroundColor: interpolateColor(on.value, [0, 1], [color.off, color.ink])}));
  const thumb = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(on.value, [0, 1], [color.ink, '#000000']),
    transform: [{translateX: on.value * 20}],
  }));
  return <AnimatedView accessibilityElementsHidden importantForAccessibility="no-hide-descendants"
    style={[{height: 31, width: 51, borderRadius: 16, paddingHorizontal: 2, justifyContent: 'center'}, track]}>
    <AnimatedView style={[{height: 27, width: 27, borderRadius: 14}, thumb]}/>
  </AnimatedView>;
}

export function ListSwitch({label, detail, value, accessibilityLabel, testID, onValueChange}: {
  label: string; detail?: string; value: boolean; accessibilityLabel: string; testID?: string; onValueChange: (value: boolean) => void;
}) {
  return <Pressable testID={testID} accessibilityRole="switch" accessibilityLabel={accessibilityLabel} accessibilityState={{checked: value}}
    onPress={() => onValueChange(!value)} className="min-h-[52px] flex-row items-center gap-3 px-4 py-2.5 active:bg-raised">
    <View className="min-w-0 flex-1 gap-0.5">
      <Text className="text-body">{label}</Text>
      {!!detail && <Text className="text-footnote text-muted">{detail}</Text>}
    </View>
    <Switch value={value}/>
  </Pressable>;
}
