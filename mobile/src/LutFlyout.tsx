import React from 'react';
import {ScrollView, StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import CameraControl from './CameraControl';
import LutPresetList from './LutPresetList';
import {LutItem} from './native';
import {ui} from './theme';

type Props = {
  luts: LutItem[]; activeName: string | null; disabled: boolean; landscape: boolean;
  /** Size of the tool rail the flyout opens from. */
  rail: {width: number; height: number};
  onSelect: (id: string) => Promise<void>; onImport: () => void; onRefresh: () => void; onClose: () => void;
};

// A second-level panel beside the tool rail rather than a modal: no scrim and no shadow, so the
// viewfinder stays visible and every LUT tap can be compared live. It stays open after a pick.
export default function LutFlyout({luts, activeName, disabled, landscape, rail, onSelect, onImport, onRefresh, onClose}: Props) {
  const anchor = landscape ? {left: rail.width, top: ui.space.sm, bottom: ui.space.sm} : {top: rail.height, left: ui.space.gutter};
  return <View testID="lut-flyout" accessibilityLabel="LUT 风格面板" style={[styles.flyout, landscape ? styles.landscape : styles.portrait, anchor]}>
    <View style={styles.header}>
      <Text style={styles.title} accessibilityRole="header">LUT</Text>
      <View style={styles.actions}>
        <CameraControl icon="import" accessibilityLabel="导入 LUT" disabled={disabled} onPress={onImport}/>
        <CameraControl icon="refresh" accessibilityLabel="刷新 LUT" disabled={disabled} onPress={onRefresh}/>
        <CameraControl icon="close" accessibilityLabel="收起 LUT 面板" onPress={onClose}/>
      </View>
    </View>
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator>
      <LutPresetList compact luts={luts} activeName={activeName} disabled={disabled} onSelect={onSelect}/>
      {!luts.length && <Text style={styles.muted}>导入 .cube 或 .zip 文件</Text>}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  // Flat on purpose: outline only, no elevation or shadow.
  flyout: {position: 'absolute', zIndex: 10, padding: ui.space.sm, gap: ui.space.xs, borderRadius: ui.radius.control,
    borderWidth: 1, borderColor: ui.color.outline, backgroundColor: ui.color.background, elevation: 0},
  landscape: {width: 208}, portrait: {width: 208, maxWidth: '60%', maxHeight: '62%'},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: ui.space.sm},
  title: {...ui.type.title, color: ui.color.text}, actions: {flexDirection: 'row', alignItems: 'center'},
  scroll: {flexGrow: 0, flexShrink: 1}, content: {paddingBottom: ui.space.xs},
  muted: {...ui.type.caption, color: ui.color.muted, marginTop: ui.space.sm},
});
