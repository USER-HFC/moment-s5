import React, {useEffect, useState} from 'react';
import {Modal, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {X} from 'lucide-react-native';
import {cn, color, Icon, Presence, RoundButton, Text} from './ui';

/**
 * Direction B sheet: a rounded grey card floating 8 dp above the bottom edge, with a grabber,
 * a bold title and a small round close button. The scrim only dims; tapping it closes.
 *
 * It springs up from below and eases back down; the Modal stays mounted until the card is gone.
 */
export default function CameraSheet({visible, title, onClose, actions, children, footer, anchor = 'bottom', dismissAccessibilityLabel}: {
  visible: boolean; title: string; onClose: () => void; actions?: React.ReactNode;
  children: React.ReactNode; footer?: React.ReactNode;
  /** Kept for callers; every sheet now rises from the bottom. */
  anchor?: 'center' | 'bottom';
  dismissLabel?: string; dismissAccessibilityLabel?: string;
}) {
  const [mounted, setMounted] = useState(visible);
  useEffect(() => { if (visible) setMounted(true); }, [visible]);
  return <Modal visible={mounted} transparent animationType="none" supportedOrientations={['portrait', 'landscape']} onRequestClose={onClose}>
    <View className="flex-1 justify-end">
      <Presence visible={visible} kind="fade" style={{...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)'}}>
        <Pressable accessibilityRole="button" accessibilityLabel="关闭" importantForAccessibility="no" className="absolute inset-0" onPress={onClose}/>
      </Presence>
      <Presence visible={visible} kind="sheet" distance={420} spring="smooth" onExited={() => setMounted(false)}
        style={{width: '100%', maxWidth: 560, alignSelf: 'center', maxHeight: '94%'}}>
        <SafeAreaView edges={['bottom', 'left', 'right']} className={cn('shrink p-2', anchor === 'center' && 'pb-2')}>
          <View accessibilityViewIsModal className="shrink gap-3.5 rounded-sheet bg-grouped px-4 pb-4 pt-1.5" style={{elevation: 0}}>
            <View className="h-[5px] w-9 self-center rounded-full bg-[#48484A]"/>
            <View className="flex-row items-center justify-between gap-2">
              <Text accessibilityRole="header" numberOfLines={1} className="shrink text-title" style={{letterSpacing: -0.3}}>{title}</Text>
              <View className="flex-row items-center gap-1">
                {actions}
                <RoundButton size={30} className="bg-raised" accessibilityLabel={dismissAccessibilityLabel ?? `完成${title}`} onPress={onClose}>
                  <Icon as={X} size={15} strokeWidth={2.6} color={color.subtle}/>
                </RoundButton>
              </View>
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" className="shrink grow-0" contentContainerClassName="gap-3.5 pb-0.5" showsVerticalScrollIndicator>{children}</ScrollView>
            {footer}
          </View>
        </SafeAreaView>
      </Presence>
    </View>
  </Modal>;
}
