import React, {useEffect, useRef, useState} from 'react';
import {BackHandler, ScrollView, View} from 'react-native';
import {ListGroup as SettingsGroup, ListRow, ListSwitch as SettingsSwitch, PageHeader, Presence} from './ui';
import {BuildInfo} from './buildInfo';
import AboutScreen from './AboutScreen';
import DiagnosticsScreen from './DiagnosticsScreen';
import GuideScreen from './GuideScreen';
import {camera} from './native';
import {Notice} from './notice';
import {AppPreferences, DEFAULT_PREFERENCES, loadPreferences, PreferenceKey, savePreference, storageSummary} from './preferences';
import StorageScreen from './StorageScreen';

export type SettingsPage = 'list' | 'about' | 'diagnostics' | 'guide' | 'storage';
type Props = {build: BuildInfo; page: SettingsPage; onPageChange: (page: SettingsPage) => void; onBack: () => void; onNotice: (notice: Notice) => void; onShowIntro?: () => void};

export default function SettingsScreen({build, page, onPageChange, onBack, onNotice, onShowIntro}: Props) {
  const [prefs, setPrefs] = useState<AppPreferences>(DEFAULT_PREFERENCES);
  const [storageDetail, setStorageDetail] = useState('…');
  useEffect(() => {
    let live = true;
    void loadPreferences().then(value => { if (live && value) setPrefs(value); });
    return () => { live = false; };
  }, [page]);
  useEffect(() => {
    if (page !== 'list') return undefined;
    let live = true;
    if (!camera?.storageUsage) { setStorageDetail('未知'); return undefined; }
    setStorageDetail('…');
    void camera.storageUsage().then(usage => { if (live) setStorageDetail(storageSummary(usage)); }).catch(() => { if (live) setStorageDetail('未知'); });
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

  // A sub-page pushes in from the right; going back, the list slides in from the left.
  // The first page shown arrives with the settings cover itself, so it does not move on its own.
  // Direction is fixed when the page changes, so a re-render mid-slide cannot flip it.
  const transition = useRef<{page: SettingsPage | null; kind: 'push' | 'pushBack'; first: boolean}>({page: null, kind: 'push', first: true});
  if (transition.current.page !== page) {
    const from = transition.current.page;
    transition.current = {page, kind: page === 'list' && from !== null ? 'pushBack' : 'push', first: from === null};
  }
  const {kind: pageKind, first: firstShown} = transition.current;
  const screen = (content: React.ReactNode) => <Presence key={page} visible appear={!firstShown} kind={pageKind} distance={56} spring="smooth" style={{flex: 1}}>{content}</Presence>;

  if (page === 'about') { return screen(<AboutScreen build={build} onBack={() => onPageChange('list')}/>); }
  if (page === 'diagnostics') { return screen(<DiagnosticsScreen onBack={() => onPageChange('list')} onNotice={onNotice}/>); }
  if (page === 'guide') { return screen(<GuideScreen onBack={() => onPageChange('list')} onShowIntro={() => onShowIntro?.()}/>); }
  if (page === 'storage') { return screen(<StorageScreen onBack={() => onPageChange('list')} onNotice={onNotice}/>); }

  return screen(<View className="flex-1 bg-canvas" testID="settings-screen">
    <PageHeader title="设置" backLabel="返回拍摄" onBack={onBack}/>
    <ScrollView contentContainerClassName="pb-10" showsVerticalScrollIndicator>
      <View className="w-full max-w-[640px] gap-7 self-center px-4 pt-3">
        <SettingsGroup title="拍摄">
          <SettingsSwitch testID="settings-auto-export" label="拍摄后自动导出到系统相册" detail="每张照片保存完成后写入系统相册，失败时会提示"
            accessibilityLabel="拍摄后自动导出到系统相册" value={prefs.autoExport} onValueChange={value => toggle('autoExport', value)}/>
          <SettingsSwitch testID="settings-sync-body" label="机身快门照片自动同步" detail="关闭后不再下载机身拍摄的照片，但仍会计入，避免下次配错"
            accessibilityLabel="机身快门照片自动同步" value={prefs.syncBodyPhotos} onValueChange={value => toggle('syncBodyPhotos', value)}/>
          <SettingsSwitch testID="settings-remember" label="记住上次的拍摄设置" detail="下次启动恢复照片或动态、网格、参考框和定时"
            accessibilityLabel="记住上次的拍摄设置" value={prefs.rememberCapture} onValueChange={value => toggle('rememberCapture', value)}/>
          <SettingsSwitch testID="settings-volume-shutter" label="音量键拍摄" detail="在拍摄页按音量键拍照。定时会倒计时，倒计时中再按一次取消"
            accessibilityLabel="音量键拍摄" value={prefs.volumeShutter} onValueChange={value => toggle('volumeShutter', value)}/>
          <SettingsSwitch testID="settings-reverse-focus" label="反转近 / 远对焦方向" detail="近和远的文字不变，只对调这两个按钮的动作"
            accessibilityLabel="反转近 / 远对焦方向" value={prefs.reverseFocus} onValueChange={value => toggle('reverseFocus', value)}/>
          <SettingsSwitch testID="settings-shutter-vibration" label="快门震动" detail="按下快门时轻微震动"
            accessibilityLabel="快门震动" value={prefs.shutterVibration} onValueChange={value => toggle('shutterVibration', value)}/>
        </SettingsGroup>
        <SettingsGroup title="照片">
          <ListRow testID="settings-storage" label="存储" value={storageDetail}
            accessibilityLabel={`打开存储，${storageDetail}`} onPress={() => onPageChange('storage')}/>
        </SettingsGroup>
        <SettingsGroup title="帮助">
          <ListRow testID="settings-guide" label="使用指南" detail="连接步骤、常见问题和反馈"
            accessibilityLabel="打开使用指南" onPress={() => onPageChange('guide')}/>
        </SettingsGroup>
        <SettingsGroup title="连接">
          <ListRow testID="settings-diagnostics" label="连接诊断" detail="查看、复制或分享连接记录"
            accessibilityLabel="打开连接诊断" onPress={() => onPageChange('diagnostics')}/>
        </SettingsGroup>
        <SettingsGroup title="应用">
          <ListRow testID="settings-about" label="关于" value={build.versionName}
            accessibilityLabel={`打开关于，版本 ${build.versionName}`} onPress={() => onPageChange('about')}/>
        </SettingsGroup>
      </View>
    </ScrollView>
  </View>);
}
