import React, {useCallback, useEffect, useMemo, useState} from 'react';
import {AppState, Image, Linking, ScrollView, StyleSheet, useWindowDimensions, View} from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {ActivityIndicator, Button, Card, Divider, HelperText, List, ProgressBar, Provider as PaperProvider, SegmentedButtons, Snackbar, Surface, Switch, Text} from 'react-native-paper';
import {camera, cameraEvents, CameraState, LutItem, MomentItem} from './src/native';
import {theme} from './src/theme';

type Page = 'home' | 'monitor' | 'timer' | 'motion' | 'album';
const emptyState: CameraState = {active: false, busy: false, ready: false, demo: false, lut: null};

export default function App() {
  const [page, setPage] = useState<Page>('home');
  const [state, setState] = useState<CameraState>(emptyState);
  const [status, setStatus] = useState('未连接');
  const [preview, setPreview] = useState<string>();
  const [buffered, setBuffered] = useState(0);
  const [luts, setLuts] = useState<LutItem[]>([]);
  const [moments, setMoments] = useState<MomentItem[]>([]);
  const [snack, setSnack] = useState('');
  const refresh = useCallback(async () => {
    if (!camera) return;
    try { setLuts(await camera.listLuts()); setMoments(await camera.listMoments()); setState(await camera.getState()); }
    catch (e) { setSnack(errorText(e)); }
  }, []);
  useEffect(() => {
    refresh();
    if (!cameraEvents) { setStatus('iOS 原生桥待接入 · 页面和 LUT 数据契约已就绪'); return; }
    const subs = [
      cameraEvents.addListener('cameraStatus', (e) => { setStatus(e.message); setState((s) => ({...s, ready: !!e.ready})); }),
      cameraEvents.addListener('cameraFrame', (e) => { setPreview(`data:image/jpeg;base64,${e.jpegBase64}`); setBuffered(e.bufferedUs / 1_000_000); setState((s) => ({...s, ready: e.bufferedUs >= 3_000_000})); }),
      cameraEvents.addListener('cameraSaved', () => { setSnack('动态照片已保存，原片与 LUT 渲染图已同步'); refresh(); }),
      cameraEvents.addListener('cameraLog', (e) => setStatus(e.message)),
    ];
    const app = AppState.addEventListener('change', (next) => { if (next === 'active') refresh(); });
    return () => { subs.forEach((s) => s.remove()); app.remove(); };
  }, [refresh]);
  const connect = async () => { if (!camera) return setSnack('当前平台没有相机桥'); try { await camera.connect(); } catch (e) { setSnack(errorText(e)); } };
  const setLut = async (id: string) => { if (!camera) return; try { const title = await camera.setLut(id); setState((s) => ({...s, lut: title})); setSnack(id === 'off' ? '监看与照片 LUT 已关闭' : '监看与照片会使用此 LUT，原片仍会保留'); } catch (e) { setSnack(errorText(e)); } };
  const importLut = async () => {
    if (!camera) return setSnack('当前平台没有相机桥');
    try { const file = await DocumentPicker.pickSingle({type: [DocumentPicker.types.allFiles]}); const item = await camera.importLut(file.uri, file.name || 'imported.cube'); await refresh(); await setLut(item.id); }
    catch (e) { if (!DocumentPicker.isCancel(e)) setSnack(errorText(e)); }
  };
  return <SafeAreaProvider><PaperProvider theme={theme}><SafeAreaView style={styles.root}>
    <View style={styles.header}><View><Text variant="headlineMedium">瞬间 Lumix</Text><Text variant="labelMedium" style={styles.muted}>RN · Android / iPhone / iPad 共用页面契约</Text></View><View style={styles.headerRight}><Text variant="labelLarge">{status}</Text><Button mode="outlined" onPress={connect} accessibilityLabel="连接相机">连接</Button></View></View>
    {page === 'home' ? <Home go={setPage} connected={state.active}/> : page === 'album' ? <Album moments={moments} onBack={() => setPage('home')}/> : <CameraPage page={page} go={setPage} state={state} preview={preview} buffered={buffered} luts={luts} onLut={setLut} onImportLut={importLut} onRefresh={refresh}/>} 
    <Snackbar visible={!!snack} onDismiss={() => setSnack('')} duration={3500}>{snack}</Snackbar>
  </SafeAreaView></PaperProvider></SafeAreaProvider>;
}

function Home({go, connected}: {go: (page: Page) => void; connected: boolean}) {
  const items: [Page, string, string][] = [['monitor', '监看', '实时取景 / 对焦与构图'], ['timer', '定时遥控', '2 / 5 / 10 / 30 秒倒计时'], ['motion', '动态照片', '快门前 3 秒 · 手机同步 · LUT'], ['album', '相册', '片刻回放 / 原片与渲染图']];
  return <ScrollView contentContainerStyle={styles.home}><View style={styles.homeIntro}><Text variant="titleLarge">相机工作台</Text><Text style={styles.muted}>{connected ? 'LUMIX 已连接 · 横屏操作' : '连接 LUMIX 或进入演示模式开始'}</Text></View><View style={styles.menuGrid}>{items.map(([key, title, copy]) => <Card key={key} mode={key === 'motion' ? 'elevated' : 'contained'} onPress={() => go(key)} style={styles.menuCard} accessibilityRole="button" accessibilityLabel={title}><Card.Content><Text variant="titleLarge">{title}</Text><Text style={styles.muted}>{copy}</Text></Card.Content></Card>)}</View></ScrollView>;
}

function CameraPage({page, go, state, preview, buffered, luts, onLut, onImportLut, onRefresh}: {page: Exclude<Page, 'home'|'album'>; go: (p: Page) => void; state: CameraState; preview?: string; buffered: number; luts: LutItem[]; onLut: (id: string) => void; onImportLut: () => void; onRefresh: () => void}) {
  const {width} = useWindowDimensions(); const wide = width >= 900; const isMotion = page === 'motion'; const isTimer = page === 'timer';
  const [delay, setDelay] = useState('10'); const [deadline, setDeadline] = useState<number | null>(null); const [grid, setGrid] = useState(true); const [audio, setAudio] = useState(false);
  const seconds = deadline === null ? null : Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
  useEffect(() => { if (deadline === null) return; const id = setInterval(() => { if (Date.now() >= deadline) { clearInterval(id); setDeadline(null); camera?.remoteShutter(); } }, 100); return () => clearInterval(id); }, [deadline]);
  const title = page === 'monitor' ? '监看' : isTimer ? '定时遥控' : '动态照片';
  return <View style={[styles.workspace, !wide && styles.workspaceNarrow]}><View style={styles.previewPane}><Surface style={styles.previewSurface} elevation={1}>{preview ? <Image source={{uri: preview}} style={styles.preview} resizeMode="contain"/> : <View style={styles.emptyPreview}><ActivityIndicator/><Text style={styles.muted}>等待 USB 取景</Text></View>}{grid && <View pointerEvents="none" style={styles.grid}><View style={styles.gridV}/><View style={styles.gridH}/></View>}</Surface></View><ScrollView style={[styles.controlPane, !wide && styles.controlPaneNarrow]} contentContainerStyle={styles.controlContent}><Button mode="text" onPress={() => go('home')}>首页</Button><Text variant="headlineSmall">{title}</Text><Text variant="bodyMedium" style={styles.muted}>{state.lut ? `LUT：${state.lut}` : 'LUT：关闭'}</Text>
    {isMotion && <><Text variant="labelLarge">快门前缓存 {buffered.toFixed(1)} / 3.0 秒</Text><ProgressBar progress={Math.min(1, buffered / 3)} style={styles.progress}/><Button mode="contained" disabled={!state.ready || state.busy} onPress={() => camera?.capture()}>拍摄动态照片</Button><HelperText type="info">原片保存在手机，LUT 渲染图另存；视频只使用快门前缓存。</HelperText></>}
    {isTimer && <><Text variant="labelLarge">快门延时</Text><SegmentedButtons value={delay} onValueChange={setDelay} buttons={[{value:'2',label:'2 秒'},{value:'5',label:'5 秒'},{value:'10',label:'10 秒'},{value:'30',label:'30 秒'}]} density="small"/><Button mode="contained" disabled={!state.active || deadline !== null || state.busy} onPress={() => setDeadline(Date.now() + Number(delay) * 1000)}>{seconds === null ? '开始倒计时' : `${seconds} 秒后触发机身快门`}</Button>{deadline !== null && <Button mode="outlined" onPress={() => setDeadline(null)}>取消倒计时</Button>}<HelperText type="info">定时遥控触发机身 SD 卡快门；动态照片模式才会下载并套用 LUT。</HelperText></>}
    {page === 'monitor' && <><Text variant="titleMedium">实时监看</Text><View style={styles.row}><Text>构图网格</Text><Switch value={grid} onValueChange={setGrid}/></View><View style={styles.row}><Text>环境声</Text><Switch value={audio} onValueChange={(v) => {setAudio(v); camera?.setAudio(v);}}/></View><View style={styles.focusRow}><Button mode="outlined" disabled={!state.active} onPress={() => camera?.focus(-1)}>远对焦</Button><Button mode="outlined" disabled={!state.active} onPress={() => camera?.focus(0)}>自动对焦</Button><Button mode="outlined" disabled={!state.active} onPress={() => camera?.focus(1)}>近对焦</Button></View></>}
    <Divider style={styles.divider}/><Text variant="titleMedium">LUT 仓库</Text><Button mode="outlined" onPress={onImportLut}>导入 LUMIX Lab LUT（.cube / .zip）</Button><Button mode="text" onPress={() => onLut('off')}>关闭 LUT</Button>{luts.map((lut) => <List.Item key={lut.id} title={lut.name} description={`${(lut.size / 1024).toFixed(1)} KB`} onPress={() => onLut(lut.id)} right={() => state.lut === lut.name ? <List.Icon icon="check"/> : null}/>) }<Button mode="text" onPress={onRefresh}>刷新 LUT 仓库</Button><Button mode="outlined" onPress={() => go('album')}>打开相册</Button>
  </ScrollView></View>;
}

function Album({moments, onBack}: {moments: MomentItem[]; onBack: () => void}) { return <ScrollView contentContainerStyle={styles.album}><Button mode="text" onPress={onBack}>首页</Button><Text variant="headlineSmall">相册</Text><Text style={styles.muted}>原片不覆盖；有 LUT 时显示渲染图，视频可交给系统播放器打开。</Text>{moments.length === 0 ? <Card><Card.Content><Text>还没有动态照片</Text></Card.Content></Card> : moments.map((moment) => <Card key={moment.id} style={styles.albumCard}><Card.Content><View style={styles.albumRow}>{moment.imageUri && <Image source={{uri: moment.imageUri}} style={styles.thumb}/>}<View style={styles.albumInfo}><Text variant="titleMedium">{moment.source || '动态照片'}</Text><Text style={styles.muted}>{new Date(moment.createdAt).toLocaleString()}</Text><Text style={styles.muted}>{moment.lut ? `LUT：${moment.lut}` : '原片'}</Text><View style={styles.albumActions}>{moment.videoUri && <Button compact mode="outlined" onPress={() => Linking.openURL(moment.videoUri!)}>打开视频</Button>}{moment.imageUri && <Button compact mode="text" onPress={() => Linking.openURL(moment.imageUri!)}>打开照片</Button>}</View></View></View></Card.Content></Card>)}</ScrollView>; }
function errorText(e: unknown) { return String((e as Error)?.message || e); }

const styles = StyleSheet.create({root: {flex: 1, backgroundColor: theme.colors.background}, header: {minHeight: 72, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}, headerRight: {flexDirection: 'row', alignItems: 'center', gap: 12}, home: {padding: 20, gap: 20}, homeIntro: {gap: 4}, menuGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 12}, muted: {color: theme.colors.onSurfaceVariant}, menuCard: {width: '48%', minHeight: 130}, workspace: {flex: 1, flexDirection: 'row', gap: 16, padding: 16}, workspaceNarrow: {flexDirection: 'column'}, previewPane: {flex: 1, minHeight: 240}, previewSurface: {flex: 1, minHeight: 240, backgroundColor: '#181D18', overflow: 'hidden'}, preview: {width: '100%', height: '100%'}, emptyPreview: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12}, controlPane: {width: 360, maxWidth: '36%'}, controlPaneNarrow: {width: '100%', maxWidth: '100%'}, controlContent: {gap: 12, paddingBottom: 24}, progress: {height: 8}, row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}, focusRow: {flexDirection: 'row', gap: 6}, divider: {marginVertical: 8}, grid: {position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'center', alignItems: 'center'}, gridV: {width: 1, height: '100%', backgroundColor: '#ffffff55'}, gridH: {height: 1, width: '100%', backgroundColor: '#ffffff55'}, album: {padding: 20, gap: 12}, albumCard: {marginBottom: 4}, albumRow: {flexDirection: 'row', gap: 12}, thumb: {width: 160, height: 100, borderRadius: 8}, albumInfo: {flex: 1, gap: 4}, albumActions: {flexDirection: 'row', gap: 4}});
