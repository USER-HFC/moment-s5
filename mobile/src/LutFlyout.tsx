import React from 'react';
import {ScrollView, View} from 'react-native';
import {FolderInput, RotateCw, X} from 'lucide-react-native';
import LutPresetList from './LutPresetList';
import {LutItem} from './native';
import {cn, Icon, RoundButton, Text} from './ui';

type Props = {
  luts: LutItem[]; activeName: string | null; disabled: boolean; landscape: boolean;
  /** Space kept clear under the panel for the HUD capsules, so the LUT pill stays tappable. */
  bottomInset: number;
  onSelect: (id: string) => Promise<void>; onImport: () => void; onRefresh: () => void; onClose: () => void;
};

// Floats over the picture rather than a modal: no scrim, so every LUT tap can be compared live. It stays open after a pick.
export default function LutFlyout({luts, activeName, disabled, landscape, bottomInset, onSelect, onImport, onRefresh, onClose}: Props) {
  return <View testID="lut-flyout" accessibilityLabel="LUT 风格面板" style={{bottom: bottomInset, elevation: 0}}
    className={cn('absolute z-[1090] gap-1 rounded-[22px] bg-grouped/95 p-2', landscape ? 'right-3 top-3 w-[260px]' : 'left-3 right-3 max-h-[62%]')}>
    <View className="flex-row items-center justify-between pl-2.5">
      <Text accessibilityRole="header" className="text-headline">LUT</Text>
      <View className="flex-row items-center gap-1">
        <RoundButton tone="plain" accessibilityLabel="导入 LUT" disabled={disabled} onPress={onImport}><Icon as={FolderInput} size={20}/></RoundButton>
        <RoundButton tone="plain" accessibilityLabel="刷新 LUT" disabled={disabled} onPress={onRefresh}><Icon as={RotateCw} size={20}/></RoundButton>
        <RoundButton tone="filled" size={30} className="bg-raised" accessibilityLabel="收起 LUT 面板" onPress={onClose}><Icon as={X} size={16} strokeWidth={2.4}/></RoundButton>
      </View>
    </View>
    <ScrollView className="shrink grow-0" contentContainerClassName="pb-1" showsVerticalScrollIndicator>
      <LutPresetList compact luts={luts} activeName={activeName} disabled={disabled} onSelect={onSelect}/>
      {!luts.length && <Text className="mt-2 px-2.5 text-caption text-muted">导入 .cube 或 .zip 文件</Text>}
    </ScrollView>
  </View>;
}
