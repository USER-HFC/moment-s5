import React from 'react';
import {Modal, ScrollView, StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Button, Text} from 'react-native-paper';
import {ui} from './theme';

export default function CameraSheet({visible, title, onClose, actions, children, footer}: {
  visible: boolean; title: string; onClose: () => void; actions?: React.ReactNode;
  children: React.ReactNode; footer?: React.ReactNode;
}) {
  return <Modal visible={visible} transparent animationType="none" supportedOrientations={['portrait', 'landscape']} onRequestClose={onClose}>
    <SafeAreaView style={styles.scrim}>
      <View style={styles.sheet} accessibilityViewIsModal>
        <View style={styles.header}><Text style={styles.title}>{title}</Text><View style={styles.actions}>{actions}<Button textColor={ui.color.text} accessibilityLabel={`完成${title}`} onPress={onClose} contentStyle={styles.touch}>完成</Button></View></View>
        <ScrollView keyboardShouldPersistTaps="handled" style={styles.scroll} contentContainerStyle={styles.content} showsVerticalScrollIndicator>{children}</ScrollView>
        {footer}
      </View>
    </SafeAreaView>
  </Modal>;
}

const styles = StyleSheet.create({
  scrim: {flex: 1, justifyContent: 'center', padding: ui.space.gutter, backgroundColor: ui.color.scrim},
  sheet: {width: '100%', maxWidth: 520, maxHeight: '90%', minHeight: 0, alignSelf: 'center', padding: ui.space.gutter, gap: ui.space.md, borderRadius: ui.radius.sheet, backgroundColor: ui.color.background, borderWidth: 1, borderColor: ui.color.outline},
  header: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: ui.icon.touch, gap: ui.space.sm},
  title: {...ui.type.title, color: ui.color.text, flexShrink: 1}, actions: {flexDirection: 'row', alignItems: 'center'},
  touch: {minHeight: ui.icon.touch}, scroll: {flexGrow: 0, flexShrink: 1}, content: {gap: ui.space.sm, paddingBottom: ui.space.xs},
});
