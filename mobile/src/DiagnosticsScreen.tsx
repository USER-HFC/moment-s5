import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Clipboard, Platform, ScrollView, Share, StyleSheet, View} from 'react-native';
import {Button, Text} from 'react-native-paper';
import {buildInfoFromModule} from './buildInfo';
import {connectionModeLabel, diagnosticFacts, diagnosticHeader, diagnosticRows, diagnosticShareText, DiagnosticFacts, presentDiagnostics, scrollDiagnosticsToEnd} from './connection/diagnostics';
import {camera} from './native';
import {Notice} from './notice';
import {ui} from './theme';
import {RotateCw} from 'lucide-react-native';
import {Icon, PageHeader, RoundButton} from './ui';

const EMPTY = '还没有诊断记录，连接相机后再来看';

function factsNow(connection: string): DiagnosticFacts {
  return diagnosticFacts(buildInfoFromModule(camera), Platform.constants, connection);
}

export default function DiagnosticsScreen({onBack, onNotice}: {onBack: () => void; onNotice: (notice: Notice) => void}) {
  const scrollRef = useRef<ScrollView>(null);
  const request = useRef(0);
  const [log, setLog] = useState<string | null>(null);
  const [facts, setFacts] = useState(() => factsNow('未连接'));
  const [problem, setProblem] = useState('');
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    const id = ++request.current;
    let connection = '未连接';
    try {
      if (camera?.getState) connection = connectionModeLabel(await camera.getState());
    } catch { connection = '未连接'; }
    try {
      const raw = camera ? await camera.diagnostics() : '';
      if (id !== request.current) return;
      setFacts(factsNow(connection));
      setLog(presentDiagnostics(raw));
      setProblem('');
    } catch (e) {
      if (id !== request.current) return;
      setFacts(factsNow(connection));
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

  const report = () => diagnosticShareText(facts, log || '');
  const copy = () => {
    if (!log) return;
    Clipboard.setString(report());
    setCopied(true);
    onNotice({message: '诊断记录已复制'});
  };
  const share = async () => {
    if (!log) return;
    try {
      const result = await Share.share({title: '连接诊断', message: report()});
      if (result.action === Share.dismissedAction) return;
    } catch (e) {
      const message = String((e as Error)?.message || e);
      if (/cancel|dismiss|取消/i.test(message)) return;
      onNotice({message});
    }
  };

  const showEmpty = log === '' && !problem;
  return <View style={styles.screen} testID="diagnostics-screen">
    <PageHeader title="连接诊断" backLabel="返回设置" onBack={onBack}
      right={<RoundButton size={36} accessibilityLabel="刷新诊断记录" onPress={() => { void load(); }}><Icon as={RotateCw} size={18}/></RoundButton>}/>
    {/* Same label / value card as 关于, read out as one block. */}
    <View testID="diagnostics-context" accessible accessibilityLabel={diagnosticHeader(facts)} style={styles.context}>
      {diagnosticRows(facts).map(([label, value], index) => <View key={label} style={[styles.contextRow, index > 0 && styles.contextDivider]}>
        <Text style={styles.contextLabel}>{label}</Text>
        <Text selectable numberOfLines={1} style={styles.contextValue}>{value}</Text>
      </View>)}
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
  context: {marginHorizontal: ui.space.gutter, marginTop: ui.space.sm, marginBottom: ui.space.md, paddingHorizontal: ui.space.gutter, borderRadius: ui.radius.sheet, backgroundColor: ui.color.surface},
  contextRow: {minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: ui.space.md},
  contextDivider: {borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: ui.color.outline},
  contextLabel: {...ui.type.body, color: ui.color.muted},
  contextValue: {...ui.type.body, flex: 1, minWidth: 0, color: ui.color.text, textAlign: 'right', fontVariant: ['tabular-nums']},
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
