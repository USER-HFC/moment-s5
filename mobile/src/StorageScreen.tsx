import React, {useCallback, useEffect, useState} from 'react';
import {BackHandler, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import CameraControl from './CameraControl';
import ConfirmDialog from './ConfirmDialog';
import {camera} from './native';
import {Notice} from './notice';
import {clearableSummary, formatBytes, StorageUsage} from './preferences';
import {ui} from './theme';

export default function StorageScreen({onBack, onNotice}: {onBack: () => void; onNotice: (notice: Notice) => void}) {
  const [usage, setUsage] = useState<StorageUsage | null>(null);
  const [problem, setProblem] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [working, setWorking] = useState(false);
  const [clearError, setClearError] = useState('');

  const load = useCallback(async () => {
    if (!camera?.storageUsage) { setProblem('当前平台没有相机桥'); setUsage(null); return; }
    try {
      setUsage(await camera.storageUsage());
      setProblem('');
    } catch (e) {
      setProblem(String((e as Error)?.message || e));
    }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!confirm) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!working) setConfirm(false);
      return true;
    });
    return () => sub.remove();
  }, [confirm, working]);

  const clear = async () => {
    if (!camera?.clearExportedCopies || working) return;
    setWorking(true); setClearError('');
    try {
      const result = await camera.clearExportedCopies();
      setConfirm(false);
      onNotice({message: result.removed > 0 ? `已清理 ${result.removed} 张已导出的副本` : '没有已导出的副本可清理'});
      await load();
    } catch (e) {
      setClearError(String((e as Error)?.message || e));
    } finally { setWorking(false); }
  };

  const count = usage ? `${usage.count} 张` : '…';
  const bytes = usage ? formatBytes(usage.bytes) : '…';
  const clearable = !!usage && usage.exportedCount > 0;
  const summary = usage ? clearableSummary(usage.exportedCount, usage.exportedBytes) : '…';
  const clearBody = clearError
    ? `只删除已经导出到系统相册的 App 内副本。机身 SD 卡和系统相册里的照片不受影响。\n${clearError}`
    : '只删除已经导出到系统相册的 App 内副本。机身 SD 卡和系统相册里的照片不受影响。';
  return <View style={styles.screen} testID="storage-screen">
    <View testID="storage-body" accessibilityElementsHidden={confirm} importantForAccessibility={confirm ? 'no-hide-descendants' : 'auto'} style={styles.screen}>
    <View style={styles.header}>
      <CameraControl icon="back" accessibilityLabel="返回设置" onPress={onBack}/>
      <Text style={styles.title}>存储</Text>
      <View style={styles.headerSpacer}/>
    </View>
    <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator>
      <View style={styles.content}>
        <View style={styles.card}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>照片数量</Text>
            <Text testID="storage-count" style={styles.statValue}>{count}</Text>
          </View>
          <View style={styles.divider}/>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>占用空间</Text>
            <Text testID="storage-bytes" style={styles.statValue}>{bytes}</Text>
          </View>
        </View>
        {!!problem && <Text testID="storage-error" style={styles.error}>{problem}</Text>}
        {usage?.count === 0 && <Text style={styles.note}>还没有保存在 App 里的照片。</Text>}
        <Pressable accessibilityRole="button" accessibilityLabel="清理已导出的 App 内副本" accessibilityState={{disabled: !clearable}}
          disabled={!clearable} testID="storage-clear"
          onPress={() => { if (!clearable) return; setClearError(''); setConfirm(true); }}
          style={({pressed}) => [styles.action, !clearable && styles.actionDisabled, pressed && clearable && styles.pressed]}>
          <Text style={[styles.actionLabel, !clearable && styles.actionLabelDisabled]}>清理已导出的 App 内副本</Text>
        </Pressable>
        <Text testID="storage-clearable" style={styles.note}>{summary}</Text>
        <Text style={styles.note}>只删除已经导出的 App 内副本。未导出的照片会保留。</Text>
      </View>
    </ScrollView>
    </View>
    {confirm && <ConfirmDialog visible testID="storage-confirm" confirmTestID="storage-confirm-clear" destructive busy={working}
      title="清理已导出的副本？" body={clearBody} confirmLabel={working ? '正在清理' : '清理'} cancelLabel="取消"
      onCancel={() => { if (!working) setConfirm(false); }} onConfirm={() => { void clear(); }}/>}
  </View>;
}

const styles = StyleSheet.create({
  screen: {flex: 1, minHeight: 0, backgroundColor: ui.color.background},
  header: {minHeight: 64, paddingHorizontal: ui.space.gutter, paddingVertical: ui.space.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  title: {...ui.type.title, color: ui.color.text, flexShrink: 1},
  headerSpacer: {width: ui.icon.touch},
  scroll: {paddingBottom: ui.space.xl},
  content: {width: '100%', maxWidth: 640, alignSelf: 'center', paddingHorizontal: ui.space.gutter, paddingTop: ui.space.sm, gap: ui.space.md},
  card: {backgroundColor: ui.color.surface, borderRadius: ui.radius.sheet, overflow: 'hidden'},
  stat: {minHeight: 60, paddingHorizontal: ui.space.gutter, paddingVertical: ui.space.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: ui.space.md},
  statLabel: {...ui.type.body, flex: 1, color: ui.color.text},
  statValue: {...ui.type.body, color: ui.color.accent, fontVariant: ['tabular-nums']},
  divider: {borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ui.color.outline},
  note: {...ui.type.body, color: ui.color.muted},
  error: {...ui.type.body, color: ui.color.destructive},
  action: {minHeight: ui.icon.touch, alignItems: 'center', justifyContent: 'center', borderRadius: ui.radius.control, borderWidth: 1, borderColor: ui.color.outline, paddingHorizontal: ui.space.gutter, paddingVertical: ui.space.sm},
  actionDisabled: {opacity: 0.45},
  actionLabel: {...ui.type.body, color: ui.color.accent, textAlign: 'center'},
  actionLabelDisabled: {color: ui.color.muted},
  pressed: {backgroundColor: ui.color.raised},
});
