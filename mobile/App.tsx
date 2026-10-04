import React, {useCallback, useEffect, useRef, useState} from 'react';
import {AppState, BackHandler, Image, ScrollView, StatusBar, StyleSheet, useWindowDimensions, View} from 'react-native';
import DocumentPicker from 'react-native-document-picker';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {Button, Card, Provider as PaperProvider, Snackbar, Text} from 'react-native-paper';
import {camera, cameraEvents, CameraState, LutItem, MomentItem} from './src/native';
import {theme} from './src/theme';
import CameraWorkspace from './src/CameraWorkspace';
import MotionAlbum from './src/MotionAlbum';

type Page = 'home' | 'monitor' | 'timer' | 'motion' | 'album';
const emptyState: CameraState = {active: false, busy: false, ready: false, demo: false, lut: null};

export default function App() {
  const {width} = useWindowDimensions();
  const compactHeader = width < 600;
  const [page, setPage] = useState<Page>('monitor');
  const [state, setState] = useState<CameraState>(emptyState);
  const [status, setStatus] = useState('未连接');
  const [preview, setPreview] = useState<string>();
  const [buffered, setBuffered] = useState(0);
  const [luts, setLuts] = useState<LutItem[]>([]);
  const [moments, setMoments] = useState<MomentItem[]>([]);
  const [snack, setSnack] = useState('');
  const lastPreviewAt = useRef(0);
  const refresh = useCallback(async () => {
    if (!camera) return;
    try { setLuts(await camera.listLuts()); setMoments(await camera.listMoments()); setState(await camera.getState()); }
    catch (e) { setSnack(errorText(e)); }
  }, []);
  useEffect(() => {
    refresh();
    if (!cameraEvents) { setStatus('iOS 原生桥待接入 · 页面和 LUT 数据契约已就绪'); return; }
    const subs = [
      cameraEvents.addListener('cameraStatus', (e) => { setStatus(e.message); setState((s) => ({...s, ready: !!e.ready})); void refresh(); }),
      cameraEvents.addListener('cameraFrame', (e) => { const now = Date.now(); if (now - lastPreviewAt.current >= 66) { lastPreviewAt.current = now; setPreview(`data:image/jpeg;base64,${e.jpegBase64}`); } setBuffered(e.bufferedUs / 1_000_000); setState((s) => ({...s, demo: !!e.demo, ready: e.bufferedUs >= 3_000_000})); }),
      cameraEvents.addListener('cameraSaved', () => { setSnack('动态照片已保存，原片与 LUT 渲染图已同步'); refresh(); }),
      cameraEvents.addListener('cameraFailed', (e) => { setSnack(`动态照片处理失败：${e.error || '请检查相机设置和连接诊断'}`); refresh(); }),
      cameraEvents.addListener('cameraLog', (e) => setStatus(e.message)),
    ];
    const app = AppState.addEventListener('change', (next) => { if (next === 'active') refresh(); });
    return () => { subs.forEach((s) => s.remove()); app.remove(); };
  }, [refresh]);
  useEffect(() => { const sub = BackHandler.addEventListener('hardwareBackPress', () => { if (page === 'home') return false; setPage('home'); return true; }); return () => sub.remove(); }, [page]);
  const connect = async () => { if (!camera) return setSnack('当前平台没有相机桥'); try { await camera.connect(); } catch (e) { setSnack(errorText(e)); } };
  const setLut = async (id: string) => { if (!camera) return; try { const title = await camera.setLut(id); setState((s) => ({...s, lut: title})); setSnack(id === 'off' ? '监看与照片 LUT 已关闭' : '监看与照片会使用此 LUT，原片仍会保留'); } catch (e) { setSnack(errorText(e)); } };
  const importLut = async () => {
    if (!camera) return setSnack('当前平台没有相机桥');
    try { const file = await DocumentPicker.pickSingle({type: [DocumentPicker.types.allFiles]}); const item = await camera.importLut(file.uri, file.name || 'imported.cube'); await refresh(); await setLut(item.id); }
    catch (e) { if (!DocumentPicker.isCancel(e)) setSnack(errorText(e)); }
  };
  const exportMoment = async (id: string) => { if (!camera) return setSnack('当前平台没有相机桥'); try { await camera.exportMoment(id); setSnack('动态照片已保存到系统相册'); } catch (e) { setSnack(errorText(e)); } };
  return <SafeAreaProvider><PaperProvider theme={theme}><SafeAreaView style={styles.root}>
    <StatusBar hidden={page !== 'home'} barStyle="light-content" backgroundColor="#080909" />
    {page === 'home' && <View style={[styles.header, compactHeader && styles.headerCompact]}><View style={styles.headerLeft}><View><Text variant={compactHeader ? 'titleLarge' : 'headlineMedium'}>瞬间 Lumix</Text>{!compactHeader && <Text variant="labelMedium" style={styles.muted}>RN · Android / iPhone / iPad 共用页面契约</Text>}</View></View><View style={[styles.headerRight, compactHeader && styles.headerRightCompact]}><Text variant="labelLarge" numberOfLines={1} style={compactHeader ? styles.statusCompact : undefined}>{status}</Text><Button compact={compactHeader} mode="outlined" onPress={connect} accessibilityLabel="连接相机">连接</Button></View></View>}
    {page === 'home' ? <Home go={setPage} connected={state.active}/> : page === 'album' ? <MotionAlbum moments={moments} onBack={() => setPage('home')} onExport={exportMoment}/> : <CameraWorkspace page={page} go={setPage} state={state} preview={preview} buffered={buffered} luts={luts} onLut={setLut} onImportLut={importLut} onRefresh={refresh} onConnect={connect}/>}
    <Snackbar visible={!!snack} onDismiss={() => setSnack('')} duration={3500}>{snack}</Snackbar>
  </SafeAreaView></PaperProvider></SafeAreaProvider>;
}

function Home({go, connected}: {go: (page: Page) => void; connected: boolean}) {
  const items: [Page, string, string][] = [['monitor', '监看', '实时取景 / 对焦与构图'], ['timer', '定时遥控', '2 / 5 / 10 / 30 秒倒计时'], ['motion', '动态照片', '快门前 3 秒 · 手机同步 · LUT'], ['album', '相册', '片刻回放 / 原片与渲染图']];
  return <ScrollView contentContainerStyle={styles.home}><View style={styles.homeIntro}><Text variant="titleLarge">相机工作台</Text><Text style={styles.muted}>{connected ? 'LUMIX 已连接 · 横屏操作' : '连接 LUMIX 或进入演示模式开始'}</Text></View><View style={styles.menuGrid}>{items.map(([key, title, copy]) => <Card key={key} mode={key === 'motion' ? 'elevated' : 'contained'} onPress={() => go(key)} style={styles.menuCard} accessibilityRole="button" accessibilityLabel={title}><Card.Content><Text variant="titleLarge">{title}</Text><Text style={styles.muted}>{copy}</Text></Card.Content></Card>)}</View></ScrollView>;
}

function Album({moments, onBack, onPlay, onExport}: {moments: MomentItem[]; onBack: () => void; onPlay: (id: string) => Promise<void>; onExport: (id: string) => Promise<void>}) { return <ScrollView contentContainerStyle={styles.album}><Button mode="text" onPress={onBack}>首页</Button><Text variant="headlineSmall">相册</Text><Text style={styles.muted}>动态照片由静态图和短视频组成；点“播放动态”查看运动效果，点“保存到系统相册”导出完整 Motion Photo。</Text>{moments.length === 0 ? <Card><Card.Content><Text>还没有动态照片</Text></Card.Content></Card> : moments.map((moment) => <Card key={moment.id} style={styles.albumCard}><Card.Content><View style={styles.albumRow}>{moment.imageUri && <Image source={{uri: moment.imageUri}} style={styles.thumb}/>}<View style={styles.albumInfo}><Text variant="titleMedium">{moment.source || '动态照片'}</Text><Text style={styles.muted}>{new Date(moment.createdAt).toLocaleString()}</Text><Text numberOfLines={2} style={[styles.muted, moment.error && styles.errorText]}>{moment.lut ? `LUT：${moment.lut}` : '原片'} · {moment.complete ? '已合成' : moment.error ? `合成失败：${moment.error}` : '合成中'}</Text><View style={styles.albumActions}>{moment.videoUri && <Button compact mode="contained" onPress={() => { void onPlay(moment.id); }}>播放动态</Button>}{moment.complete && <Button compact mode="outlined" onPress={() => { void onExport(moment.id); }}>保存到系统相册</Button>}</View></View></View></Card.Content></Card>)}</ScrollView>; }
function errorText(e: unknown) { return String((e as Error)?.message || e); }

const styles = StyleSheet.create({root: {flex: 1, backgroundColor: theme.colors.background}, header: {minHeight: 72, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}, headerCompact: {minHeight: 60, paddingHorizontal: 12}, headerLeft: {flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1}, headerRight: {flexDirection: 'row', alignItems: 'center', gap: 12}, headerRightCompact: {gap: 4}, statusCompact: {maxWidth: 58, fontSize: 12}, home: {padding: 20, gap: 20}, homeIntro: {gap: 4}, menuGrid: {flexDirection: 'row', flexWrap: 'wrap', gap: 12}, muted: {color: theme.colors.onSurfaceVariant}, menuCard: {width: '48%', minHeight: 130}, workspace: {flex: 1, flexDirection: 'row', gap: 16, padding: 16}, workspaceNarrow: {flexDirection: 'column', gap: 12, padding: 12}, previewPane: {flex: 1, minHeight: 240}, previewSurface: {flex: 1, minHeight: 240, backgroundColor: '#181D18', overflow: 'hidden'}, preview: {width: '100%', height: '100%'}, emptyPreview: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12}, controlPane: {width: 360, maxWidth: '36%'}, controlPaneNarrow: {flex: 1, width: '100%', maxWidth: '100%'}, controlContent: {gap: 12, paddingBottom: 40}, progress: {height: 8}, row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}, focusRow: {flexDirection: 'row', gap: 6}, divider: {marginVertical: 8}, grid: {position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, justifyContent: 'center', alignItems: 'center'}, gridV: {width: 1, height: '100%', backgroundColor: '#ffffff55'}, gridH: {height: 1, width: '100%', backgroundColor: '#ffffff55'}, album: {padding: 20, gap: 12}, albumCard: {marginBottom: 4}, albumRow: {flexDirection: 'row', gap: 12}, thumb: {width: 160, height: 100, borderRadius: 8}, albumInfo: {flex: 1, gap: 4}, albumActions: {flexDirection: 'row', gap: 4}, errorText: {color: theme.colors.error}});
