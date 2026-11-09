import React from 'react';
import {Pressable, ScrollView, View} from 'react-native';
import {Activity, Grid3x3, Mic, MicOff, Scan, ScanEye, SlidersHorizontal, Timer} from 'lucide-react-native';
import type {LucideIcon} from 'lucide-react-native';
import {cn, color, Icon, Segmented, Text} from './ui';
import type {Segment} from './ui';
import {GUIDE_ORDER, Guide} from './referenceFrame';
import {ScopeKind, ScopePanelState, SCOPE_KINDS, SCOPE_TITLES} from './scopes/panelState';

/** The option row that replaces the control row. null shows the controls themselves. */
export type DrawerOption = 'delay' | 'guide' | 'scopes' | 'focus' | null;

export const DELAY_CHOICES = [null, 2, 5, 10, 30] as const;
const SCOPE_SHORT: Record<ScopeKind, string> = {histogram: '直方图', waveform: '波形', parade: '分列', vectorscope: '矢量'};

type Props = {
  vertical: boolean;
  option: DrawerOption;
  onOption: (option: DrawerOption) => void;
  grid: boolean; onGrid: () => void;
  guide: Guide; onGuide: (guide: Guide) => void;
  timerEnabled: boolean; delay: number; waiting: boolean; onDelay: (seconds: number | null) => void; onCancelCountdown: () => void;
  audio: boolean; onAudio: () => void;
  scopes: ScopePanelState; onScope: (kind: ScopeKind) => void;
  canFocus: boolean; focusDisabled: boolean; onFocus: (direction: -1 | 1) => void;
};

type ItemProps = {
  icon: LucideIcon; name: string; on: boolean; accessibilityLabel: string; accessibilityHint?: string;
  checked?: boolean; disabled?: boolean; testID?: string; onPress: () => void;
};

/** One drawer control: a 44 circle, white when on, grey when off, with its name underneath. */
function Item({icon, name, on, accessibilityLabel, accessibilityHint, checked, disabled, testID, onPress}: ItemProps) {
  return <Pressable testID={testID} accessibilityRole={checked === undefined ? 'button' : 'switch'} accessibilityLabel={accessibilityLabel}
    accessibilityHint={accessibilityHint} accessibilityState={checked === undefined ? {selected: on, disabled: !!disabled} : {checked, disabled: !!disabled}}
    disabled={disabled} onPress={onPress} className={cn('w-16 items-center gap-1.5 active:opacity-70', disabled && 'opacity-40')}>
    <View className={cn('h-11 w-11 items-center justify-center rounded-full', on ? 'bg-ink' : 'bg-grouped')}>
      <Icon as={icon} size={20} color={on ? '#000000' : color.ink}/>
    </View>
    <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}
      className={cn('text-[11px] leading-[13px] font-medium', on ? 'text-ink' : 'text-muted')}>{name}</Text>
  </Pressable>;
}

/** Collapse button at the head of an option row; it reads as the control that was opened. */
function Head({icon, accessibilityLabel, onPress}: {icon: LucideIcon; accessibilityLabel: string; onPress: () => void}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} hitSlop={4}
    className="h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ink active:opacity-70">
    <Icon as={icon} size={20} color="#000000"/>
  </Pressable>;
}

export default function CaptureDrawer(props: Props) {
  const {vertical, option, onOption} = props;
  const row = (testID: string, accessibilityLabel: string, head: React.ReactNode, body: React.ReactNode, caption?: string) =>
    <View testID={testID} accessibilityLabel={accessibilityLabel}
      className={cn(vertical ? 'w-full flex-1 items-center gap-3 py-2' : 'w-full gap-2 px-4')}>
      <View className={cn(vertical ? 'flex-1 items-center gap-3' : 'flex-row items-center gap-3')}>
        {head}
        <View className={vertical ? 'w-[64px] flex-1' : 'flex-1'}>{body}</View>
      </View>
      {!!caption && !vertical && <Text className="text-center text-caption text-muted">{caption}</Text>}
    </View>;
  const close = () => onOption(null);

  if (option === 'delay') {
    const segments: Segment<number | null>[] = DELAY_CHOICES.map(value => ({
      value, label: value == null ? '关' : vertical ? `${value}s` : `${value} 秒`,
      accessibilityLabel: value == null ? '关闭定时' : `定时 ${value} 秒`,
      selected: value == null ? !props.timerEnabled : props.timerEnabled && props.delay === value,
    }));
    return row('timer-flyout', '定时选项', <Head icon={Timer} accessibilityLabel="收起定时面板" onPress={close}/>,
      <Segmented segments={segments} vertical={vertical} accessibilityLabel="定时" onSelect={props.onDelay}/>,
      '按快门后倒数，倒数中再按一次取消');
  }
  if (option === 'guide') {
    const segments: Segment<Guide>[] = GUIDE_ORDER.map(value => ({
      value, label: value === 'off' ? '关' : value,
      accessibilityLabel: value === 'off' ? '关闭构图参考' : `构图参考 ${value}`,
      selected: props.guide === value,
    }));
    return row('reference-flyout', '构图参考选项', <Head icon={Scan} accessibilityLabel="收起构图参考" onPress={close}/>,
      <Segmented segments={segments} vertical={vertical} accessibilityLabel="构图参考" onSelect={props.onGuide}/>,
      '只叠加参考框，不改变取景和照片');
  }
  if (option === 'scopes') {
    const segments: Segment<ScopeKind>[] = SCOPE_KINDS.map(kind => ({
      value: kind, label: SCOPE_SHORT[kind], accessibilityLabel: SCOPE_TITLES[kind], selected: props.scopes[kind].open,
    }));
    return row('scope-options', '示波器选项', <Head icon={Activity} accessibilityLabel="收起示波器" onPress={close}/>,
      <Segmented segments={segments} role="checkbox" vertical={vertical} accessibilityLabel="示波器" onSelect={props.onScope}/>,
      '可同时打开多个，拖动图表可移动');
  }
  if (option === 'focus' && props.canFocus) {
    const focusButton = (direction: -1 | 1, label: string, accessibilityLabel: string, hint: string) =>
      <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityHint={`${hint}，可连续点按`}
        disabled={props.focusDisabled} onPress={() => props.onFocus(direction)}
        className={cn('min-h-[38px] items-center justify-center rounded-full bg-raised px-3 active:bg-control', vertical ? 'w-full' : 'flex-1', props.focusDisabled && 'opacity-40')}>
        <Text className="text-[14px] leading-[18px] font-semibold">{label}</Text>
      </Pressable>;
    return row('focus-flyout', '手动对焦选项', <Head icon={ScanEye} accessibilityLabel="收起对焦面板" onPress={close}/>,
      <View className={cn('rounded-full bg-grouped p-[3px] gap-[3px]', vertical ? 'flex-col' : 'flex-row')}>
        {focusButton(1, vertical ? '近' : '向近处', '近对焦', '向近处')}
        {focusButton(-1, vertical ? '远' : '向远处', '远对焦', '向远处')}
      </View>,
      '每点一次移动一小步');
  }

  const scopesOpen = SCOPE_KINDS.some(kind => props.scopes[kind].open);
  const timerName = props.waiting ? '取消' : props.timerEnabled ? `${props.delay} 秒` : '定时';
  const items = <>
    <Item icon={Grid3x3} name="网格" on={props.grid} checked={props.grid} accessibilityLabel="构图网格" onPress={props.onGrid}/>
    <Item icon={Scan} name={props.guide === 'off' ? '参考' : props.guide} on={props.guide !== 'off'}
      accessibilityLabel={props.guide === 'off' ? '构图参考 关' : `构图参考 ${props.guide}`} accessibilityHint="打开构图参考选项" onPress={() => onOption('guide')}/>
    <Item icon={Timer} name={timerName} on={props.timerEnabled || props.waiting}
      accessibilityLabel={props.waiting ? '取消定时' : props.timerEnabled ? `定时 ${props.delay} 秒` : '定时 关'}
      accessibilityHint={props.waiting ? '取消倒计时并关闭定时' : '打开定时选项'}
      onPress={() => { if (props.waiting) props.onCancelCountdown(); else onOption('delay'); }}/>
    <Item icon={props.audio ? Mic : MicOff} name="收音" on={props.audio} checked={props.audio} accessibilityLabel={props.audio ? '收音 开' : '收音 关'} onPress={props.onAudio}/>
    <Item icon={Activity} name="示波器" on={scopesOpen} accessibilityLabel="示波器" accessibilityHint="打开示波器选项" onPress={() => onOption('scopes')}/>
    {props.canFocus && <Item testID="focus-button" icon={ScanEye} name="对焦" on={false} disabled={props.focusDisabled}
      accessibilityLabel="对焦" accessibilityHint="打开近/远对焦" onPress={() => onOption('focus')}/>}
  </>;
  return vertical
    ? <ScrollView testID="capture-drawer" accessibilityLabel="拍摄控制" contentContainerClassName="items-center gap-3 py-2">{items}</ScrollView>
    : <View testID="capture-drawer" accessibilityLabel="拍摄控制" className="w-full flex-row justify-evenly px-2">{items}</View>;
}

/** Drawer toggle beside the shutter: grey when closed, white when open. */
export function DrawerToggle({open, onPress}: {open: boolean; onPress: () => void}) {
  return <Pressable testID="drawer-toggle" accessibilityRole="button" accessibilityLabel="拍摄控制" accessibilityState={{expanded: open}}
    accessibilityHint={open ? '收起拍摄控制' : '展开网格、参考、定时、收音和示波器'} onPress={onPress}
    className={cn('h-12 w-12 items-center justify-center rounded-full active:opacity-70', open ? 'bg-ink' : 'bg-grouped')}>
    <Icon as={SlidersHorizontal} size={22} color={open ? '#000000' : color.ink}/>
  </Pressable>;
}
