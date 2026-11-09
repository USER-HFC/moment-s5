import React from 'react';
import {Pressable, View} from 'react-native';
import {Check} from 'lucide-react-native';
import {LutItem} from './native';
import {lutDisplayName} from './lutName';
import {cn, Icon, Text} from './ui';

export {lutDisplayName};
const STRIPS: Record<string, string[]> = {
  off: ['#E2D3B1', '#97AF99', '#4B7676', '#294343'],
  acros: ['#F0F0EB', '#ACACA7', '#686862', '#282823'],
  eterna: ['#CBC2A7', '#A4A995', '#5F7771', '#3A4948'],
  velvia: ['#EFBA77', '#B4C65C', '#439283', '#254F63'],
  astia: ['#EBD4BD', '#B7BBA2', '#7A9F9C', '#445B68'],
  'classic-chrome': ['#DCC6A5', '#AEA997', '#7E9295', '#404D5A'],
  'classic-negative': ['#E1B58D', '#A3AB85', '#698E91', '#344856'],
  'pro-neg': ['#DDC5B3', '#B7B59D', '#829E97', '#4E656A'],
};
function strip(id: string) {return Object.entries(STRIPS).find(([key]) => id.includes(key))?.[1] || ['#D8C5A2', '#A5AA88', '#6E8D8C', '#374F5C'];}
type Props = {luts: LutItem[]; activeName: string | null; disabled: boolean; onSelect: (id: string) => Promise<void>;
  /** Narrow rows for the floating panel, so most of the viewfinder stays visible. */
  compact?: boolean};

export default function LutPresetList({luts, activeName, disabled, onSelect, compact = false}: Props) {
  const groups = [
    {title: '原色', items: [{id: 'off', name: '原色', size: 0}] as LutItem[]},
    {title: compact ? '内置（非官方）' : '内置 Fuji 风格（非官方）', items: luts.filter(lut => lut.builtIn)},
    {title: '已导入', items: luts.filter(lut => !lut.builtIn)},
  ];
  return <>{groups.map(group => group.items.length > 0 && <View key={group.title} className="gap-0.5">
    {group.title !== '原色' && <Text className="mb-1 mt-3 px-2.5 text-caption text-muted">{group.title}</Text>}
    {group.items.map(lut => {
      const selected = lut.id === 'off' ? !activeName : activeName === lut.name;
      return <Pressable key={lut.id} accessibilityRole="button" accessibilityLabel={`选择 LUT ${lutDisplayName(lut.name)}`}
        accessibilityHint={lut.builtIn ? '内置只读预设，作用于监看与渲染照片' : undefined}
        accessibilityState={{selected, disabled}} disabled={disabled} onPress={() => onSelect(lut.id)}
        className={cn('flex-row items-center rounded-xl active:bg-raised', compact ? 'min-h-[44px] gap-2.5 pl-2.5 pr-4' : 'min-h-[56px] gap-3 px-3', selected && 'bg-raised', disabled && 'opacity-45')}>
        <View accessible={false} className={cn('flex-row overflow-hidden rounded-[5px]', compact ? 'h-5 w-7' : 'h-8 w-12')}>
          {strip(lut.id).map((swatch, index) => <View key={index} className="flex-1" style={{backgroundColor: swatch}}/>)}
        </View>
        <Text numberOfLines={1} className={cn('flex-1', compact ? 'text-[14px] leading-[19px]' : 'text-body', selected && 'font-semibold')}>{lutDisplayName(lut.name)}</Text>
        {selected && <View className={compact ? 'h-[5px] w-[5px] rounded-full bg-leica' : ''}>{!compact && <Icon as={Check} size={20}/>}</View>}
      </Pressable>;
    })}
  </View>)}{luts.some(lut => lut.builtIn) && <Text className="mt-3 px-2.5 text-caption text-muted">{compact ? '非官方近似 · SDR' : '非官方近似 · SDR sRGB / Rec.709'}</Text>}</>;
}
