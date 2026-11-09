import React, {useEffect} from 'react';
import {Pressable, View} from 'react-native';
import {Text} from './ui';
import {Notice} from './notice';

/** One optional action keeps the contract small: save uses 查看, errors can use 查看诊断. */
export type {Notice, NoticeAction} from './notice';

const DISMISS_MS = 4500;

export default function NoticeBar({notice, onDismiss}: {notice: Notice | null; onDismiss?: () => void}) {
  useEffect(() => {
    if (!notice) return undefined;
    const timer = setTimeout(() => onDismiss?.(), notice.durationMs ?? DISMISS_MS);
    return () => clearTimeout(timer);
  }, [notice, onDismiss]);
  if (!notice) return null;
  // A dark capsule like the iOS camera's toasts: no outline, no shadow.
  return <View testID="notice-bar" accessibilityLiveRegion="polite"
    className="min-h-[44px] flex-row items-center gap-2 self-center rounded-[22px] bg-grouped/95 py-1.5 pl-4 pr-1.5" style={{elevation: 0, maxWidth: 520}}>
    <Text numberOfLines={3} className="shrink text-[15px] leading-[20px]">{notice.message}</Text>
    {notice.action && <Pressable accessibilityRole="button" accessibilityLabel={notice.action.label} onPress={() => {notice.action?.onPress(); onDismiss?.();}}
      className="h-8 shrink-0 items-center justify-center rounded-full bg-ink px-3.5 active:opacity-70" style={{maxWidth: '46%'}}>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} className="text-footnote font-semibold text-black">{notice.action.label}</Text>
    </Pressable>}
    {!notice.action && <View className="w-2.5"/>}
  </View>;
}
