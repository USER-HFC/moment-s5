import React from 'react';
import {ScrollView, View} from 'react-native';
import {FolderInput, RotateCw, X} from 'lucide-react-native';
import LutPresetList from './LutPresetList';
import {LutItem} from './native';
import {Icon, Presence, RoundButton, Text} from './ui';

type Props = {
  visible: boolean;
  luts: LutItem[]; activeName: string | null; disabled: boolean; landscape: boolean;
  /** Space kept clear under the panel for the HUD capsules, so the LUT pill stays tappable. */
  bottomInset: number;
  onSelect: (id: string) => Promise<void>; onImport: () => void; onRefresh: () => void; onClose: () => void;
};

// Floats over the picture rather than a modal: no scrim, so every LUT tap can be compared live. It stays open after a pick.
export default function LutFlyout({visible, luts, activeName, disabled, landscape, bottomInset, onSelect, onImport, onRefresh, onClose}: Props) {
  // Rises out of the LUT pill below it (portrait) or slides in from the right edge (landscape).
  return <Presence visible={visible} kind={landscape ? 'push' : 'rise'} distance={landscape ? 40 : 24} spring="smooth"
    style={[{position: 'absolute', zIndex: 1090, bottom: bottomInset, elevation: 0}, landscape ? {right: 12, top: 12, width: 260} : {left: 12, right: 12, maxHeight: '62%'}]}>
  <View testID="lut-flyout" accessibilityLabel="LUT 风格面板" className="shrink gap-1 rounded-[22px] bg-grouped/95 p-2" style={{elevation: 0}}>
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
  </View>
  </Presence>;
}
