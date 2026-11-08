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
import NoticeBar from './src/NoticeBar';
import ConnectionSheet from './src/connection/ConnectionSheet';
import {openDiagnosticsPage, registerDiagnosticsOpener} from './src/connection/diagnostics';
import {WifiConnectionOptions} from './src/connection/model';
import useCameraReadings from './src/hud/useCameraReadings';
import SettingsScreen, {SettingsPage} from './src/SettingsScreen';
import OnboardingCards from './src/OnboardingCards';
import {buildInfoFromModule} from './src/buildInfo';
import {Notice} from './src/notice';
import {ConnectionMemory, DEFAULT_CONNECTION, loadPreferences, saveConnectionMemory, savePreference} from './src/preferences';
import {captureFailureNotice, userFacingError} from './src/captureError';
import {savedNoticeMessage} from './src/savedNotice';
import {A11yHideView} from './src/A11yHideView';
import {DISCONNECT_BANNER, RECONNECT_ACTION, USB_ATTACH_ACTION, USB_ATTACH_BANNER, classifySessionLoss, connectionToRemember, reconnectPlan, sessionLossAction} from './src/connection/sessionNotice';
import {USB_CAMERA_ATTACHED_EVENT} from './src/volumeShutter';

const emptyState: CameraState = {active: false, busy: false, ready: false, demo: false, lut: null};

export default function App() {
  const [page, setPage] = useState<'camera' | 'album' | 'settings'>('camera');
  const pageRef = useRef(page);
  pageRef.current = page;
  const [settingsPage, setSettingsPage] = useState<SettingsPage>('list');
  const [state, setState] = useState<CameraState>(emptyState);
  const stateRef = useRef(state);
  stateRef.current = state;
  // Unknown at first render still means this foreground activity; only an explicit pause is background.
  const appActiveRef = useRef(AppState.currentState !== 'background' && AppState.currentState !== 'inactive');
  const bannerHeldRef = useRef(false);
  const attemptedWifiIp = useRef<string | null>(null);
  const [connectionMemory, setConnectionMemory] = useState<ConnectionMemory>(DEFAULT_CONNECTION);
  const connectionMemoryRef = useRef(connectionMemory);
  connectionMemoryRef.current = connectionMemory;
  const [preview, setPreview] = useState<string>();
  const [buffered, setBuffered] = useState(0);
  const [luts, setLuts] = useState<LutItem[]>([]);
  const [moments, setMoments] = useState<MomentItem[]>([]);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [openedMomentId, setOpenedMomentId] = useState<string | null>(null);
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState('');
  const [introOpen, setIntroOpen] = useState(false);
  const lastPreviewAt = useRef(-Infinity);
  const pendingSavedId = useRef<string | undefined>(undefined);
  useCameraReadings(state, setState, page === 'camera');
  const dismissNotice = useCallback(() => setNotice(null), []);
  const showNotice = useCallback((message: string, action?: Notice['action']) => {
    setNotice(action ? {message, action} : {message});
  }, []);
  const connect = useCallback(async () => {
    if (!camera) throw new Error('当前平台没有相机桥');
    attemptedWifiIp.current = null;
    await camera.connect();
  }, []);
  const connectWifi = useCallback(async (options: WifiConnectionOptions) => {
    if (!camera) throw new Error('当前平台没有相机桥');
    attemptedWifiIp.current = options.cameraIp;
    await camera.connectWifi(options);
  }, []);
  const reconnectLast = useCallback(async () => {
    if (!camera) throw new Error('当前平台没有相机桥');
    const plan = reconnectPlan(connectionMemoryRef.current);
    if (plan.method === 'wifi') {
      attemptedWifiIp.current = plan.cameraIp;
      await camera.connectWifi({manual: true, cameraIp: plan.cameraIp});
    } else if (plan.method === 'demo') {
      camera.demo();
    } else {
      attemptedWifiIp.current = null;
      await camera.connect();
    }
  }, []);
  const showReconnectBanner = useCallback(() => {
    setNotice({message: DISCONNECT_BANNER, durationMs: 12000, action: {label: RECONNECT_ACTION, onPress: () => { void reconnectLast().catch(e => showNotice(errorText(e))); }}});
  }, [reconnectLast, showNotice]);
  const refresh = useCallback(async () => {
    if (!camera) return;
    try { setLuts(await camera.listLuts()); setMoments(await camera.listMoments()); setState(await camera.getState()); }
    catch (e) { showNotice(errorText(e)); }
  }, [showNotice]);
  useEffect(() => {
    let live = true;
    void loadPreferences().then(prefs => {
      if (!live || !prefs) return;
      setConnectionMemory(prefs.connection);
      if (!prefs.onboardingSeen) setIntroOpen(true);
    });
    return () => { live = false; };
  }, []);
  const finishIntro = useCallback(() => {
    setIntroOpen(false);
    void savePreference('onboardingSeen', true).catch(() => undefined);
  }, []);
  // Only a session that actually came up replaces the remembered way. Failed attempts keep the old one.
  useEffect(() => {
    const memory = connectionToRemember(state.active, state.demo, state.transport, attemptedWifiIp.current, connectionMemoryRef.current.cameraIp);
    if (!memory) return;
    const previous = connectionMemoryRef.current;
    if (memory.method === previous.method && memory.cameraIp === previous.cameraIp) return;
    setConnectionMemory(memory);
    void saveConnectionMemory(memory).catch(() => undefined);
  }, [state.active, state.demo, state.transport]);
  useEffect(() => { if (state.active) bannerHeldRef.current = false; }, [state.active]);
  const autoExportSaved = useCallback(async (id: string | undefined) => {
    if (!id || !camera?.getPreferences || !camera.exportMoment) return;
    try {
      const prefs = await camera.getPreferences();
      if (!prefs.autoExport) return;
      await camera.exportMoment(id);
    } catch (e) { showNotice(`自动导出失败：${errorText(e)}`); }
  }, [showNotice]);
  useEffect(() => registerDiagnosticsOpener(() => {
    setConnectionOpen(false);
    setSettingsPage('diagnostics');
    setPage('settings');
  }), []);
  useEffect(() => {
    void refresh();
    if (!cameraEvents) { showNotice('当前平台没有相机桥'); return; }
    const subs = [
      cameraEvents.addListener('cameraStatus', (e) => {
        const raw = typeof e.message === 'string' ? e.message : '';
        const loss = classifySessionLoss(raw, appActiveRef.current);
        const action = sessionLossAction(loss, stateRef.current.active, bannerHeldRef.current);
        if (action === 'banner') {
          bannerHeldRef.current = true;
          showReconnectBanner();
        } else if (action !== 'quiet') {
          const saved = savedNoticeMessage(raw);
          if (saved) {
            const id = pendingSavedId.current;
            pendingSavedId.current = undefined;
            showNotice(saved, id ? {label: '查看', onPress: () => { setOpenedMomentId(id); setPage('album'); }} : undefined);
          } else if (raw) showNotice(userFacingError(raw));
        }
        setConnectionStatus(raw ? userFacingError(raw) : raw);
        setState((s) => ({...s, ready: !!e.ready}));
        void refresh();
      }),
      cameraEvents.addListener(USB_CAMERA_ATTACHED_EVENT, () => {
        // The native side already checked foreground and an idle session; this guard covers a stale event.
        if (stateRef.current.active || !appActiveRef.current) return;
        showNotice(USB_ATTACH_BANNER, {label: USB_ATTACH_ACTION, onPress: () => { void connect().catch(e => showNotice(errorText(e))); }});
      }),
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
        // The following status line is the notice. It already names the shot type and LUT.
        pendingSavedId.current = momentIdFromDirectory(event?.directory);
        void refresh();
        void autoExportSaved(pendingSavedId.current);
      }),
      cameraEvents.addListener('cameraFailed', (e) => {
        const detail = typeof e.error === 'string' ? e.error.trim() : '';
        showNotice(captureFailureNotice(detail), {
          label: '查看诊断',
          onPress: () => openDiagnosticsPage(),
        });
        void refresh();
      }),
    ];
    const app = AppState.addEventListener('change', (next) => {
      appActiveRef.current = next === 'active';
      if (next === 'active') void refresh();
    });
    return () => { subs.forEach((s) => s.remove()); app.remove(); };
  }, [autoExportSaved, connect, refresh, showNotice, showReconnectBanner]);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (connectionOpen) { setConnectionOpen(false); return true; }
      // This listener is registered after the screens, so it runs first. Album and settings
      // own their stacks; consuming the key here would skip the viewer and the settings subpages.
      return false;
    });
    return () => sub.remove();
  }, [connectionOpen]);
  const closeSettings = useCallback(() => setPage('camera'), []);
  const cameraFocused = page === 'camera';
  // Capture stays mounted under other pages. Native volume gating uses the same foreground flag as the screen.
  const captureForeground = cameraFocused && !connectionOpen && !introOpen;
  useEffect(() => {
    camera?.setCaptureScreen?.(captureForeground);
    return () => { camera?.setCaptureScreen?.(false); };
  }, [captureForeground]);
  const setLut = async (id: string) => { if (!camera) return; try { const title = await camera.setLut(id); setState((s) => ({...s, lut: title})); showNotice(id === 'off' ? 'LUT 已关闭' : 'LUT 已启用'); } catch (e) { showNotice(errorText(e)); } };
  const importLut = async () => {
    if (!camera) return showNotice('当前平台没有相机桥');
    try { const file = await DocumentPicker.pickSingle({type: [DocumentPicker.types.allFiles]}); const item = await camera.importLut(file.uri, file.name || 'imported.cube'); await refresh(); await setLut(item.id); }
    catch (e) { if (!DocumentPicker.isCancel(e)) showNotice(errorText(e)); }
  };
  const exportMoment = async (id: string, quiet = false) => {
    try {
      if (!camera) throw new Error('当前平台没有相机桥');
      await camera.exportMoment(id);
      setMoments((items) => items.map((item) => item.id === id ? {...item, exported: true} : item));
      if (!quiet) showNotice('已导出到 DCIM/MomentS5');
    } catch (e) {
      if (quiet) throw e;
      showNotice(errorText(e));
    }
  };
  const deleteMoment = async (id: string, quiet = false) => {
    try {
      if (!camera) throw new Error('当前平台没有相机桥');
      await camera.deleteMoment(id);
      setMoments((items) => items.filter((item) => item.id !== id));
      if (!quiet) showNotice('已删除 App 内照片；SD 卡原片与系统相册副本保留');
    } catch (e) {
      if (quiet) throw e;
      showNotice(errorText(e));
    }
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
  // accessibilityViewIsModal only hides siblings for VoiceOver. The page behind is an
  // A11yHideView so no-hide-descendants also leaves the Android accessibility tree.
  const behindIntro = introOpen ? 'no-hide-descendants' as const : 'auto' as const;
  const shareMoment = useCallback(async (id: string, kind: string) => {
    try {
      if (!camera) throw new Error('当前平台没有相机桥');
      await camera.shareMoment(id, kind);
    } catch (e) { showNotice(errorText(e)); }
  }, [showNotice]);
  const shareMoments = useCallback(async (ids: string[]) => {
    try {
      if (!camera?.shareMoments) throw new Error('当前平台没有相机桥');
      await camera.shareMoments(ids);
    } catch (e) { showNotice(errorText(e)); throw e; }
  }, [showNotice]);
  return <GestureHandlerRootView style={styles.root}><SafeAreaProvider><PaperProvider theme={theme}><SafeAreaView style={styles.root}>
    {/* FLAG_FULLSCREEN from this component does not stay hidden on targetSdk 35. The activity hides the bars; SafeAreaView then only pads insets that remain, such as a cutout. */}
    <StatusBar hidden />
    {/* Stay mounted under the album and settings so the viewfinder and scopes do not reconnect. Intro hides this whole stack, including the connection sheet and notices. */}
    <A11yHideView testID="app-behind" collapsable={false} pointerEvents={introOpen ? 'none' : 'auto'} accessibilityElementsHidden={introOpen} importantForAccessibility={behindIntro} style={styles.fill}>
    <View style={styles.stage}>
      <View testID="camera-layer" pointerEvents={cameraFocused ? 'auto' : 'none'} accessibilityElementsHidden={!cameraFocused} importantForAccessibility={cameraFocused ? 'auto' : 'no-hide-descendants'} style={styles.stage}>
        <CameraWorkspace focused={captureForeground} suspendBack={connectionOpen} latestPhoto={moments[0]?.imageUri} notice={captureForeground ? notice : null} onDismissNotice={dismissNotice} onAlbum={() => {void refresh(); setPage('album');}} onSettings={() => {setSettingsPage('list'); setPage('settings');}} state={state} preview={preview} buffered={buffered} luts={luts} onLut={setLut} onImportLut={importLut} onRefresh={refresh} onConnect={async () => setConnectionOpen(true)}/>
      </View>
      {page !== 'camera' && <View style={styles.cover}>
        {page === 'album' && <MotionAlbum moments={moments} luts={luts} initialMomentId={openedMomentId} onInitialMomentHandled={() => setOpenedMomentId(null)} onBack={() => setPage('camera')} onExport={exportMoment} onDelete={deleteMoment} onNotice={showNotice} onRender={renderMoment} onPreview={previewMomentLut} onThumbnail={previewMomentThumbnail} onDetails={describeMoment} onShare={shareMoment} onShareMany={shareMoments}/>}
        {page === 'settings' && <SettingsScreen build={buildInfoFromModule(camera)} page={settingsPage} onPageChange={setSettingsPage} onBack={closeSettings} onNotice={setNotice} onShowIntro={() => setIntroOpen(true)}/>}
      </View>}
    </View>
    <ConnectionSheet visible={connectionOpen} state={state} status={connectionStatus} debugAllowed={!!camera?.wifiDebugEnabled} remembered={connectionMemory} onClose={() => setConnectionOpen(false)} onUsb={connect} onWifi={connectWifi} onDemo={async () => {if (!camera) throw new Error('当前平台没有相机桥'); camera.demo();}} onDisconnect={() => camera?.disconnect()}/>
    {page !== 'camera' && <View pointerEvents="box-none" style={styles.noticeHost}><NoticeBar notice={notice} onDismiss={dismissNotice}/></View>}
    </A11yHideView>
    {introOpen && <OnboardingCards onDone={finishIntro}/>}
  </SafeAreaView></PaperProvider></SafeAreaProvider></GestureHandlerRootView>;
}
function errorText(e: unknown) { return userFacingError(String((e as Error)?.message || e)); }
function momentIdFromDirectory(directory: unknown) {
  if (typeof directory !== 'string' || !directory) return undefined;
  const name = directory.split(/[/\\]/).filter(Boolean).pop();
  return name || undefined;
}
const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: theme.colors.background},
  fill: {flex: 1},
  stage: {flex: 1, minHeight: 0},
  cover: {...StyleSheet.absoluteFillObject, zIndex: 2, backgroundColor: theme.colors.background},
  noticeHost: {position: 'absolute', left: ui.space.gutter, right: ui.space.gutter, bottom: ui.space.lg, zIndex: 40},
});
