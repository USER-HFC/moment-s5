import React, {useEffect, useState} from 'react';
import {Clipboard, Image, Linking, ScrollView, StyleSheet, View} from 'react-native';
import {Tappable as Pressable} from './ui';
import {Text} from 'react-native-paper';
import {BuildInfo, buildInfoText, formatBuiltAt} from './buildInfo';
import {minSystemLabel, minSystemTitle} from './platformText';
import CameraIcon from './CameraIcon';
// Rasterized from app/src/main/res/drawable/ic_moment.xml: Image cannot load a native vector drawable by resource name.
import appIcon from './assets/ic_moment.png';
import {ui} from './theme';
import {Check, Copy} from 'lucide-react-native';
import {Button as UIButton, Icon, PageHeader, Text as UIText} from './ui';

const REPO = 'https://github.com/USER-HFC/moment-s5';
const NOTICE = 'https://github.com/USER-HFC/moment-s5/blob/main/NOTICE.md';
const AUTHOR = 'USER-HFC 及贡献者';

type ActionRowProps = {
  label: string; accessibilityLabel: string; value?: string; detail?: string;
  onPress: () => void; testID?: string;
};

function open(url: string) { Linking.openURL(url).catch(() => undefined); }

function InfoRow({label, value, testID}: {label: string; value: string; testID?: string}) {
  return <View style={styles.row}>
    <Text style={styles.label}>{label}</Text>
    <Text testID={testID} selectable style={styles.value}>{value}</Text>
  </View>;
}

function ActionRow({label, accessibilityLabel, value, detail, onPress, testID}: ActionRowProps) {
  return <Pressable testID={testID} accessibilityRole="link" accessibilityLabel={accessibilityLabel}
    onPress={onPress} android_ripple={{color: ui.color.pressed}}
    style={({pressed}) => [styles.row, styles.actionRow, pressed && styles.pressed]}>
    <View style={styles.actionText}>
      <Text style={styles.label}>{label}</Text>
      {!!detail && <Text style={styles.detail}>{detail}</Text>}
    </View>
    <View style={styles.actionEnd}>
      {!!value && <Text style={styles.value}>{value}</Text>}
      <CameraIcon name="external"/>
    </View>
  </Pressable>;
}

function Group({title, footer, children}: {title: string; footer?: React.ReactNode; children: React.ReactNode}) {
  return <View style={styles.group}>
    <Text style={styles.groupTitle}>{title}</Text>
    <View style={styles.card}>
      {React.Children.toArray(children).map((child, index) => <View key={index}>{index > 0 && <View style={styles.divider}/>}{child}</View>)}
    </View>
    {footer}
  </View>;
}

export default function AboutScreen({build, onBack}: {build: BuildInfo; onBack: () => void}) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    Clipboard.setString(buildInfoText(build));
    setCopied(true);
  };
  // The Android 13 clipboard overlay covers the bottom of the screen, so confirm in place as well.
  useEffect(() => {
    if (!copied) { return; }
    const timer = setTimeout(() => setCopied(false), 5000);
    return () => clearTimeout(timer);
  }, [copied]);
  return <View style={styles.screen} testID="about-screen">
    <PageHeader title="关于" backLabel="返回设置" onBack={onBack}/>
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator>
      <View style={styles.content}>
        <View style={styles.hero}>
          <Image accessible accessibilityLabel="应用图标" source={appIcon} style={styles.appIcon}/>
          <View style={styles.heroText}>
            <Text testID="about-project" style={styles.appName}>瞬间 Lumix</Text>
            <Text testID="about-version" accessibilityLabel={`版本 ${build.versionName}，版本号 ${build.versionCode}`} style={styles.version}>{build.versionName}（{build.versionCode}）</Text>
            <Text style={styles.tagline}>为 Panasonic LUMIX 相机拍摄动态照片</Text>
          </View>
        </View>

        <Group title="应用">
          <InfoRow label="作者" value={AUTHOR} testID="about-author"/>
          <InfoRow label="许可" value="MIT" testID="about-license"/>
          <ActionRow label="项目主页" accessibilityLabel="打开项目主页 GitHub" value="GitHub" onPress={() => open(REPO)} testID="about-homepage"/>
          <ActionRow label="第三方声明" accessibilityLabel="查看第三方声明 NOTICE" detail="USB 协议参考 tethr（MIT），完整声明见 NOTICE" onPress={() => open(NOTICE)} testID="about-notice"/>
        </Group>

        <Group title="打包信息" footer={<UIButton variant="secondary" accessibilityLabel={copied ? '版本信息已复制' : '复制版本信息'} testID="copy-build-info" onPress={copy}>
            <Icon as={copied ? Check : Copy} size={18}/><UIText>{copied ? '已复制' : '复制版本信息'}</UIText>
          </UIButton>}>
          <InfoRow label="版本名" value={build.versionName} testID="about-version-name"/>
          <InfoRow label="版本号" value={build.versionCode} testID="about-version-code"/>
          <InfoRow label="构建时间" value={formatBuiltAt(build.builtAt)} testID="about-built-at"/>
          <InfoRow label="提交" value={build.git} testID="about-git"/>
          <InfoRow label="构建类型" value={build.buildType} testID="about-build-type"/>
          <InfoRow label="ABI" value={build.abi} testID="about-abi"/>
          <InfoRow label={minSystemTitle()} value={minSystemLabel(build.minSdk)} testID="about-min-sdk"/>
        </Group>

        <Text style={styles.note}>尚未在真实相机上逐一验证。</Text>
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
  content: {width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: ui.space.gutter, gap: ui.space.lg},
  hero: {flexDirection: 'row', alignItems: 'center', gap: ui.space.gutter, paddingTop: ui.space.sm},
  appIcon: {width: 72, height: 72, borderRadius: ui.radius.sheet, backgroundColor: ui.color.surface},
  heroText: {flex: 1, minWidth: 0, gap: ui.space.xs},
  appName: {fontSize: 22, lineHeight: 28, fontWeight: '700', color: ui.color.text},
  version: {fontSize: 15, lineHeight: 20, color: ui.color.muted, fontVariant: ['tabular-nums']},
  tagline: {...ui.type.caption, color: ui.color.muted},
  group: {gap: 6},
  groupTitle: {fontSize: 13, lineHeight: 18, color: ui.color.muted, paddingHorizontal: 16},
  card: {backgroundColor: ui.color.surface, borderRadius: 14, overflow: 'hidden'},
  divider: {height: StyleSheet.hairlineWidth, backgroundColor: ui.color.outline, marginLeft: 16},
  row: {minHeight: 52, paddingHorizontal: ui.space.gutter, paddingVertical: ui.space.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: ui.space.md},
  actionRow: {minHeight: 56},
  actionText: {flex: 1, minWidth: 0, gap: ui.space.xs},
  actionEnd: {flexDirection: 'row', alignItems: 'center', gap: ui.space.sm, flexShrink: 0},
  label: {...ui.type.body, color: ui.color.text, flexShrink: 0},
  value: {...ui.type.body, color: ui.color.muted, flexShrink: 1, textAlign: 'right'},
  detail: {...ui.type.caption, color: ui.color.muted},
  pressed: {backgroundColor: ui.color.raised},
  button: {minHeight: ui.icon.touch},
  note: {...ui.type.caption, color: ui.color.muted, textAlign: 'center', paddingTop: ui.space.sm},
});
