import React, {useEffect} from 'react';
import {BackHandler, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import {BuildInfo} from './buildInfo';
import AboutScreen from './AboutScreen';
import CameraControl from './CameraControl';
import CameraIcon from './CameraIcon';
import DiagnosticsScreen from './DiagnosticsScreen';
import {Notice} from './notice';
import {ui} from './theme';

export type SettingsPage = 'list' | 'about' | 'diagnostics';
type Props = {build: BuildInfo; page: SettingsPage; onPageChange: (page: SettingsPage) => void; onBack: () => void; onNotice: (notice: Notice) => void};

function SettingsRow({label, detail, accessibilityLabel, onPress, testID}: {
  label: string; detail?: string; accessibilityLabel: string; onPress: () => void; testID?: string;
}) {
  return <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel}
    onPress={onPress} android_ripple={{color: ui.color.pressed}}
    style={({pressed}) => [styles.row, pressed && styles.pressed]}>
    <View style={styles.rowText}>
      <Text style={styles.rowLabel}>{label}</Text>
      {!!detail && <Text style={styles.rowDetail}>{detail}</Text>}
    </View>
    <CameraIcon name="chevron"/>
  </Pressable>;
}

function SettingsGroup({title, children}: {title: string; children: React.ReactNode}) {
  return <View style={styles.group}>
    <Text style={styles.groupTitle}>{title}</Text>
    <View style={styles.card}>
      {React.Children.toArray(children).map((child, index) => <View key={index} style={index > 0 ? styles.divider : null}>{child}</View>)}
    </View>
  </View>;
}

export default function SettingsScreen({build, page, onPageChange, onBack, onNotice}: Props) {
  // Android back follows the visible page instead of jumping straight back to capture.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (page !== 'list') { onPageChange('list'); return true; }
      onBack(); return true;
    });
    return () => sub.remove();
  }, [page, onBack, onPageChange]);

  if (page === 'about') { return <AboutScreen build={build} onBack={() => onPageChange('list')}/>; }
  if (page === 'diagnostics') { return <DiagnosticsScreen onBack={() => onPageChange('list')} onNotice={onNotice}/>; }

  return <View style={styles.screen} testID="settings-screen">
    <View style={styles.header}>
      <CameraControl icon="back" accessibilityLabel="返回拍摄" onPress={onBack}/>
      <Text style={styles.title}>设置</Text>
      <View style={styles.headerSpacer}/>
    </View>
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator>
      <View style={styles.content}>
        <SettingsGroup title="连接">
          <SettingsRow testID="settings-diagnostics" label="连接诊断" detail="查看、复制或分享连接记录"
            accessibilityLabel="打开连接诊断" onPress={() => onPageChange('diagnostics')}/>
        </SettingsGroup>
        <SettingsGroup title="应用">
          <SettingsRow testID="settings-about" label="关于" detail="版本、许可与构建信息"
            accessibilityLabel="打开关于" onPress={() => onPageChange('about')}/>
        </SettingsGroup>
      </View>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  screen: {flex: 1, minHeight: 0, backgroundColor: ui.color.background},
  header: {minHeight: 64, paddingHorizontal: ui.space.gutter, paddingVertical: ui.space.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  title: {...ui.type.title, color: ui.color.text},
  headerSpacer: {width: ui.icon.touch},
  scroll: {paddingBottom: ui.space.xl},
  content: {width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: ui.space.gutter, paddingTop: ui.space.sm, gap: ui.space.lg},
  group: {gap: ui.space.sm},
  groupTitle: {...ui.type.caption, color: ui.color.muted, fontWeight: '600'},
  card: {backgroundColor: ui.color.surface, borderRadius: ui.radius.sheet, overflow: 'hidden'},
  divider: {borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ui.color.outline},
  row: {minHeight: 60, paddingHorizontal: ui.space.gutter, paddingVertical: ui.space.sm, flexDirection: 'row', alignItems: 'center', gap: ui.space.md},
  rowText: {flex: 1, minWidth: 0, gap: ui.space.xs},
  rowLabel: {...ui.type.body, color: ui.color.text},
  rowDetail: {...ui.type.caption, color: ui.color.muted},
  pressed: {backgroundColor: ui.color.raised},
});
