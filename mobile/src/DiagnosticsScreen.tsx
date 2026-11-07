import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Clipboard, ScrollView, Share, StyleSheet, View} from 'react-native';
import {Button, Text} from 'react-native-paper';
import CameraControl from './CameraControl';
import {presentDiagnostics, scrollDiagnosticsToEnd} from './connection/diagnostics';
import {camera} from './native';
import {Notice} from './notice';
import {ui} from './theme';

const EMPTY = '还没有诊断记录，连接相机后再来看';

export default function DiagnosticsScreen({onBack, onNotice}: {onBack: () => void; onNotice: (notice: Notice) => void}) {
  const scrollRef = useRef<ScrollView>(null);
  const request = useRef(0);
  const [log, setLog] = useState<string | null>(null);
  const [problem, setProblem] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const id = ++request.current;
    try {
      const raw = camera ? await camera.diagnostics() : '';
      if (id !== request.current) return;
      setLog(presentDiagnostics(raw));
      setProblem('');
    } catch (e) {
      if (id !== request.current) return;
      setProblem(String((e as Error)?.message || e));
      setLog(current => current ?? '');
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 5000);
    return () => clearTimeout(timer);
  }, [copied]);

  const copy = () => {
    if (!log) return;
    Clipboard.setString(log);
    setCopied(true);
    onNotice({message: '诊断记录已复制'});
  };
  const share = async () => {
    if (!log) return;
    try {
      const result = await Share.share({title: '连接诊断', message: log});
      if (result.action === Share.dismissedAction) return;
    } catch (e) {
      const message = String((e as Error)?.message || e);
      if (/cancel|dismiss|取消/i.test(message)) return;
      onNotice({message});
    }
  };

  const showEmpty = log === '' && !problem;
  return <View style={styles.screen} testID="diagnostics-screen">
    <View style={styles.header}>
      <CameraControl icon="back" accessibilityLabel="返回设置" onPress={onBack}/>
      <Text style={styles.title}>连接诊断</Text>
      <CameraControl icon="refresh" accessibilityLabel="刷新诊断记录" onPress={() => { void load(); }}/>
    </View>
    {showEmpty ? <View style={styles.emptyWrap}>
      <Text testID="diagnostics-empty" style={styles.empty}>{EMPTY}</Text>
    </View> : <ScrollView ref={scrollRef} testID="diagnostics-scroll" style={styles.logScroll}
      contentContainerStyle={styles.logContent} showsVerticalScrollIndicator
      onContentSizeChange={() => scrollDiagnosticsToEnd(scrollRef.current)}>
      {!!problem && <Text testID="diagnostics-error" style={styles.problem}>{problem}</Text>}
      {!!log && <Text testID="diagnostics-log" selectable style={styles.log}>{log}</Text>}
    </ScrollView>}
    <View style={styles.actions}>
      <Button mode="outlined" style={styles.action} contentStyle={styles.touch} textColor={ui.color.accent}
        disabled={!log} testID="diagnostics-copy" accessibilityLabel={copied ? '诊断记录已复制' : '复制诊断记录'}
        onPress={copy}>{copied ? '已复制' : '复制'}</Button>
      <Button mode="outlined" style={styles.action} contentStyle={styles.touch} textColor={ui.color.accent}
        disabled={!log} testID="diagnostics-share" accessibilityLabel="分享诊断记录"
        onPress={() => { void share(); }}>分享</Button>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  screen: {flex: 1, minHeight: 0, backgroundColor: ui.color.background},
  header: {minHeight: 64, paddingHorizontal: ui.space.gutter, paddingVertical: ui.space.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  title: {...ui.type.title, color: ui.color.text},
  emptyWrap: {flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: ui.space.xl},
  empty: {...ui.type.body, color: ui.color.muted, textAlign: 'center'},
  logScroll: {flex: 1, minHeight: 0},
  logContent: {paddingHorizontal: ui.space.gutter, paddingBottom: ui.space.lg, gap: ui.space.sm},
  log: {fontFamily: 'monospace', fontSize: 12, lineHeight: 18, color: ui.color.text},
  problem: {...ui.type.body, color: ui.color.destructive},
  actions: {flexDirection: 'row', gap: ui.space.sm, paddingHorizontal: ui.space.gutter, paddingTop: ui.space.sm, paddingBottom: ui.space.gutter},
  action: {flex: 1},
  touch: {minHeight: ui.icon.touch},
});
