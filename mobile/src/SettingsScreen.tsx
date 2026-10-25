import React, {useEffect, useState} from 'react';
import {BackHandler, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import {BuildInfo} from './buildInfo';
import AboutScreen from './AboutScreen';
import CameraControl from './CameraControl';
import CameraIcon from './CameraIcon';
import {ui} from './theme';

type Page = 'list' | 'about';
type Props = {build: BuildInfo; onBack: () => void};

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

export default function SettingsScreen({build, onBack}: Props) {
  const [page, setPage] = useState<Page>('list');

  // Android back follows the visible page instead of jumping straight back to capture.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (page === 'about') { setPage('list'); return true; }
      onBack(); return true;
    });
    return () => sub.remove();
  }, [page, onBack]);

  if (page === 'about') { return <AboutScreen build={build} onBack={() => setPage('list')}/>; }

  return <View style={styles.screen} testID="settings-screen">
    <View style={styles.header}>
      <CameraControl icon="back" accessibilityLabel="返回拍摄" onPress={onBack}/>
      <Text style={styles.title}>设置</Text>
      <View style={styles.headerSpacer}/>
    </View>
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator>
      <View style={styles.content}>
        <SettingsGroup title="应用">
          <SettingsRow testID="settings-about" label="关于" detail="版本、许可与构建信息"
            accessibilityLabel="打开关于" onPress={() => setPage('about')}/>
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
  content: {width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: ui.space.gutter, paddingTop: ui.space.sm},
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
