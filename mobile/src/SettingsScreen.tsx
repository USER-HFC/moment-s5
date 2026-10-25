import React from 'react';
import {Linking, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import {BuildInfo, minAndroidLabel} from './buildInfo';
import CameraControl from './CameraControl';
import {ui} from './theme';

const REPO = 'https://github.com/USER-HFC/moment-s5';
const NOTICE = 'https://github.com/USER-HFC/moment-s5/blob/main/NOTICE.md';

type Section = {id: string; title: string; body: React.ReactNode};
type Props = {build: BuildInfo; onBack: () => void};

function open(url: string) { void Linking.openURL(url).catch(() => undefined); }

function Row({label, value, testID}: {label: string; value: string; testID?: string}) {
  return <View style={styles.row}>
    <Text style={styles.label}>{label}</Text>
    <Text testID={testID} selectable style={styles.value}>{value}</Text>
  </View>;
}

function LinkRow({label, url}: {label: string; url: string}) {
  return <Pressable accessibilityRole="link" accessibilityLabel={label} onPress={() => open(url)} style={styles.link}>
    <Text style={styles.linkText}>{url}</Text>
  </Pressable>;
}

function About({build}: {build: BuildInfo}) {
  return <View style={styles.about}>
    <Text testID="about-project" style={styles.project}>瞬间 Lumix / Moment</Text>
    <Text style={styles.body}>为 Panasonic LUMIX 相机拍摄实况照片，可通过 USB 或实验性 Wi-Fi 连接。</Text>
    <Row label="许可" value="MIT"/>
    <Row label="作者" value="USER-HFC and Moment S5 contributors" testID="about-author"/>
    <Text style={styles.label}>仓库</Text>
    <LinkRow label="打开 GitHub 仓库" url={REPO}/>
    <Text style={styles.body}>USB 协议改编自 tethr（MIT）。曝光等属性布局参考 libgphoto2 的公开协议事实，未打包其代码。Wi-Fi 顺序参考 lumix-remote 的公开笔记（MIT），未打包其代码。内置 Fuji 风格 LUT 是本项目原创近似，不是富士官方 LUT。Gradle Wrapper 为 Apache-2.0。未包含松下固件或闭源 SDK。</Text>
    <LinkRow label="打开第三方声明" url={NOTICE}/>
    <Text style={styles.group}>打包信息</Text>
    <Row label="版本名" value={build.versionName} testID="about-version-name"/>
    <Row label="版本号" value={build.versionCode} testID="about-version-code"/>
    <Row label="构建时间" value={build.builtAt} testID="about-built-at"/>
    <Row label="提交" value={build.git} testID="about-git"/>
    <Row label="构建类型" value={build.buildType} testID="about-build-type"/>
    <Row label="ABI" value={build.abi} testID="about-abi"/>
    <Row label="最低 Android 版本" value={minAndroidLabel(build.minSdk)} testID="about-min-sdk"/>
    <Text style={styles.note}>尚未在真实相机上逐一验证。</Text>
  </View>;
}

export default function SettingsScreen({build, onBack}: Props) {
  const sections: Section[] = [{id: 'about', title: '关于', body: <About build={build}/>}];
  return <View style={styles.screen} testID="settings-screen">
    <View style={styles.header}>
      <CameraControl icon="back" accessibilityLabel="返回拍摄" onPress={onBack}/>
      <Text style={styles.title}>设置</Text>
      <View style={styles.headerSpacer}/>
    </View>
    <ScrollView contentContainerStyle={styles.content}>
      {sections.map(section => <View key={section.id} testID={`settings-${section.id}`} style={styles.section}>
        <Text style={styles.sectionTitle}>{section.title}</Text>
        {section.body}
      </View>)}
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  screen: {flex: 1, minHeight: 0, backgroundColor: ui.color.background},
  header: {minHeight: 64, paddingHorizontal: ui.space.gutter, paddingVertical: ui.space.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  title: {...ui.type.title, color: ui.color.text},
  headerSpacer: {width: ui.icon.touch},
  content: {padding: ui.space.gutter, gap: ui.space.md, paddingBottom: ui.space.xl},
  section: {padding: ui.space.gutter, gap: ui.space.sm, borderRadius: ui.radius.sheet, backgroundColor: ui.color.surface},
  sectionTitle: {...ui.type.title, color: ui.color.text},
  about: {gap: ui.space.sm},
  project: {...ui.type.title, color: ui.color.text},
  body: {...ui.type.body, color: ui.color.text},
  group: {...ui.type.body, color: ui.color.text, fontWeight: '600', marginTop: ui.space.sm},
  row: {minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: ui.space.md},
  label: {...ui.type.body, color: ui.color.muted},
  value: {...ui.type.body, color: ui.color.text, flexShrink: 1, textAlign: 'right'},
  link: {minHeight: ui.icon.touch, justifyContent: 'center'},
  linkText: {...ui.type.body, color: ui.color.accent},
  note: {...ui.type.body, color: ui.color.muted},
});
