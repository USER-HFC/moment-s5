import React, {useEffect, useRef} from 'react';
import {Animated, PanResponder, ScrollView, StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import CameraControl from './CameraControl';
import {ui} from './theme';

type Props = {
  title: string;
  height: number;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
  /** Fraction of the container visible when the sheet opens. */
  initial?: number;
  /** Fraction of the container after dragging the handle up. */
  expanded?: number;
  showClose?: boolean;
  testID?: string;
};

/**
 * Album sheets live above the viewer, not in a Modal: the photo has to stay visible
 * and long-pressable for the original/LUT comparison. Only the handle drags, so the
 * filmstrip and info list keep their own gestures.
 */
export default function AlbumSheet({title, height, onClose, children, footer, initial = 0.5, expanded = 0.9, showClose = true, testID}: Props) {
  const maxHeight = Math.max(240, Math.round(height * expanded));
  const collapsedHeight = Math.min(maxHeight, Math.max(180, Math.round(height * initial)));
  const sheetHeight = useRef(new Animated.Value(0)).current;
  const currentHeight = useRef(collapsedHeight);
  const startHeight = useRef(collapsedHeight);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const settle = (to: number) => {
    currentHeight.current = to;
    Animated.spring(sheetHeight, {toValue: to, useNativeDriver: false, damping: 26, stiffness: 240, mass: 0.8}).start();
  };
  const dismiss = () => {
    Animated.timing(sheetHeight, {toValue: 0, duration: 170, useNativeDriver: false}).start(() => onCloseRef.current());
  };

  useEffect(() => {
    Animated.spring(sheetHeight, {toValue: collapsedHeight, useNativeDriver: false, damping: 24, stiffness: 220, mass: 0.8}).start();
    // The sheet is mounted when it opens; this is the rise animation.
    return () => sheetHeight.stopAnimation();
  }, [collapsedHeight, sheetHeight]);

  const pan = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 4,
    onPanResponderGrant: () => { startHeight.current = currentHeight.current; },
    onPanResponderMove: (_event, gesture) => {
      const next = Math.max(0, Math.min(maxHeight, startHeight.current - gesture.dy));
      currentHeight.current = next;
      sheetHeight.setValue(next);
    },
    onPanResponderRelease: (_event, gesture) => {
      const wasExpanded = startHeight.current > collapsedHeight + 20;
      if (gesture.dy > 110 || gesture.vy > 1.1) { dismiss(); return; }
      if (wasExpanded && (gesture.dy > 55 || gesture.vy > 0.45)) { settle(collapsedHeight); return; }
      if (!wasExpanded && (gesture.dy < -45 || gesture.vy < -0.45)) { settle(maxHeight); return; }
      settle(wasExpanded ? maxHeight : collapsedHeight);
    },
    onPanResponderTerminationRequest: () => true,
  })).current;

  return <Animated.View testID={testID} accessibilityViewIsModal style={[styles.sheet, {height: sheetHeight}]}>
    <View style={styles.inset}>
      <View style={styles.handleArea} {...pan.panHandlers}>
        <View style={styles.handle}/>
        <View style={styles.header}>
          <Text style={styles.title}>{title}</Text>
          {showClose && <CameraControl icon="close" accessibilityLabel={`关闭${title}`} onPress={() => onCloseRef.current()}/>}
        </View>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>{children}</ScrollView>
      {footer && <View style={styles.footer}>{footer}</View>}
    </View>
  </Animated.View>;
}

const styles = StyleSheet.create({
  sheet: {position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 30, borderTopLeftRadius: ui.radius.sheet, borderTopRightRadius: ui.radius.sheet, backgroundColor: ui.color.background, borderTopWidth: StyleSheet.hairlineWidth, borderColor: ui.color.outline, overflow: 'hidden'},
  inset: {flex: 1, width: '100%', maxWidth: 680, alignSelf: 'center', paddingHorizontal: ui.space.gutter},
  handleArea: {paddingTop: ui.space.sm},
  handle: {width: 36, height: 4, borderRadius: 2, backgroundColor: ui.color.outline, alignSelf: 'center', marginBottom: ui.space.xs},
  header: {minHeight: ui.icon.touch, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: ui.space.sm},
  title: {...ui.type.title, color: ui.color.text, flexShrink: 1},
  scroll: {flexGrow: 1, flexShrink: 1}, content: {paddingBottom: ui.space.sm},
  footer: {paddingTop: ui.space.sm, paddingBottom: ui.space.sm, gap: ui.space.sm},
});
