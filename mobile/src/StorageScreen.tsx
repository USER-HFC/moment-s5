import React, {useCallback, useEffect, useState} from 'react';
import {BackHandler, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import ConfirmDialog from './ConfirmDialog';
import {camera} from './native';
import {Notice} from './notice';
import {clearableSummary, formatBytes, StorageUsage} from './preferences';
import {cn, PageHeader, Text} from './ui';

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
  const usable = usage ? formatBytes(usage.usableBytes ?? -1) : '…';
  const clearable = !!usage && usage.exportedCount > 0;
  const summary = usage ? clearableSummary(usage.exportedCount, usage.exportedBytes) : '…';
  const clearBody = clearError
    ? `只删除已经导出到系统相册的 App 内副本。机身 SD 卡和系统相册里的照片不受影响。\n${clearError}`
    : '只删除已经导出到系统相册的 App 内副本。机身 SD 卡和系统相册里的照片不受影响。';
  return <View className="flex-1 bg-canvas" testID="storage-screen">
    <View testID="storage-body" accessibilityElementsHidden={confirm} importantForAccessibility={confirm ? 'no-hide-descendants' : 'auto'} className="flex-1">
    <PageHeader title="存储" backLabel="返回设置" onBack={onBack}/>
    <ScrollView contentContainerClassName="pb-10" showsVerticalScrollIndicator>
      <View className="w-full max-w-[640px] gap-7 self-center px-4 pt-3">
        <View className="gap-1.5">
          <View className="overflow-hidden rounded-card bg-grouped">
            {([['照片数量', count, 'storage-count'], ['占用空间', bytes, 'storage-bytes'], ['手机剩余空间', usable, 'storage-usable']] as const).map(([label, value, id], index) => <View key={id}>
              {index > 0 && <View className="ml-4 bg-separator" style={{height: StyleSheet.hairlineWidth}}/>}
              <View className="min-h-[52px] flex-row items-center justify-between gap-3 px-4">
                <Text className="flex-1 text-body">{label}</Text>
                <Text testID={id} className="text-body text-muted" style={{fontVariant: ['tabular-nums']}}>{value}</Text>
              </View>
            </View>)}
          </View>
          {!!problem && <Text testID="storage-error" className="px-4 text-footnote text-danger">{problem}</Text>}
          {usage?.count === 0 && <Text className="px-4 text-footnote text-muted">还没有保存在 App 里的照片。</Text>}
        </View>
        <View className="gap-1.5">
          <View className="overflow-hidden rounded-card bg-grouped">
            <Pressable accessibilityRole="button" accessibilityLabel="清理已导出的 App 内副本" accessibilityState={{disabled: !clearable}}
              disabled={!clearable} testID="storage-clear"
              onPress={() => { if (!clearable) return; setClearError(''); setConfirm(true); }}
              className="min-h-[52px] justify-center gap-0.5 px-4 py-2.5 active:bg-raised">
              <Text className={cn('text-body', clearable ? 'text-danger' : 'text-faint')}>清理已导出的 App 内副本</Text>
              <Text testID="storage-clearable" className="text-footnote text-muted">{summary}</Text>
            </Pressable>
          </View>
          <Text className="px-4 text-footnote text-muted">只删除已经导出到系统相册的 App 内副本。未导出的照片会保留。</Text>
        </View>
      </View>
    </ScrollView>
    </View>
    {confirm && <ConfirmDialog visible testID="storage-confirm" confirmTestID="storage-confirm-clear" destructive busy={working}
      title="清理已导出的副本？" body={clearBody} confirmLabel={working ? '正在清理' : '清理'} cancelLabel="取消"
      onCancel={() => { if (!working) setConfirm(false); }} onConfirm={() => { void clear(); }}/>}
  </View>;
}
