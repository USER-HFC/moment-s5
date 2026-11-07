import React, {useCallback, useEffect, useRef, useState} from 'react';
import {AppState, BackHandler, StatusBar, StyleSheet, View} from 'react-native';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import DocumentPicker from 'react-native-document-picker';
import {SafeAreaProvider, SafeAreaView} from 'react-native-safe-area-context';
import {Provider as PaperProvider} from 'react-native-paper';
import {camera, cameraEvents, CameraState, LutItem, MomentItem} from './src/native';
import {theme, ui} from './src/theme';
import CameraWorkspace from './src/CameraWorkspace';
import MotionAlbum from './src/MotionAlbum';
import NoticeBar, {Notice} from './src/NoticeBar';
import ConnectionSheet from './src/connection/ConnectionSheet';
import {WifiConnectionOptions} from './src/connection/model';
import useCameraReadings from './src/hud/useCameraReadings';
import SettingsScreen from './src/SettingsScreen';
import {buildInfoFromModule} from './src/buildInfo';

const emptyState: CameraState = {active: false, busy: false, ready: false, demo: false, lut: null};

export default function App() {
  const [page, setPage] = useState<'camera' | 'album' | 'settings'>('camera');
  const pageRef = useRef(page);
  pageRef.current = page;
  const [state, setState] = useState<CameraState>(emptyState);
  const [preview, setPreview] = useState<string>();
  const [buffered, setBuffered] = useState(0);
  const [luts, setLuts] = useState<LutItem[]>([]);
  const [moments, setMoments] = useState<MomentItem[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [openedMomentId, setOpenedMomentId] = useState<string | null>(null);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('');
  const lastPreviewAt = useRef(-Infinity);
  useCameraReadings(state, setState, page === 'camera');
  const dismissNotice = useCallback(() => setNotice(null), []);
  const showNotice = useCallback((message: string, action?: Notice['action']) => {
    setNotice(action ? {message, action} : {message});
  }, []);
  const refresh = useCallback(async () => {
    if (!camera) return;
    try { setLuts(await camera.listLuts()); setMoments(await camera.listMoments()); setState(await camera.getState()); }
    catch (e) { showNotice(errorText(e)); }
  }, [showNotice]);
  useEffect(() => {
    void refresh();
    if (!cameraEvents) { showNotice('当前平台没有相机桥'); return; }
    const subs = [
      cameraEvents.addListener('cameraStatus', (e) => { if (typeof e.message === 'string' && !isSavedStatus(e.message)) showNotice(e.message); setConnectionStatus(e.message); setState((s) => ({...s, ready: !!e.ready})); void refresh(); }),
      cameraEvents.addListener('cameraFrame', (e) => {
        const now = performance.now();
        if (pageRef.current === 'camera' && now - lastPreviewAt.current >= 66) {
          lastPreviewAt.current = now; setPreview('data:image/jpeg;base64,' + e.jpegBase64);
        }
        setBuffered(e.bufferedUs / 1_000_000);
        setState((s) => ({...s, demo: !!e.demo, exposure: e.exposure ?? s.exposure, exposureAgeMs: e.exposureAgeMs, ready: e.ready ?? e.bufferedUs >= 3_000_000}));
      }),
      cameraEvents.addListener('cameraExposure', (e) => setState(s => ({...s, exposure: e.value, exposureAgeMs: e.exposureAgeMs}))),
      cameraEvents.addListener('phoneBattery', (e) => setState(s => ({...s, phoneBattery: e}))),
      cameraEvents.addListener('cameraSaved', (event: {directory?: string}) => {
        const id = momentIdFromDirectory(event?.directory);
        showNotice('已保存', id ? {label: '查看', onPress: () => { setOpenedMomentId(id); setPage('album'); }} : undefined);
        void refresh();
      }),
      cameraEvents.addListener('cameraFailed', (e) => { showNotice('照片处理失败：' + (e.error || '请检查连接诊断')); void refresh(); }),
    ];
    const app = AppState.addEventListener('change', (next) => { if (next === 'active') void refresh(); });
    return () => { subs.forEach((s) => s.remove()); app.remove(); };
  }, [refresh, showNotice]);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (page === 'camera') return false;
      // Settings owns its own back stack (list → capture, about → list).
      if (page === 'settings') return false;
      setPage('camera'); return true;
    });
    return () => sub.remove();
  }, [page]);
  const closeSettings = useCallback(() => setPage('camera'), []);
  const connect = async () => { if (!camera) throw new Error('当前平台没有相机桥'); await camera.connect(); };
  const connectWifi = async (options: WifiConnectionOptions) => { if (!camera) throw new Error('当前平台没有相机桥'); await camera.connectWifi(options); };
  const setLut = async (id: string) => { if (!camera) return; try { const title = await camera.setLut(id); setState((s) => ({...s, lut: title})); showNotice(id === 'off' ? 'LUT 已关闭' : 'LUT 已启用'); } catch (e) { showNotice(errorText(e)); } };
  const importLut = async () => {
    if (!camera) return showNotice('当前平台没有相机桥');
    try { const file = await DocumentPicker.pickSingle({type: [DocumentPicker.types.allFiles]}); const item = await camera.importLut(file.uri, file.name || 'imported.cube'); await refresh(); await setLut(item.id); }
    catch (e) { if (!DocumentPicker.isCancel(e)) showNotice(errorText(e)); }
  };
  const exportMoment = async (id: string) => {
    try {
      if (!camera) throw new Error('当前平台没有相机桥');
      await camera.exportMoment(id); showNotice('已导出到 DCIM/MomentS5');
    } catch (e) { showNotice(errorText(e)); }
  };
  const deleteMoment = async (id: string) => {
    try {
      if (!camera) throw new Error('当前平台没有相机桥');
      await camera.deleteMoment(id);
      setMoments((items) => items.filter((item) => item.id !== id));
      showNotice('已删除 App 内照片；SD 卡原片与系统相册副本保留');
    } catch (e) { showNotice(errorText(e)); }
  };
  const renderMoment = useCallback(async (id: string, lutId: string) => {
    try {
      if (!camera) throw new Error('当前平台没有相机桥');
      const updated = await camera.renderMoment(id, lutId);
      setMoments((items) => items.map((item) => item.id === id ? {...item, ...updated} : item));
      showNotice(updated.lut ? '已从原片重新套用 LUT' : '已恢复原色');
      return updated;
    } catch (e) { showNotice(errorText(e)); throw e; }
  }, [showNotice]);
  const previewMomentLut = useCallback(async (id: string, lutId: string) => {
    try {
      if (!camera) throw new Error('当前平台没有相机桥');
      return await camera.previewMomentLut(id, lutId);
    } catch (e) { showNotice(errorText(e)); throw e; }
  }, [showNotice]);
  const previewMomentThumbnail = useCallback(async (id: string, lutId: string) => {
    if (!camera?.previewMomentLutThumbnail) return null;
    try { return await camera.previewMomentLutThumbnail(id, lutId, 160); }
    catch { return null; }
  }, []);
  const describeMoment = useCallback(async (id: string) => {
    if (!camera) throw new Error('当前平台没有相机桥');
    return camera.describeMoment(id);
  }, []);
  const shareMoment = useCallback(async (id: string, kind: string) => {
    try {
      if (!camera) throw new Error('当前平台没有相机桥');
      await camera.shareMoment(id, kind);
    } catch (e) { showNotice(errorText(e)); }
  }, [showNotice]);
  return <GestureHandlerRootView style={styles.root}><SafeAreaProvider><PaperProvider theme={theme}><SafeAreaView style={styles.root}>
    <StatusBar hidden />
    {page === 'camera' && <CameraWorkspace latestPhoto={moments[0]?.imageUri} notice={notice} onDismissNotice={dismissNotice} onAlbum={() => {void refresh(); setPage('album');}} onSettings={() => setPage('settings')} state={state} preview={preview} buffered={buffered} luts={luts} onLut={setLut} onImportLut={importLut} onRefresh={refresh} onConnect={async () => setConnectionOpen(true)}/>}
    {page === 'album' && <MotionAlbum moments={moments} luts={luts} initialMomentId={openedMomentId} onInitialMomentHandled={() => setOpenedMomentId(null)} onBack={() => setPage('camera')} onExport={exportMoment} onDelete={deleteMoment} onRender={renderMoment} onPreview={previewMomentLut} onThumbnail={previewMomentThumbnail} onDetails={describeMoment} onShare={shareMoment}/>}
    {page === 'settings' && <SettingsScreen build={buildInfoFromModule(camera)} onBack={closeSettings}/>}
    <ConnectionSheet visible={connectionOpen} state={state} status={connectionStatus} debugAllowed={!!camera?.wifiDebugEnabled} onClose={() => setConnectionOpen(false)} onUsb={connect} onWifi={connectWifi} onDemo={async () => {if (!camera) throw new Error('当前平台没有相机桥'); camera.demo();}} onDisconnect={() => camera?.disconnect()}/>
    {page !== 'camera' && <View pointerEvents="box-none" style={styles.noticeHost}><NoticeBar notice={notice} onDismiss={dismissNotice}/></View>}
  </SafeAreaView></PaperProvider></SafeAreaProvider></GestureHandlerRootView>;
}
function errorText(e: unknown) { return String((e as Error)?.message || e); }
function isSavedStatus(message: string) { return typeof message === 'string' && message.includes('已保存'); }
function momentIdFromDirectory(directory: unknown) {
  if (typeof directory !== 'string' || !directory) return undefined;
  const name = directory.split(/[/\\]/).filter(Boolean).pop();
  return name || undefined;
}
const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: theme.colors.background},
  noticeHost: {position: 'absolute', left: ui.space.gutter, right: ui.space.gutter, bottom: ui.space.lg, zIndex: 40},
});
