import React, {useEffect, useState} from 'react';
import {BackHandler, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import {BuildInfo} from './buildInfo';
import AboutScreen from './AboutScreen';
import CameraControl from './CameraControl';
import CameraIcon from './CameraIcon';
import DiagnosticsScreen from './DiagnosticsScreen';
import GuideScreen from './GuideScreen';
import {Notice} from './notice';
import {AppPreferences, DEFAULT_PREFERENCES, loadPreferences, PreferenceKey, savePreference} from './preferences';
import StorageScreen from './StorageScreen';
import {ui} from './theme';

export type SettingsPage = 'list' | 'about' | 'diagnostics' | 'guide' | 'storage';
type Props = {build: BuildInfo; page: SettingsPage; onPageChange: (page: SettingsPage) => void; onBack: () => void; onNotice: (notice: Notice) => void; onShowIntro?: () => void};

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

function SettingsSwitch({label, detail, value, accessibilityLabel, testID, onValueChange}: {
  label: string; detail: string; value: boolean; accessibilityLabel: string; testID: string; onValueChange: (value: boolean) => void;
}) {
  return <Pressable testID={testID} accessibilityRole="switch" accessibilityLabel={accessibilityLabel} accessibilityState={{checked: value}}
    onPress={() => onValueChange(!value)} android_ripple={{color: ui.color.pressed}}
    style={({pressed}) => [styles.row, pressed && styles.pressed]}>
    <View style={styles.rowText}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowDetail}>{detail}</Text>
    </View>
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={[styles.track, value && styles.trackOn]}>
      <View style={[styles.thumb, value && styles.thumbOn]}/>
    </View>
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

export default function SettingsScreen({build, page, onPageChange, onBack, onNotice, onShowIntro}: Props) {
  const [prefs, setPrefs] = useState<AppPreferences>(DEFAULT_PREFERENCES);
  useEffect(() => {
    let live = true;
    void loadPreferences().then(value => { if (live && value) setPrefs(value); });
    return () => { live = false; };
  }, [page]);
  const toggle = (key: PreferenceKey, value: boolean) => {
    setPrefs(current => ({...current, [key]: value}));
    void savePreference(key, value).catch(error => {
      setPrefs(current => ({...current, [key]: !value}));
      onNotice({message: String((error as Error)?.message || error)});
    });
  };
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
  if (page === 'guide') { return <GuideScreen onBack={() => onPageChange('list')} onShowIntro={() => onShowIntro?.()}/>; }
  if (page === 'storage') { return <StorageScreen onBack={() => onPageChange('list')} onNotice={onNotice}/>; }

  return <View style={styles.screen} testID="settings-screen">
    <View style={styles.header}>
      <CameraControl icon="back" accessibilityLabel="返回拍摄" onPress={onBack}/>
      <Text style={styles.title}>设置</Text>
      <View style={styles.headerSpacer}/>
    </View>
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator>
      <View style={styles.content}>
        <SettingsGroup title="拍摄">
          <SettingsSwitch testID="settings-auto-export" label="拍摄后自动导出到系统相册" detail="每张照片保存完成后写入系统相册，失败时会提示"
            accessibilityLabel="拍摄后自动导出到系统相册" value={prefs.autoExport} onValueChange={value => toggle('autoExport', value)}/>
          <SettingsSwitch testID="settings-sync-body" label="机身快门照片自动同步" detail="关闭后不再下载机身拍摄的照片，但仍会计入，避免下次配错"
            accessibilityLabel="机身快门照片自动同步" value={prefs.syncBodyPhotos} onValueChange={value => toggle('syncBodyPhotos', value)}/>
          <SettingsSwitch testID="settings-remember" label="记住上次的拍摄设置" detail="下次启动恢复照片或动态、网格、参考框和定时"
            accessibilityLabel="记住上次的拍摄设置" value={prefs.rememberCapture} onValueChange={value => toggle('rememberCapture', value)}/>
        </SettingsGroup>
        <SettingsGroup title="照片">
          <SettingsRow testID="settings-storage" label="存储" detail="查看占用，清理已导出的副本"
            accessibilityLabel="打开存储" onPress={() => onPageChange('storage')}/>
        </SettingsGroup>
        <SettingsGroup title="帮助">
          <SettingsRow testID="settings-guide" label="使用指南" detail="连接步骤、常见问题和反馈"
            accessibilityLabel="打开使用指南" onPress={() => onPageChange('guide')}/>
        </SettingsGroup>
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
  track: {width: 52, height: 32, borderRadius: 16, borderWidth: 1, borderColor: ui.color.outline, backgroundColor: ui.color.raised, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 3},
  trackOn: {backgroundColor: ui.color.selected, borderColor: ui.color.accent},
  thumb: {width: 24, height: 24, borderRadius: 12, backgroundColor: ui.color.muted},
  thumbOn: {marginLeft: 'auto', backgroundColor: ui.color.accent},
  pressed: {backgroundColor: ui.color.raised},
});
