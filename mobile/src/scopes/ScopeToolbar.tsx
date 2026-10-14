import React, {useState} from 'react';
import {Pressable, StyleSheet, View} from 'react-native';
import {Button, Text} from 'react-native-paper';
import CameraControl from '../CameraControl';
import CameraIcon from '../CameraIcon';
import CameraSheet from '../CameraSheet';
import {ui} from '../theme';
import {changeScopePanel} from './useScopes';
import {ScopePanelState, SCOPE_KINDS, SCOPE_TITLES} from './panelState';

const DESCRIPTIONS = {histogram: '红、绿、蓝与亮度分布', waveform: '画面位置与亮度', parade: '并排查看 RGB 通道', vectorscope: '色相与饱和度'};
export default function ScopeToolbar({panels}: {panels: ScopePanelState; landscape: boolean}) {
  const [picker, setPicker] = useState(false);
  const open = SCOPE_KINDS.some(kind => panels[kind].open);
  return <>
    <CameraControl icon="scopes" label="示波器" accessibilityLabel="示波器" active={open} onPress={() => setPicker(true)}/>
    <CameraSheet visible={picker} title="示波器" onClose={() => setPicker(false)}>
      <Text style={styles.hint}>可同时打开多个 · 拖动标题调整位置</Text>
      {SCOPE_KINDS.map(kind => <Pressable key={kind} testID={`scope-option-${kind}`} accessibilityRole="checkbox" accessibilityLabel={SCOPE_TITLES[kind]} accessibilityState={{checked: panels[kind].open}} onPress={() => changeScopePanel({type: 'toggle', kind})} style={({pressed}) => [styles.option, panels[kind].open && styles.selected, pressed && styles.pressed]}>
        <View style={styles.optionText}><Text style={[styles.title, panels[kind].open && styles.active]}>{SCOPE_TITLES[kind]}</Text><Text style={styles.hint}>{DESCRIPTIONS[kind]}</Text></View>
        {panels[kind].open && <CameraIcon name="check" active/>}
      </Pressable>)}
      <View style={styles.sizes}><Text style={styles.hint}>面板尺寸</Text>{(['S', 'M'] as const).map(size => <Button key={size} textColor={panels.histogram.size === size ? ui.color.accent : ui.color.text} accessibilityLabel={size === 'S' ? '小号示波器面板' : '中号示波器面板'} accessibilityState={{selected: panels.histogram.size === size}} contentStyle={styles.touch} mode={panels.histogram.size === size ? 'contained-tonal' : 'outlined'} onPress={() => changeScopePanel({type: 'resizeAll', size})}>{size === 'S' ? '小 S' : '中 M'}</Button>)}</View>
      <Text style={styles.hint}>尺寸随可用空间调整，始终保留状态栏。</Text>
      <Button textColor={ui.color.text} contentStyle={styles.touch} accessibilityLabel="关闭全部示波器" onPress={() => changeScopePanel({type: 'closeAll'})}>全部关闭</Button>
    </CameraSheet>
  </>;
}
const styles = StyleSheet.create({
  hint: {...ui.type.caption, color: ui.color.muted}, title: {...ui.type.body, color: ui.color.text}, active: {color: ui.color.accent},
  option: {minHeight: 64, padding: ui.space.md, flexDirection: 'row', alignItems: 'center', gap: ui.space.md, borderRadius: ui.radius.control, backgroundColor: ui.color.surface},
  selected: {backgroundColor: ui.color.selected}, optionText: {flex: 1, gap: ui.space.xs}, pressed: {backgroundColor: ui.color.raised},
  sizes: {flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: ui.space.sm, marginTop: ui.space.sm}, touch: {minHeight: ui.icon.touch},
});
