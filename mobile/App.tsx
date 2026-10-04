import React, {useCallback, useEffect, useRef, useState} from 'react';
import {AppState, BackHandler, StatusBar, StyleSheet, View} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import DocumentPicker from 'react-native-document-picker';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {Provider as PaperProvider, Snackbar} from 'react-native-paper';
import {camera, cameraEvents, CameraState, LutItem, MomentItem} from './src/native';
import {theme} from './src/theme';
import CameraWorkspace from './src/CameraWorkspace';
import MotionAlbum from './src/MotionAlbum';

const emptyState: CameraState = {active: false, busy: false, ready: false, demo: false, lut: null};

export default function App() {
  const [page, setPage] = useState<'camera' | 'album'>('camera');
  const pageRef = useRef(page);
  pageRef.current = page;
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
    void refresh();
    if (!cameraEvents) { setStatus('当前平台没有相机桥'); return; }
    const subs = [
      cameraEvents.addListener('cameraStatus', (e) => { setStatus(e.message); setState((s) => ({...s, ready: !!e.ready})); void refresh(); }),
      cameraEvents.addListener('cameraFrame', (e) => {
        const now = Date.now();
        if (pageRef.current === 'camera' && now - lastPreviewAt.current >= 66) {
          lastPreviewAt.current = now; setPreview('data:image/jpeg;base64,' + e.jpegBase64);
        }
        setBuffered(e.bufferedUs / 1_000_000);
        setState((s) => ({...s, demo: !!e.demo, ready: e.ready ?? e.bufferedUs >= 3_000_000}));
      }),
      cameraEvents.addListener('cameraSaved', () => { setSnack('动态照片已保存'); void refresh(); }),
      cameraEvents.addListener('cameraFailed', (e) => { setSnack('动态照片处理失败：' + (e.error || '请检查连接诊断')); void refresh(); }),
    ];
    const app = AppState.addEventListener('change', (next) => { if (next === 'active') void refresh(); });
    return () => { subs.forEach((s) => s.remove()); app.remove(); };
  }, [refresh]);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (page === 'camera') return false;
      setPage('camera'); return true;
    });
    return () => sub.remove();
  }, [page]);
  const connect = async () => { if (!camera) return setSnack('当前平台没有相机桥'); try { await camera.connect(); } catch (e) { setSnack(errorText(e)); } };
  const setLut = async (id: string) => { if (!camera) return; try { const title = await camera.setLut(id); setState((s) => ({...s, lut: title})); setSnack(id === 'off' ? '监看与照片 LUT 已关闭' : '监看与照片会使用此 LUT，原片仍会保留'); } catch (e) { setSnack(errorText(e)); } };
  const importLut = async () => {
    if (!camera) return setSnack('当前平台没有相机桥');
    try { const file = await DocumentPicker.pickSingle({type: [DocumentPicker.types.allFiles]}); const item = await camera.importLut(file.uri, file.name || 'imported.cube'); await refresh(); await setLut(item.id); }
    catch (e) { if (!DocumentPicker.isCancel(e)) setSnack(errorText(e)); }
  };
  const exportMoment = async (id: string) => {
    try {
      if (!camera) throw new Error('当前平台没有相机桥');
      await camera.exportMoment(id); setSnack('动态照片已保存到系统相册');
    } catch (e) { setSnack(errorText(e)); }
  };
  const deleteMoment = async (id: string) => {
    try {
      if (!camera) throw new Error('当前平台没有相机桥');
      await camera.deleteMoment(id);
      setMoments((items) => items.filter((item) => item.id !== id));
      setSnack('已删除 App 内照片；SD 卡原片与系统相册副本保留');
    } catch (e) { setSnack(errorText(e)); }
  };
  return <GestureHandlerRootView style={styles.root}><SafeAreaProvider><PaperProvider theme={theme}><SafeAreaView style={styles.root}>
    <StatusBar hidden />
    {page === 'camera' && <CameraWorkspace onAlbum={() => {void refresh(); setPage('album');}} state={state} preview={preview} buffered={buffered} luts={luts} onLut={setLut} onImportLut={importLut} onRefresh={refresh} onConnect={connect}/>}
    {page === 'album' && <MotionAlbum moments={moments} onBack={() => setPage('camera')} onExport={exportMoment} onDelete={deleteMoment}/>}
    <Snackbar visible={!!snack} onDismiss={() => setSnack('')} duration={4500}>{snack}</Snackbar>
  </SafeAreaView></PaperProvider></SafeAreaProvider></GestureHandlerRootView>;
}
function errorText(e: unknown) { return String((e as Error)?.message || e); }
const styles = StyleSheet.create({root: {flex: 1, backgroundColor: theme.colors.background}});
