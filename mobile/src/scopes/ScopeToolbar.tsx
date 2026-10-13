import React, {useState} from 'react';
import {Modal, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Button, Text} from 'react-native-paper';
import Svg, {Path} from 'react-native-svg';
import {changeScopePanel} from './useScopes';
import {ScopePanelState, SCOPE_KINDS, SCOPE_TITLES} from './panelState';

const DESCRIPTIONS = {
  histogram: '红、绿、蓝与亮度分布', waveform: '画面横向位置与亮度',
  parade: '并排查看三个 RGB 通道', vectorscope: '色相、饱和度与中性色',
};

export default function ScopeToolbar({panels, landscape}: {panels: ScopePanelState; landscape: boolean}) {
  const [picker, setPicker] = useState(false);
  const open = SCOPE_KINDS.some(kind => panels[kind].open);
  return <>
    <Pressable hitSlop={6} accessibilityRole="button" accessibilityLabel="示波器" accessibilityState={{selected: open}} onPress={() => setPicker(true)} style={({pressed}) => [styles.tool, landscape && styles.landscapeTool, pressed && styles.pressed]}>
      <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="M3 20h18M5 17v-5m4 5V5m4 12V9m4 8V3m4 14v-7" fill="none" stroke={open ? '#EEE689' : '#E4E6DF'} strokeWidth={1.7} strokeLinecap="round"/></Svg>
      <Text numberOfLines={1} style={[styles.toolText, open && styles.accent]}>示波器</Text>
    </Pressable>
    <Modal visible={picker} transparent animationType="none" supportedOrientations={['portrait', 'landscape']} onRequestClose={() => setPicker(false)}>
      <SafeAreaView style={styles.scrim}>
        <View style={styles.picker} accessibilityViewIsModal>
          <View style={styles.header}><Text variant="titleMedium">示波器 / Scopes</Text><Button onPress={() => setPicker(false)} contentStyle={styles.touch}>完成</Button></View>
          <Text style={styles.hint}>可同时打开多个，拖动面板标题调整位置</Text>
          <ScrollView showsVerticalScrollIndicator={false}>
            {SCOPE_KINDS.map(kind => <Pressable key={kind} testID={`scope-option-${kind}`} accessibilityRole="checkbox" accessibilityLabel={SCOPE_TITLES[kind]} accessibilityState={{checked: panels[kind].open}} onPress={() => changeScopePanel({type: 'toggle', kind})} style={({pressed}) => [styles.option, panels[kind].open && styles.selected, pressed && styles.pressed]}>
              <View style={styles.optionText}><Text>{SCOPE_TITLES[kind]}</Text><Text style={styles.hint}>{DESCRIPTIONS[kind]}</Text></View><Text style={styles.check}>{panels[kind].open ? '✓' : '+'}</Text>
            </Pressable>)}
          </ScrollView>
          <View style={styles.footer}><Text style={styles.hint}>分析监看 JPEG · LUT 后</Text><Button onPress={() => changeScopePanel({type: 'closeAll'})} contentStyle={styles.touch}>全部关闭</Button></View>
        </View>
      </SafeAreaView>
    </Modal>
  </>;
}

const styles = StyleSheet.create({
  tool: {width: 48, height: 48, alignItems: 'center', justifyContent: 'center', gap: 2, borderRadius: 10},
  landscapeTool: {height: 40}, toolText: {fontSize: 8, lineHeight: 10, color: '#B0B9AB'}, accent: {color: '#EEE689'},
  pressed: {backgroundColor: '#202321'}, scrim: {flex: 1, justifyContent: 'center', padding: 16, backgroundColor: '#00000099'},
  picker: {alignSelf: 'center', width: '100%', maxWidth: 440, maxHeight: '95%', padding: 16, gap: 10, borderRadius: 12, backgroundColor: '#101614', borderWidth: 1, borderColor: '#53604B'},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}, touch: {minHeight: 48},
  hint: {fontSize: 11, color: '#B0B9AB'}, option: {minHeight: 58, marginVertical: 4, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderRadius: 8, borderWidth: 1, borderColor: '#354039'},
  selected: {borderColor: '#EEE689', backgroundColor: '#222B1E'}, optionText: {flex: 1, gap: 4}, check: {fontSize: 20, paddingLeft: 12, color: '#EEE689'},
  footer: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap'},
});
