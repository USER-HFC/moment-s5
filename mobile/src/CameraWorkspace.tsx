import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {AccessibilityInfo, Animated, Easing, Image, Pressable, ScrollView, StyleSheet, useWindowDimensions, Vibration, View} from 'react-native';
import {Button, Text} from 'react-native-paper';
import {camera, CameraState, LutItem} from './native';
import {ui} from './theme';
import CameraIcon from './CameraIcon';
import CameraControl from './CameraControl';
import useCaptureCountdown from './useCaptureCountdown';
import {requestMicrophonePermission} from './microphonePermission';
import ScopeToolbar from './scopes/ScopeToolbar';
import ScopesOverlay from './scopes/ScopesOverlay';
import {resetScopeRevealHint, useScopePanels} from './scopes/useScopes';
import LutFlyout from './LutFlyout';
import FocusFlyout from './FocusFlyout';
import TimerFlyout from './TimerFlyout';
import CameraHud from './hud/CameraHud';
import NoticeBar, {Notice} from './NoticeBar';
import {guideRect, nextGuide} from './referenceFrame';
import useRememberedCapture from './useRememberedCapture';
import {shutterBlockedReason} from './shutterReason';
import {connectionControlLabel} from './cameraLabel';

const SHUTTER_FLASH_MS = 140;

type Panel = 'lut' | 'delay' | 'focus' | null;
type Props = {
  onAlbum: () => void; onSettings?: () => void; latestPhoto?: string;
  state: CameraState; preview?: string; buffered: number; luts: LutItem[];
  onLut: (id: string) => Promise<void>; onImportLut: () => Promise<void>;
  onRefresh: () => Promise<void>; onConnect: () => Promise<void>;
  notice?: Notice | null; onDismissNotice?: () => void;
};
type PreviewSlots = [string | undefined, string | undefined];

const CONNECT_STEPS = ['相机选 PC(Tether)', '接上数据线', '手机打开 OTG'];

export default function CameraWorkspace({onAlbum, onSettings, state, preview, buffered, luts, onLut, onImportLut, onRefresh, onConnect, latestPhoto, notice = null, onDismissNotice}: Props) {
  const {width, height} = useWindowDimensions();
  const landscape = width > height;
  const scopePanels = useScopePanels();
  const [panel, setPanel] = useState<Panel>(null);
  const [rail, setRail] = useState({width: 0, height: 0});
  const [dock, setDock] = useState({width: 0, height: 0});
  const {grid, setGrid, motionEnabled, setMotionEnabled, timerEnabled, setTimerEnabled, guide, setGuide, delay, setDelay} = useRememberedCapture();
  const [audio, setAudio] = useState(!!state.audio);
  const audioPending = useRef(false);
  const [working, setWorking] = useState(false);
  const [finderSize, setFinderSize] = useState({width: 0, height: 0});
  const [workspaceSize, setWorkspaceSize] = useState({width: 0, height: 0});
  const [previewSlots, setPreviewSlots] = useState<PreviewSlots>([undefined, undefined]);
  const [activeSlot, setActiveSlot] = useState(0);
  const [shutterHint, setShutterHint] = useState<Notice | null>(null);
  const flash = useRef(new Animated.Value(0)).current;
  const reduceMotion = useRef(false);
  const activeSlotRef = useRef(0);
  const pendingSlotRef = useRef<number | null>(null);
  const slotUrisRef = useRef<PreviewSlots>([undefined, undefined]);
  const [hudTopHeight, setHudTopHeight] = useState(64);
  const [hudBottomHeight, setHudBottomHeight] = useState(88);
  const hasFeed = !!preview && state.active;
  const {waiting, seconds, start: startCountdown, cancel: cancelCountdown} = useCaptureCountdown(captureNow, state.active && !state.busy);
  // Reference guides are an overlay. The preview and the scope crop stay on the 3:2 feed.
  const sourceRatio = 1.5;
  const previewRatio = landscape ? sourceRatio : 1 / sourceRatio;
  const previewFrame = useMemo(() => {
    if (!finderSize.width || !finderSize.height) return null;
    const frameWidth = Math.min(finderSize.width, finderSize.height * previewRatio);
    return {width: frameWidth, height: frameWidth / previewRatio};
  }, [finderSize, previewRatio]);
  const reference = guide !== 'off' && previewFrame ? guideRect(previewFrame.width, previewFrame.height, guide) : null;
  const previewImageStyle = previewFrame && !landscape ? {
    position: 'absolute' as const,
    width: previewFrame.height,
    height: previewFrame.width,
    left: (previewFrame.width - previewFrame.height) / 2,
    top: (previewFrame.height - previewFrame.width) / 2,
    transform: [{rotate: '90deg'}],
  } : StyleSheet.absoluteFillObject;
  const shownNotice = shutterHint ?? notice;
  const dismissShown = useCallback(() => {
    if (shutterHint) setShutterHint(null);
    else onDismissNotice?.();
  }, [shutterHint, onDismissNotice]);

  useEffect(() => { if (state.audio !== undefined) setAudio(state.audio); }, [state.audio]);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then(value => { if (live) reduceMotion.current = value; }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', value => { reduceMotion.current = value; });
    return () => { live = false; sub?.remove(); };
  }, []);
  // A new connection starts a new reveal-hint session; the album does not (it keeps active true).
  useEffect(() => { if (!state.active) resetScopeRevealHint(); }, [state.active]);
  useEffect(() => {
    if (!preview) return;
    const nextSlot = (1 - activeSlotRef.current) as 0 | 1;
    slotUrisRef.current[nextSlot] = preview;
    pendingSlotRef.current = nextSlot;
    setPreviewSlots(current => {
      const next: PreviewSlots = [...current];
      next[nextSlot] = preview;
      return next;
    });
  }, [preview]);

  function acknowledgeShutter() {
    try { Vibration.vibrate(20); } catch { /* VIBRATE permission may be missing on forks. */ }
    if (reduceMotion.current) return;
    flash.setValue(0.45);
    Animated.timing(flash, {toValue: 0, duration: SHUTTER_FLASH_MS, easing: Easing.out(Easing.quad), useNativeDriver: true}).start();
  }
  function captureNow() {
    if (!state.active || state.busy || (motionEnabled && !state.ready)) return;
    acknowledgeShutter();
    if (motionEnabled) { if (state.ready) camera?.capture(); }
    else camera?.captureStill();
  }
  const blockedReason = waiting ? null : shutterBlockedReason({active: state.active, busy: state.busy, motion: motionEnabled, ready: state.ready, buffered});
  const fire = () => {
    if (waiting) { cancelCountdown(); return; }
    if (blockedReason) { setShutterHint({message: blockedReason}); return; }
    if (timerEnabled) { startCountdown(delay); return; }
    captureNow();
  };
  const chooseLut = async (id: string) => { setWorking(true); try { await onLut(id); } finally { setWorking(false); } };
  const toggleTimer = () => {
    if (waiting) {cancelCountdown(); setTimerEnabled(false); return;}
    setPanel(value => value === 'delay' ? null : 'delay');
  };
  const selectDelay = (value: number | null) => {
    cancelCountdown();
    if (value == null) setTimerEnabled(false);
    else { setDelay(value); setTimerEnabled(true); }
    setPanel(null);
  };
  const toggleAudio = async () => {
    if (!camera || audioPending.current) return;
    audioPending.current = true;
    try {
      const enabled = !audio;
      if (enabled && !(await requestMicrophonePermission())) return;
      camera.setAudio(enabled); setAudio(enabled);
    } finally { audioPending.current = false; }
  };
  const captureLabel = waiting ? '取消倒计时' : motionEnabled ? '拍摄动态照片' : timerEnabled ? '开始倒计时' : '拍摄照片';
  const disabled = blockedReason != null;
  const canAutofocus = state.transport !== 'wifi' || !!state.autofocus;
  // USB ManualFocusDrive only; Wi-Fi focus values are still unverified on the S5.
  const canManualFocus = state.active && !state.demo && state.transport === 'usb';
  const connectionLabel = connectionControlLabel(state);
  const timerLabel = waiting ? '取消' : timerEnabled ? `${delay} 秒` : '定时 关';
  const timerA11y = waiting ? '取消定时' : timerEnabled ? `定时 ${delay} 秒` : '定时 关';
  const audioLabel = audio ? '收音 开' : '收音 关';
  const guideLabel = guide === 'off' ? '参考' : guide;
  const commitPreview = (slot: 0 | 1, uri: string) => {
    if (pendingSlotRef.current !== slot || slotUrisRef.current[slot] !== uri) return;
    activeSlotRef.current = slot; pendingSlotRef.current = null; setActiveSlot(slot);
  };

  return <View style={styles.screen} onLayout={event => setWorkspaceSize(event.nativeEvent.layout)}>
    <View style={[styles.root, landscape && styles.rootLandscape, landscape && workspaceSize.width > 0 && {width: Math.min(workspaceSize.width, workspaceSize.height * sourceRatio + 184), alignSelf: 'center'}]} testID="camera-workspace">
    <View style={[styles.toolsRail, landscape && styles.toolsRailLandscape]} testID="camera-tools" onLayout={event => setRail(event.nativeEvent.layout)}>
      <View style={[styles.viewTools, landscape && styles.viewToolsLandscape]}>
        <CameraControl label="网格" accessibilityLabel="构图网格" icon="grid" active={grid} checked={grid} onPress={() => setGrid(value => !value)}/>
        <CameraControl label="LUT" accessibilityLabel="LUT 风格" accessibilityHint={panel === 'lut' ? '收起 LUT 面板' : '在侧边展开 LUT 面板，切换时实时预览'} icon="lut" active={!!state.lut || panel === 'lut'} onPress={() => setPanel(value => value === 'lut' ? null : 'lut')}/>
        <ScopeToolbar panels={scopePanels} landscape={landscape}/>
        {/* Same wiring as v0.7.0: far is -1 and near is +1. With UsbS5's 0x9416 values this sends
            0x03 for far and 0x02 for near; libgphoto2 and tethr disagree on which is far, so do
            not flip either side without checking on a real S5. */}
        {canManualFocus && <CameraControl testID="focus-button" label="对焦" accessibilityLabel="对焦"
          accessibilityHint={panel === 'focus' ? '收起近/远对焦面板' : '展开近/远对焦面板'}
          icon="focus" active={panel === 'focus'} disabled={state.busy || waiting}
          onPress={() => setPanel(value => value === 'focus' ? null : 'focus')}/>}
      </View>
      <View style={[styles.railEnd, landscape && styles.railEndLandscape]}>
        <CameraControl testID="settings-button" label="设置" icon="settings" accessibilityLabel="设置" accessibilityHint="打开设置" onPress={() => {cancelCountdown(); setPanel(null); onSettings?.();}}/>
        <CameraControl label={connectionLabel} accessibilityLabel="相机连接"
          accessibilityHint={`${state.active ? connectionLabel + '已连接' : '相机未连接'}，点按选择 USB、Wi-Fi（实验）或演示`}
          icon={state.active ? state.demo ? 'demo' : state.transport === 'wifi' ? 'wifi' : 'usb' : 'disconnected'} active={state.active} onPress={() => {void onConnect();}}/>
      </View>
    </View>
    <View testID="camera-body" style={[styles.body, landscape && styles.bodyLandscape]}>
      <View testID="viewfinder" style={styles.finder} onLayout={event => setFinderSize(event.nativeEvent.layout)}>
        <View testID="preview-frame" style={[styles.previewFrame, previewFrame || styles.previewFallback, !previewFrame && styles.previewPending]}>
          {hasFeed && previewSlots.map((uri, slot) => uri && <Image key={slot} accessibilityLabel="相机实时取景" source={{uri}} style={[previewImageStyle, {opacity: activeSlot === slot ? 1 : 0}]} resizeMode="cover" fadeDuration={0} onLoad={() => commitPreview(slot as 0 | 1, uri)}/>)}
          {grid && hasFeed && <View pointerEvents="none" style={StyleSheet.absoluteFill} accessible={false}>
            <View style={[styles.gridV, {left: '33.33%'}]}/><View style={[styles.gridV, {left: '66.67%'}]}/>
            <View style={[styles.gridH, {top: '33.33%'}]}/><View style={[styles.gridH, {top: '66.67%'}]}/>
          </View>}
          {reference && <View pointerEvents="none" testID="reference-frame" accessibilityLabel={`构图参考 ${guide}`} style={[styles.reference, reference]}>
            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} maxFontSizeMultiplier={1.3} style={styles.referenceLabel}>{`${guide} 参考`}</Text>
          </View>}
          {hasFeed && !waiting && canAutofocus && <Pressable accessibilityRole="button" accessibilityLabel="中央自动对焦" onPress={() => camera?.focus(0)} style={styles.focusTarget}>
            <View pointerEvents="none" style={[styles.focusCorner, styles.focusCornerTL]}/><View pointerEvents="none" style={[styles.focusCorner, styles.focusCornerTR]}/>
            <View pointerEvents="none" style={[styles.focusCorner, styles.focusCornerBL]}/><View pointerEvents="none" style={[styles.focusCorner, styles.focusCornerBR]}/><View pointerEvents="none" style={styles.focusDot}/>
          </Pressable>}
          {!hasFeed && <ScrollView style={[styles.emptyViewport, {top: hudTopHeight + ui.space.lg, bottom: hudBottomHeight + ui.space.lg + (shownNotice ? 104 : 0)}]} contentContainerStyle={[styles.empty, landscape && styles.emptyStart, state.active && landscape && styles.emptyLandscape]}>
            {!state.active ? <View style={[styles.emptyCard, landscape && styles.emptyCardLandscape]}>
              <View style={[styles.emptyLead, landscape && styles.emptyLeadLandscape]}>
                <Text style={[styles.emptyTitle, landscape && styles.emptyTitleSide]}>未连接相机</Text>
                <Button mode="contained" buttonColor={ui.color.accent} textColor={ui.color.background} style={styles.flatButton} contentStyle={styles.touch} accessibilityLabel="连接相机" onPress={() => {void onConnect();}}>连接相机</Button>
                <Button textColor={ui.color.text} mode="outlined" style={styles.flatButton} accessibilityLabel="体验演示" contentStyle={styles.touch} onPress={() => camera?.demo()}>体验演示</Button>
              </View>
              <View accessibilityLabel="连接步骤" style={[styles.steps, landscape && styles.stepsLandscape]}>
                {CONNECT_STEPS.map((step, index) => <Text key={step} style={styles.step}>{index + 1}  {step}</Text>)}
              </View>
            </View> : <View style={[styles.emptyCopy, landscape && styles.emptyCopyLandscape]}><Text style={styles.emptyTitle}>等待相机取景</Text></View>}
          </ScrollView>}
          {/* HUD bands stay in the preview. Charts may cover them; the text is drawn underneath. */}
          {hasFeed && <ScopesOverlay panels={scopePanels} bounds={{...(previewFrame || finderSize), insets: {top: 0, bottom: 0, left: 0, right: 0}}} active={state.active} rotateClockwise={!landscape} sourceAspectRatio={sourceRatio}/>}
          <CameraHud state={state} buffered={buffered} motion={motionEnabled} waiting={waiting} onTopLayout={event => setHudTopHeight(event.nativeEvent.layout.height)} onBottomLayout={event => setHudBottomHeight(event.nativeEvent.layout.height)}/>
          <Animated.View pointerEvents="none" testID="shutter-flash" style={[StyleSheet.absoluteFill, styles.shutterFlash, {opacity: flash}]}/>
          {/* Bottom HUD is already inset by the gutter; keep the notice above that inset. */}
          <View pointerEvents="box-none" style={[styles.noticeSlot, {bottom: hudBottomHeight + ui.space.gutter + ui.space.sm}]}>
            <NoticeBar notice={shownNotice} onDismiss={dismissShown}/>
          </View>
          {waiting && <View pointerEvents="none" style={styles.countdown}><Text variant="displayLarge" accessibilityLiveRegion="polite">{seconds}</Text></View>}
        </View>
      </View>
      <View testID="camera-dock" style={[styles.dock, landscape && styles.dockLandscape]} onLayout={event => setDock({width: event.nativeEvent.layout.width, height: event.nativeEvent.layout.height})}>
        <View style={[styles.captureRow, landscape && styles.captureRowLandscape]}>
          <View style={styles.captureSide}>
            <CameraControl label={timerLabel} icon="timer" active={timerEnabled || panel === 'delay'} accessibilityLabel={timerA11y}
              accessibilityHint={waiting ? '取消倒计时并关闭定时' : panel === 'delay' ? '收起定时面板' : '打开定时面板'} onPress={toggleTimer}/>
            <CameraControl label={audioLabel} icon={audio ? 'mic' : 'muted'} active={audio} checked={audio} accessibilityLabel={audioLabel} onPress={() => {void toggleAudio();}}/>
          </View>
          <Pressable testID="shutter" accessibilityRole="button" accessibilityLabel={captureLabel} accessibilityState={{disabled}} onPress={fire} style={[styles.shutter, disabled && styles.shutterDisabled]}><View style={[styles.shutterCore, waiting && styles.shutterCounting]}/></Pressable>
          <View style={styles.captureSide}>
            <CameraControl label={guideLabel} icon="ratio" accessibilityLabel={guide === 'off' ? '构图参考 关' : `构图参考 ${guide}`} accessibilityHint="只叠加参考线，不改变预览和照片" onPress={() => setGuide(nextGuide)}/>
            <CameraControl label="相册" icon="album" thumbnail={latestPhoto} accessibilityLabel="打开相册" onPress={() => {cancelCountdown(); setPanel(null); onAlbum();}}/>
          </View>
        </View>
        <View testID="camera-modes" accessibilityRole="radiogroup" style={[styles.modes, landscape && styles.modesLandscape]}>
          <Pressable accessibilityRole="radio" accessibilityLabel="普通照片" accessibilityHint="下载本次原片并将所选 LUT 保存到 App 相册" accessibilityState={{checked: !motionEnabled}} onPress={() => setMotionEnabled(false)} style={[styles.mode, !motionEnabled && styles.modeSelected]}><CameraIcon name="photo" active={!motionEnabled}/><Text style={[styles.modeLabel, !motionEnabled && styles.activeLabel]}>照片</Text></Pressable>
          <Pressable accessibilityRole="radio" accessibilityLabel="动态照片" accessibilityHint="保存快门前约三秒动态与原片" accessibilityState={{checked: motionEnabled}} onPress={() => setMotionEnabled(true)} style={[styles.mode, motionEnabled && styles.modeSelected]}><CameraIcon name="motion" active={motionEnabled}/><Text style={[styles.modeLabel, motionEnabled && styles.activeLabel]}>动态</Text></Pressable>
        </View>
      </View>
    </View>
    {panel === 'lut' && <LutFlyout luts={luts} activeName={state.lut} disabled={working || state.busy} landscape={landscape} rail={rail}
      onSelect={chooseLut} onImport={async () => {setWorking(true); try {await onImportLut();} finally {setWorking(false);}}} onRefresh={() => {void onRefresh();}} onClose={() => setPanel(null)}/>}
    {panel === 'focus' && canManualFocus && <FocusFlyout landscape={landscape} rail={rail} disabled={state.busy || waiting}
      onFocus={direction => camera?.focus(direction)} onClose={() => setPanel(null)}/>}
    {panel === 'delay' && <TimerFlyout landscape={landscape} dock={dock} railWidth={rail.width} selected={timerEnabled ? delay : null} onSelect={selectDelay} onClose={() => setPanel(null)}/>}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  screen: {flex: 1, minHeight: 0, backgroundColor: ui.color.background},
  root: {flex: 1, minHeight: 0, backgroundColor: ui.color.background}, rootLandscape: {flexDirection: 'row'},
  toolsRail: {minHeight: 64, paddingHorizontal: ui.space.gutter, paddingVertical: ui.space.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  toolsRailLandscape: {width: 64, paddingHorizontal: ui.space.sm, paddingVertical: ui.space.gutter, flexDirection: 'column'},
  viewTools: {flexDirection: 'row', gap: ui.space.sm}, viewToolsLandscape: {flexDirection: 'column'},
  railEnd: {flexDirection: 'row', alignItems: 'center', gap: ui.space.sm}, railEndLandscape: {flexDirection: 'column'},
  body: {flex: 1, minHeight: 0, minWidth: 0}, bodyLandscape: {flexDirection: 'row'},
  finder: {flex: 1, minHeight: 0, minWidth: 0, alignItems: 'center', justifyContent: 'center', overflow: 'hidden'},
  previewFrame: {position: 'relative', overflow: 'hidden', backgroundColor: ui.color.surface}, previewFallback: {width: '100%', height: '100%'}, previewPending: {opacity: 0},
  emptyViewport: {...StyleSheet.absoluteFillObject},
  empty: {flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: ui.space.sm, paddingHorizontal: ui.space.gutter},
  emptyStart: {justifyContent: 'flex-start', paddingVertical: ui.space.md},
  emptyLandscape: {flexDirection: 'row', gap: ui.space.lg}, emptyCopy: {alignItems: 'center', gap: ui.space.sm}, emptyCopyLandscape: {flexShrink: 1, alignItems: 'flex-start'},
  emptyCard: {width: '100%', maxWidth: 360, alignItems: 'stretch', gap: ui.space.sm},
  emptyCardLandscape: {maxWidth: 680, flexDirection: 'row', alignItems: 'flex-start', gap: ui.space.lg},
  emptyLead: {width: '100%', gap: ui.space.sm},
  emptyLeadLandscape: {flex: 1, width: undefined, minWidth: 0},
  emptyTitle: {...ui.type.title, color: ui.color.text, textAlign: 'center'},
  emptyTitleSide: {textAlign: 'left'},
  flatButton: {elevation: 0},
  steps: {gap: ui.space.xs, marginTop: ui.space.xs},
  stepsLandscape: {flex: 1, minWidth: 0, marginTop: 0},
  step: {...ui.type.body, flexShrink: 1, color: ui.color.muted},
  touch: {minHeight: ui.icon.touch},
  gridV: {position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: '#D8DEC880'}, gridH: {position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: '#D8DEC880'},
  reference: {position: 'absolute', borderWidth: 1, borderColor: ui.color.accent, backgroundColor: 'transparent'},
  referenceLabel: {...ui.type.label, position: 'absolute', left: ui.space.sm, right: ui.space.sm, top: ui.space.xs, color: ui.color.accent, textShadowColor: '#000000CC', textShadowOffset: {width: 0, height: 1}, textShadowRadius: 3},
  shutterFlash: {zIndex: 2, backgroundColor: '#FFFFFF'},
  focusTarget: {position: 'absolute', left: '50%', top: '50%', width: 64, height: 64, marginLeft: -32, marginTop: -32}, focusCorner: {position: 'absolute', width: 16, height: 16, borderColor: ui.color.accent},
  focusCornerTL: {left: 0, top: 0, borderLeftWidth: ui.icon.stroke, borderTopWidth: ui.icon.stroke}, focusCornerTR: {right: 0, top: 0, borderRightWidth: ui.icon.stroke, borderTopWidth: ui.icon.stroke}, focusCornerBL: {left: 0, bottom: 0, borderLeftWidth: ui.icon.stroke, borderBottomWidth: ui.icon.stroke}, focusCornerBR: {right: 0, bottom: 0, borderRightWidth: ui.icon.stroke, borderBottomWidth: ui.icon.stroke}, focusDot: {position: 'absolute', left: 30, top: 30, width: 4, height: 4, borderRadius: 2, backgroundColor: ui.color.accent},
  noticeSlot: {position: 'absolute', zIndex: 1080, left: ui.space.gutter, right: ui.space.gutter},
  countdown: {...StyleSheet.absoluteFillObject, zIndex: 1100, alignItems: 'center', justifyContent: 'center'},
  dock: {padding: ui.space.gutter, gap: ui.space.sm}, dockLandscape: {width: 120, paddingHorizontal: ui.space.sm, paddingVertical: ui.space.sm},
  captureRow: {minHeight: 80, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}, captureRowLandscape: {flex: 1, flexDirection: 'column', gap: ui.space.sm}, captureSide: {flexDirection: 'row'},
  shutter: {width: 76, height: 76, flexShrink: 0, borderRadius: 38, borderWidth: 2, borderColor: ui.color.text, alignItems: 'center', justifyContent: 'center'}, shutterCore: {width: 64, height: 64, borderRadius: 32, backgroundColor: ui.color.text}, shutterDisabled: {opacity: .45}, shutterCounting: {width: 24, height: 24, borderRadius: ui.radius.small, backgroundColor: ui.color.accent},
  modes: {width: 208, alignSelf: 'center', flexDirection: 'row', padding: ui.space.xs, backgroundColor: ui.color.surface, borderRadius: ui.radius.control}, modesLandscape: {width: '100%'},
  mode: {flex: 1, minHeight: ui.icon.touch, alignItems: 'center', justifyContent: 'center', borderRadius: ui.radius.small, gap: ui.space.xs}, modeSelected: {backgroundColor: ui.color.selected}, modeLabel: {...ui.type.label, color: ui.color.muted}, activeLabel: {color: ui.color.accent},
});
