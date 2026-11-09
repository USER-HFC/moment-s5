import React, {useEffect, useRef, useState} from 'react';
import {AccessibilityInfo, BackHandler, findNodeHandle, ScrollView, StyleSheet, useWindowDimensions, View} from 'react-native';
import {interpolateColor, useAnimatedStyle, useSharedValue} from 'react-native-reanimated';
import {AnimatedView, color, Presence, PressableMotion, springTo, Tappable as Pressable, useMotionReduced} from './ui';
import {Text} from 'react-native-paper';
import CameraIcon, {CameraIconName} from './CameraIcon';
import {ui} from './theme';

const CARDS: {title: string; icon: CameraIconName; body: string}[] = [
  {title: '连接相机', icon: 'usb', body: '用数据线连接相机，并在相机里选择 PC(Tether)。也可以先体验演示，熟悉拍摄界面。'},
  {title: '拍动态照片', icon: 'motion', body: '在画面底部切到「动态」。等提示可以拍摄后按快门，会保留按下前大约 3 秒的画面。'},
  {title: '套用 LUT', icon: 'lut', body: '点 LUT，选一种色彩风格。取景会马上换上这个风格，保存进 App 的是处理后的副本。'},
];

export default function OnboardingCards({onDone}: {onDone: () => void}) {
  const [index, setIndex] = useState(0);
  // Cards push in from the side they come from: forward from the right, back from the left.
  const direction = useRef<'push' | 'pushBack'>('push');
  const go = (next: number) => { direction.current = next > index ? 'push' : 'pushBack'; setIndex(next); };
  const nextRef = useRef<View>(null);
  const window = useWindowDimensions();
  const portrait = window.height >= window.width && window.height > 0;
  const card = CARDS[index];
  const last = index === CARDS.length - 1;
  // Back moves to the previous card. On the first card it is the same as 跳过, so the activity does not finish.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (index > 0) { direction.current = 'pushBack'; setIndex(index - 1); return true; }
      onDone();
      return true;
    });
    return () => sub.remove();
  }, [index, onDone]);
  useEffect(() => {
    const node = findNodeHandle(nextRef.current);
    if (node == null) return undefined;
    // The page behind is hidden on the next frame; move focus after that settles.
    const timer = setTimeout(() => AccessibilityInfo.setAccessibilityFocus(node), 300);
    return () => clearTimeout(timer);
  }, [index]);
  return <View testID="onboarding" accessibilityViewIsModal style={styles.screen}>
    <View style={styles.header}>
      <Pressable accessibilityRole="button" accessibilityLabel="跳过引导" testID="onboarding-skip" onPress={onDone}
        style={({pressed}) => [styles.skip, pressed && styles.pressed]}>
        <Text style={styles.skipLabel}>跳过</Text>
      </Pressable>
    </View>
    <ScrollView style={styles.flex} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator>
      <Presence key={index} visible appear={index > 0 || direction.current === 'pushBack'} kind={direction.current} distance={48} spring="smooth">
      <View testID={`onboarding-card-${index + 1}`} style={[styles.card, portrait && {minHeight: Math.max(320, Math.round(window.height * 0.46))}]}>
        <View style={styles.badge}>
          <CameraIcon name={card.icon} active size={40}/>
        </View>
        <Text style={styles.kicker}>{`${index + 1} / ${CARDS.length}`}</Text>
        <Text style={styles.title}>{card.title}</Text>
        <Text style={styles.body}>{card.body}</Text>
      </View>
      </Presence>
    </ScrollView>
    <View style={styles.footer}>
      <View style={styles.dots} accessibilityLabel={`第 ${index + 1} 张，共 ${CARDS.length} 张`}>
        {CARDS.map((item, dot) => <Dot key={item.title} on={dot === index}/>)}
      </View>
      <PressableMotion ref={nextRef} accessibilityRole="button" accessibilityLabel={last ? '开始使用' : '下一步'} testID="onboarding-next"
        onPress={() => { if (last) onDone(); else go(index + 1); }} style={styles.next}>
        <Text style={styles.nextLabel}>{last ? '开始使用' : '下一步'}</Text>
      </PressableMotion>
    </View>
  </View>;
}

/** Page dot: the current one stretches into a white capsule; the others are small grey dots. */
function Dot({on}: {on: boolean}) {
  const reduced = useMotionReduced();
  const value = useSharedValue(on ? 1 : 0);
  useEffect(() => { value.value = springTo(on ? 1 : 0, 'snappy', reduced); }, [on, reduced, value]);
  const style = useAnimatedStyle(() => ({width: 8 + 14 * value.value, backgroundColor: interpolateColor(value.value, [0, 1], [color.separator, color.ink])}));
  return <AnimatedView style={[styles.dot, style]}/>;
}

const styles = StyleSheet.create({
  screen: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 80, backgroundColor: ui.color.background},
  flex: {flex: 1},
  header: {minHeight: 64, paddingHorizontal: ui.space.gutter, alignItems: 'flex-end', justifyContent: 'center'},
  skip: {minHeight: ui.icon.touch, minWidth: ui.icon.touch, paddingHorizontal: ui.space.md, alignItems: 'center', justifyContent: 'center', borderRadius: ui.radius.control},
  skipLabel: {...ui.type.body, color: ui.color.muted},
  pressed: {backgroundColor: ui.color.raised},
  scroll: {flexGrow: 1, justifyContent: 'center', paddingHorizontal: ui.space.gutter, paddingVertical: ui.space.lg},
  card: {width: '100%', maxWidth: 520, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', gap: ui.space.lg, paddingHorizontal: ui.space.xl, paddingVertical: ui.space.xl, borderRadius: ui.radius.sheet, backgroundColor: ui.color.surface},
  badge: {width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: ui.color.raised},
  kicker: {...ui.type.caption, color: ui.color.accent, fontVariant: ['tabular-nums']},
  title: {...ui.type.title, color: ui.color.text, textAlign: 'center'},
  body: {...ui.type.body, color: ui.color.text, textAlign: 'center'},
  footer: {paddingHorizontal: ui.space.gutter, paddingBottom: ui.space.lg, gap: ui.space.md, width: '100%', maxWidth: 520, alignSelf: 'center'},
  dots: {flexDirection: 'row', justifyContent: 'center', gap: ui.space.sm},
  dot: {width: 8, height: 8, borderRadius: 4, backgroundColor: ui.color.outline},
  dotOn: {backgroundColor: ui.color.accent},
  next: {minHeight: ui.icon.touch, alignItems: 'center', justifyContent: 'center', borderRadius: ui.radius.control, backgroundColor: ui.color.accent, paddingHorizontal: ui.space.gutter},
  nextPressed: {opacity: 0.85},
  nextLabel: {...ui.type.body, color: ui.color.background, fontWeight: '600'},
});
