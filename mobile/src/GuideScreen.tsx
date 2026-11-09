import React from 'react';
import {Linking, ScrollView, StyleSheet, View} from 'react-native';
import {Tappable as Pressable} from './ui';
import {Text} from 'react-native-paper';
import {ui} from './theme';
import {PageHeader} from './ui';

const ISSUES = 'https://github.com/USER-HFC/moment-s5/issues/new';
const USB = [
  '相机：设置 → USB → PC(Tether)',
  '用支持数据的 USB-C 线',
  'OPPO / ColorOS 手机在系统设置里开启 OTG',
];
const WIFI = [
  '相机开启 Wi-Fi 遥控拍摄',
  '手机连上相机的 Wi-Fi',
  '填写相机 IP，常见是 192.168.54.1',
];
const SHOOTING = [
  {title: '音量键拍摄', body: '在拍摄页按音量键等于按快门。定时开着时先倒计时，倒计时中再按一次取消。不在拍摄页时，音量键仍调节音量。'},
  {title: '构图参考', body: '可在关、16:9、1:1、4:5 之间切换，按钮上显示当前比例。只加参考框，不裁切预览，也不改变照片。'},
  {title: '快门震动', body: '按下快门时手机会轻震一下。可在设置里关掉「快门震动」。'},
  {title: '反转对焦', body: '近和远在不同机身上可能是反的。打开设置里的「反转近 / 远对焦方向」，两个按钮的动作会互换，按钮上的字不变。'},
];
const QUESTIONS = [
  {title: '连不上', body: '先看相机是不是 PC(Tether)、线能不能传数据、手机有没有打开 OTG。换一条线或另一个接口后再试。还是不行，打开连接诊断看记录。'},
  {title: '传错照片', body: '先确认设置里的「机身快门照片自动同步」。开着时，用机身快门拍的照片会传进 App。拍摄时不要在机身上回放，以免把正在看的那张传过来。'},
  {title: 'Wi-Fi 是实验功能', body: 'Wi-Fi 遥控还在试验，没有在真实相机上验证。连不上或画面不稳定时，请改用 USB。'},
];

function Steps({items}: {items: readonly string[]}) {
  return <View style={styles.steps}>{items.map((item, index) => <View key={item} style={styles.step}>
    <Text style={styles.stepIndex}>{index + 1}</Text>
    <Text style={styles.stepText}>{item}</Text>
  </View>)}</View>;
}

function Block({title, children}: {title: string; children: React.ReactNode}) {
  return <View style={styles.group}>
    <Text style={styles.groupTitle}>{title}</Text>
    <View style={styles.card}>{children}</View>
  </View>;
}

function Entries({items}: {items: readonly {title: string; body: string}[]}) {
  return <>{items.map((item, index) => <View key={item.title} style={index > 0 ? styles.divider : null}>
    <Text style={styles.question}>{item.title}</Text>
    <Text style={styles.answer}>{item.body}</Text>
  </View>)}</>;
}

export default function GuideScreen({onBack, onShowIntro}: {onBack: () => void; onShowIntro: () => void}) {
  return <View style={styles.screen} testID="guide-screen">
    <PageHeader title="使用指南" backLabel="返回设置" onBack={onBack}/>
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator>
      <View style={styles.content}>
        <Block title="USB">
          <Steps items={USB}/>
        </Block>
        <Block title="Wi-Fi（实验）">
          <Steps items={WIFI}/>
          <Text style={styles.note}>这是实验功能，重要的拍摄请用 USB。</Text>
        </Block>
        <Block title="拍摄">
          <Entries items={SHOOTING}/>
        </Block>
        <Block title="常见问题">
          <Entries items={QUESTIONS}/>
        </Block>
        <Block title="还有问题">
          <Text style={styles.answer}>把问题发到项目页面时，请附上连接诊断，方便对照发生了什么。</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="再看一遍引导" testID="guide-replay" onPress={onShowIntro}
            style={({pressed}) => [styles.action, pressed && styles.pressed]}>
            <Text style={styles.actionLabel}>再看一遍引导</Text>
          </Pressable>
          <Pressable accessibilityRole="link" accessibilityLabel="反馈问题" testID="guide-feedback"
            onPress={() => { Linking.openURL(ISSUES).catch(() => undefined); }}
            style={({pressed}) => [styles.action, styles.actionPrimary, pressed && styles.pressed]}>
            <Text style={styles.actionPrimaryLabel}>反馈问题</Text>
          </Pressable>
        </Block>
      </View>
    </ScrollView>
  </View>;
}

const styles = StyleSheet.create({
  screen: {flex: 1, minHeight: 0, backgroundColor: ui.color.background},
  header: {minHeight: 64, paddingHorizontal: ui.space.gutter, paddingVertical: ui.space.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  title: {...ui.type.title, color: ui.color.text, flexShrink: 1},
  headerSpacer: {width: ui.icon.touch},
  scroll: {paddingBottom: ui.space.xl},
  content: {width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: ui.space.gutter, gap: ui.space.lg},
  group: {gap: ui.space.sm},
  groupTitle: {...ui.type.caption, color: ui.color.muted, fontWeight: '600'},
  card: {backgroundColor: ui.color.surface, borderRadius: ui.radius.sheet, padding: ui.space.gutter, gap: ui.space.md},
  steps: {gap: ui.space.sm},
  step: {flexDirection: 'row', alignItems: 'flex-start', gap: ui.space.sm},
  stepIndex: {width: 24, ...ui.type.body, color: ui.color.accent, fontVariant: ['tabular-nums']},
  stepText: {...ui.type.body, flex: 1, color: ui.color.text},
  note: {...ui.type.body, color: ui.color.muted},
  divider: {borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ui.color.outline, paddingTop: ui.space.md},
  question: {...ui.type.body, color: ui.color.text, fontWeight: '600'},
  answer: {...ui.type.body, color: ui.color.muted},
  action: {minHeight: ui.icon.touch, alignItems: 'center', justifyContent: 'center', borderRadius: ui.radius.control, borderWidth: 1, borderColor: ui.color.outline, paddingHorizontal: ui.space.gutter},
  actionPrimary: {backgroundColor: ui.color.accent, borderColor: ui.color.accent},
  actionLabel: {...ui.type.body, color: ui.color.accent, textAlign: 'center'},
  actionPrimaryLabel: {...ui.type.body, color: ui.color.background, fontWeight: '600', textAlign: 'center'},
  pressed: {opacity: 0.85},
});
