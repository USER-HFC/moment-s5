import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {AccessibilityInfo, Animated, BackHandler, Easing, Image, Pressable, ScrollView, StyleSheet, useWindowDimensions, Vibration, View} from 'react-native';
import {Images, Play, Settings, Unplug, Usb, Wifi} from 'lucide-react-native';
import {Button, cn, color, Icon, Presence, PressableMotion, RoundButton, Text} from './ui';
import {focusDirection} from './focusDirection';
import {camera, cameraEvents, CameraState, LutItem} from './native';
import useShootingPreferences from './useShootingPreferences';
import {VOLUME_SHUTTER_EVENT} from './volumeShutter';
import {connectSteps} from './platformText';
import useCaptureCountdown from './useCaptureCountdown';
import {openMicrophoneSettings, requestMicrophonePermission} from './microphonePermission';
import ConfirmDialog from './ConfirmDialog';
import ScopesOverlay from './scopes/ScopesOverlay';
import {changeScopePanel, resetScopeRevealHint, scopesSupported, useScopePanels} from './scopes/useScopes';
import LutFlyout from './LutFlyout';
import CaptureDrawer, {DrawerOption, DrawerToggle} from './CaptureDrawer';
import CountdownOverlay from './CountdownOverlay';
import ShutterButton from './ShutterButton';
import CameraHud from './hud/CameraHud';
import NoticeBar, {Notice} from './NoticeBar';
import {Guide, guideRect, shadeOutside} from './referenceFrame';
import useRememberedCapture from './useRememberedCapture';
import {LOW_STORAGE_REASON, shutterBlockedReason} from './shutterReason';
import {connectionControlLabel, connectionPill} from './cameraLabel';

const SHUTTER_FLASH_MS = 140;
const EXIT_CONFIRM_MS = 2000;

/** The LUT panel floats over the picture; everything else lives in the drawer under it. */
type Panel = 'lut' | null;
type Props = {
  onAlbum: () => void; onSettings?: () => void; onStorage?: () => void; latestPhoto?: string;
  state: CameraState; preview?: string; buffered: number; luts: LutItem[];
  onLut: (id: string) => Promise<void>; onImportLut: () => Promise<void>;
  onRefresh: () => Promise<void>; onConnect: () => Promise<void>;
  /** Native free-space reading: below the native threshold the shutter names storage first. */
  storageLow?: boolean;
  notice?: Notice | null; onDismissNotice?: () => void;
  /** False while album, settings, the connection sheet, or the intro covers this screen. The instance stays mounted. */
  focused?: boolean;
  /** Connection sheet owns the back key while it is open. */
  suspendBack?: boolean;
};
type PreviewSlots = [string | undefined, string | undefined];

const CONNECT_STEPS = connectSteps();

export default function CameraWorkspace({onAlbum, onSettings, onStorage, state, preview, buffered, luts, onLut, onImportLut, onRefresh, onConnect, storageLow = false, latestPhoto, notice = null, onDismissNotice, focused = true, suspendBack = false}: Props) {
  const {width, height} = useWindowDimensions();
  const landscape = width > height;
  const scopePanels = useScopePanels();
  const [panel, setPanel] = useState<Panel>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [option, setOption] = useState<DrawerOption>(null);
  const {grid, setGrid, motionEnabled, setMotionEnabled, timerEnabled, setTimerEnabled, guide, setGuide, delay, setDelay} = useRememberedCapture();
  const {reverseFocus, shutterVibration} = useShootingPreferences();
  const fireRef = useRef<() => void>(() => {});
  const [audio, setAudio] = useState(!!state.audio);
  const [micPrompt, setMicPrompt] = useState(false);
  const audioPending = useRef(false);
  const [working, setWorking] = useState(false);
  const [finderSize, setFinderSize] = useState({width: 0, height: 0});
  const [previewSlots, setPreviewSlots] = useState<PreviewSlots>([undefined, undefined]);
  const [activeSlot, setActiveSlot] = useState(0);
  const [shutterHint, setShutterHint] = useState<Notice | null>(null);
  const [exitNotice, setExitNotice] = useState<Notice | null>(null);
  const exitArmed = useRef(false);
  // Updated during render so a subscription that is still registered cannot eat the key.
  const backSuspended = useRef(false);
  backSuspended.current = !focused || suspendBack;
  const flash = useRef(new Animated.Value(0)).current;
  const reduceMotion = useRef(false);
  const activeSlotRef = useRef(0);
  const pendingSlotRef = useRef<number | null>(null);
  const slotUrisRef = useRef<PreviewSlots>([undefined, undefined]);
  const [hudTopHeight, setHudTopHeight] = useState(64);
  const [hudBottomHeight, setHudBottomHeight] = useState(88);
  const hasFeed = !!preview && state.active;
  const {waiting, seconds, total, start: startCountdown, cancel: cancelCountdown} = useCaptureCountdown(captureNow, state.active && !state.busy);
  // Reference guides are an overlay. The preview and the scope crop stay on the 3:2 feed.
  const sourceRatio = 1.5;
  const previewRatio = landscape ? sourceRatio : 1 / sourceRatio;
  const previewFrame = useMemo(() => {
    if (!finderSize.width || !finderSize.height) return null;
    const frameWidth = Math.min(finderSize.width, finderSize.height * previewRatio);
    return {width: frameWidth, height: frameWidth / previewRatio};
  }, [finderSize, previewRatio]);
  const reference = guide !== 'off' && previewFrame ? guideRect(previewFrame.width, previewFrame.height, guide) : null;
  const shade = reference && previewFrame ? shadeOutside(previewFrame.width, previewFrame.height, reference) : [];
  const previewImageStyle = previewFrame && !landscape ? {
    position: 'absolute' as const,
    width: previewFrame.height,
    height: previewFrame.width,
    left: (previewFrame.width - previewFrame.height) / 2,
    top: (previewFrame.height - previewFrame.width) / 2,
    transform: [{rotate: '90deg'}],
  } : StyleSheet.absoluteFillObject;
  const shownNotice = exitNotice ?? shutterHint ?? notice;
  const dismissShown = useCallback(() => {
    if (exitNotice) { exitArmed.current = false; setExitNotice(null); return; }
    if (shutterHint) setShutterHint(null);
    else onDismissNotice?.();
  }, [exitNotice, shutterHint, onDismissNotice]);
  const onHardwareBack = useCallback(() => {
    if (backSuspended.current) return false;
    // Innermost first: an option row, then the LUT panel, then the drawer itself.
    if (option || panel || drawerOpen) {
      if (option) setOption(null); else if (panel) setPanel(null); else setDrawerOpen(false);
      exitArmed.current = false; setExitNotice(null); return true;
    }
    // Not connected and not in demo: one back leaves, and the activity teardown still disconnects.
    if (!state.active) return false;
    if (exitArmed.current) { exitArmed.current = false; setExitNotice(null); return false; }
    exitArmed.current = true;
    setExitNotice({message: '再按一次退出，相机会断开'});
    return true;
  }, [option, panel, drawerOpen, state.active]);

  useEffect(() => { if (state.audio !== undefined) setAudio(state.audio); }, [state.audio]);
  useEffect(() => {
    if (!exitNotice) return undefined;
    const timer = setTimeout(() => { exitArmed.current = false; setExitNotice(null); }, EXIT_CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [exitNotice]);
  useEffect(() => {
    if (focused && !suspendBack) return undefined;
    exitArmed.current = false;
    setExitNotice(null);
  }, [focused, suspendBack]);
  useEffect(() => {
    if (!focused || suspendBack) return undefined;
    const sub = BackHandler.addEventListener('hardwareBackPress', onHardwareBack);
    return () => sub.remove();
  }, [focused, suspendBack, onHardwareBack]);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled?.().then(value => { if (live) reduceMotion.current = value; }).catch(() => {});
    const sub = AccessibilityInfo.addEventListener?.('reduceMotionChanged', value => { reduceMotion.current = value; });
    return () => { live = false; sub?.remove(); };
  }, []);
  // A new connection starts a new reveal-hint session; the album does not (it keeps active true).
  useEffect(() => { if (!state.active) resetScopeRevealHint(); }, [state.active]);
  // Volume keys use the shutter path. The screen stays mounted, so this listens only while it is in front.
  useEffect(() => {
    if (!focused || !cameraEvents) return undefined;
    const subscription = cameraEvents.addListener(VOLUME_SHUTTER_EVENT, () => fireRef.current());
    return () => subscription.remove();
  }, [focused]);
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
    if (shutterVibration) {
      // iOS gets a light tap from the native module; Vibration there is a long buzz whatever the duration.
      try { if (camera?.haptic) camera.haptic(); else Vibration.vibrate(20); } catch { /* VIBRATE permission may be missing on forks. */ }
    }
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
  const blockedReason = waiting ? null : shutterBlockedReason({active: state.active, busy: state.busy, motion: motionEnabled, ready: state.ready, buffered, storageLow});
  const fire = () => {
    if (waiting) { cancelCountdown(); return; }
    if (blockedReason) {
      if (blockedReason === LOW_STORAGE_REASON && onStorage) setShutterHint({message: blockedReason, action: {label: '去清理', onPress: onStorage}});
      else setShutterHint({message: blockedReason});
      return;
    }
    if (timerEnabled) { startCountdown(delay); return; }
    captureNow();
  };
  fireRef.current = fire;
  const chooseLut = async (id: string) => { setWorking(true); try { await onLut(id); } finally { setWorking(false); } };
  const selectDelay = (value: number | null) => {
    cancelCountdown();
    if (value == null) setTimerEnabled(false);
    else { setDelay(value); setTimerEnabled(true); }
    setOption(null);
  };
  const selectGuide = (value: Guide) => { setGuide(value); setOption(null); };
  const toggleAudio = async () => {
    if (!camera || audioPending.current) return;
    audioPending.current = true;
    try {
      const enabled = !audio;
      if (enabled && !(await requestMicrophonePermission())) { setMicPrompt(true); return; }
      camera.setAudio(enabled); setAudio(enabled);
    } finally { audioPending.current = false; }
  };
  const goMicrophoneSettings = async () => {
    setMicPrompt(false);
    try { await openMicrophoneSettings(); }
    catch { setShutterHint({message: '无法打开系统设置，请手动允许录音权限'}); }
  };
  const captureLabel = waiting ? '取消倒计时' : motionEnabled ? '拍摄动态照片' : timerEnabled ? '开始倒计时' : '拍摄照片';
  const disabled = blockedReason != null;
  const canAutofocus = state.transport !== 'wifi' || !!state.autofocus;
  // USB ManualFocusDrive only; Wi-Fi focus values are still unverified on the S5.
  const canManualFocus = state.active && !state.demo && state.transport === 'usb';
  const connectionLabel = connectionControlLabel(state);
  const pill = connectionPill(state);
  const commitPreview = (slot: 0 | 1, uri: string) => {
    if (pendingSlotRef.current !== slot || slotUrisRef.current[slot] !== uri) return;
    activeSlotRef.current = slot; pendingSlotRef.current = null; setActiveSlot(slot);
  };

  const closeDrawer = () => { setDrawerOpen(false); setOption(null); };
  const chooseOption = (next: DrawerOption) => { setPanel(null); setOption(next); };
  const toggleDrawer = () => { if (drawerOpen) closeDrawer(); else { setPanel(null); setDrawerOpen(true); } };
  const toggleLut = () => { setOption(null); setPanel(value => value === 'lut' ? null : 'lut'); };
  const leave = (go?: () => void) => { cancelCountdown(); setPanel(null); setOption(null); go?.(); };
  const connectionIcon = !state.active ? Unplug : state.demo ? Play : state.transport === 'wifi' ? Wifi : Usb;
  const connectionHint = `${state.active ? connectionLabel + '已连接' : '相机未连接'}，点按选择 USB、Wi-Fi（实验）或演示`;

  const settingsButton = <RoundButton testID="settings-button" accessibilityLabel="设置" accessibilityHint="打开设置" size={landscape ? 44 : 36}
    onPress={() => leave(onSettings)}><Icon as={Settings} size={20}/></RoundButton>;
  const connection = landscape
    ? <RoundButton accessibilityLabel="相机连接" accessibilityHint={connectionHint} onPress={() => {void onConnect();}}>
      <Icon as={connectionIcon} size={20} color={state.active ? color.ink : color.muted}/>
    </RoundButton>
    : <PressableMotion accessibilityRole="button" accessibilityLabel="相机连接" accessibilityHint={connectionHint} onPress={() => {void onConnect();}}
      className="h-9 max-w-[70%] flex-row items-center gap-[7px] rounded-full bg-grouped px-3">
      <View className={cn('h-1.5 w-1.5 rounded-full', state.active ? 'bg-ink' : 'bg-faint')}/>
      <Text numberOfLines={1} className="shrink text-footnote font-semibold">{pill.title}</Text>
      {!!pill.detail && <Text numberOfLines={1} className="text-footnote font-medium text-muted">{pill.detail}</Text>}
    </PressableMotion>;

  const modes = <View testID="camera-modes" accessibilityRole="radiogroup" accessibilityLabel="拍摄模式"
    className={landscape ? 'flex-1 items-center justify-center gap-5' : 'flex-row items-start justify-center gap-7'}>
    {([['照片', '普通照片', '下载本次原片并将所选 LUT 保存到 App 相册', false], ['动态', '动态照片', '保存快门前约三秒动态与原片', true]] as const).map(([name, label, hint, value]) => {
      const on = motionEnabled === value;
      return <Pressable key={label} accessibilityRole="radio" accessibilityLabel={label} accessibilityHint={hint} accessibilityState={{checked: on}}
        onPress={() => setMotionEnabled(value)} hitSlop={8} className="items-center gap-[5px] px-1 py-1 active:opacity-70">
        <Text className={cn('text-[14px] leading-[18px] font-semibold', on ? 'text-ink' : 'text-muted')} style={{letterSpacing: 1.6, paddingLeft: 1.6}}>{name}</Text>
        <View className="h-1 w-1"><Presence visible={on} kind="pop" spring="bouncy" appear={false} style={styles.modeDot}><View/></Presence></View>
      </Pressable>;
    })}
  </View>;

  const drawer = <CaptureDrawer vertical={landscape} option={option} onOption={chooseOption}
    grid={grid} onGrid={() => setGrid(value => !value)}
    guide={guide} onGuide={selectGuide}
    timerEnabled={timerEnabled} delay={delay} waiting={waiting} onDelay={selectDelay} onCancelCountdown={() => {cancelCountdown(); setTimerEnabled(false);}}
    audio={audio} onAudio={() => {void toggleAudio();}}
    scopes={scopePanels} onScope={kind => changeScopePanel({type: 'toggle', kind})} canScope={scopesSupported()}
    canFocus={canManualFocus} focusDisabled={state.busy || waiting} onFocus={direction => camera?.focus(focusDirection(direction, reverseFocus))}/>;

  const shutter = <ShutterButton accessibilityLabel={captureLabel} disabled={disabled} waiting={waiting} onPress={fire}/>;
  const album = <PressableMotion feel={{scale: 0.9, dim: 0.85}} accessibilityRole="button" accessibilityLabel="打开相册" onPress={() => leave(onAlbum)}
    className="h-12 w-12 items-center justify-center overflow-hidden rounded-[10px] border border-white/15 bg-grouped">
    {latestPhoto ? <AlbumThumbnail uri={latestPhoto}/> : <Icon as={Images} size={22} color={color.muted}/>}
  </PressableMotion>;

  const finder = <View testID="camera-body" className="min-h-0 min-w-0 flex-1">
    <View testID="viewfinder" className="min-h-0 min-w-0 flex-1 items-center justify-center overflow-hidden" onLayout={event => setFinderSize(event.nativeEvent.layout)}>
      <View testID="preview-frame" style={[styles.previewFrame, previewFrame || styles.previewFallback, !previewFrame && styles.previewPending, {backgroundColor: state.active ? '#0E0E0F' : color.canvas}]}>
        {hasFeed && previewSlots.map((uri, slot) => uri && <Image key={slot} accessibilityLabel="相机实时取景" source={{uri}} style={[previewImageStyle, {opacity: activeSlot === slot ? 1 : 0}]} resizeMode="cover" fadeDuration={0} onLoad={() => commitPreview(slot as 0 | 1, uri)}/>)}
        {shade.map(band => <View key={`${band.left}-${band.top}-${band.width}-${band.height}`} pointerEvents="none" testID="reference-shade" accessible={false} style={[styles.referenceShade, band]}/>)}
        {grid && hasFeed && <View pointerEvents="none" testID="composition-grid" accessible={false} style={reference ? [styles.gridBox, reference] : StyleSheet.absoluteFill}>
          <View style={[styles.gridV, {left: '33.33%'}]}/><View style={[styles.gridV, {left: '66.67%'}]}/>
          <View style={[styles.gridH, {top: '33.33%'}]}/><View style={[styles.gridH, {top: '66.67%'}]}/>
        </View>}
        {reference && <View pointerEvents="none" testID="reference-frame" accessibilityLabel={`构图参考 ${guide}`} style={[styles.reference, reference]}>
          <Text numberOfLines={1} className="absolute left-2 top-1 text-[11px] leading-[14px] font-semibold" style={styles.ink}>{`${guide} 参考`}</Text>
        </View>}
        {hasFeed && !waiting && canAutofocus && <Pressable accessibilityRole="button" accessibilityLabel="中央自动对焦" onPress={() => camera?.focus(0)} style={styles.focusTarget}>
          <View pointerEvents="none" style={[styles.focusCorner, styles.focusCornerTL]}/><View pointerEvents="none" style={[styles.focusCorner, styles.focusCornerTR]}/>
          <View pointerEvents="none" style={[styles.focusCorner, styles.focusCornerBL]}/><View pointerEvents="none" style={[styles.focusCorner, styles.focusCornerBR]}/>
        </Pressable>}
        {!hasFeed && <ScrollView style={[StyleSheet.absoluteFill, {top: state.active ? hudTopHeight + 16 : 0, bottom: state.active ? hudBottomHeight + 16 : 0}]}
          contentContainerClassName="grow items-center justify-center px-6 py-4">
          {!state.active ? <View className={cn('w-full gap-3', landscape ? 'max-w-[620px] flex-row items-center gap-8' : 'max-w-[340px]')}>
            <View className={cn('gap-3', landscape && 'flex-1')}>
              <View className="items-center gap-1.5 pb-2">
                <Text accessibilityRole="header" className="text-title text-center">未连接相机</Text>
                <Text className="text-footnote text-center text-muted">用数据线连接 Lumix，或先体验演示</Text>
              </View>
              <Button variant="primary" size="lg" accessibilityLabel="连接相机" onPress={() => {void onConnect();}}><Text>连接相机</Text></Button>
              <Button variant="secondary" accessibilityLabel="体验演示" onPress={() => camera?.demo()}><Text>体验演示</Text></Button>
            </View>
            <View accessibilityLabel="连接步骤" className={cn('overflow-hidden rounded-card bg-grouped', landscape ? 'flex-1' : 'mt-3')}>
              {CONNECT_STEPS.map((step, index) => <View key={step} className="flex-row items-center gap-3 pl-3.5">
                <View className="h-[22px] w-[22px] items-center justify-center rounded-full bg-control">
                  <Text className="text-caption font-bold" style={{fontVariant: ['tabular-nums']}}>{index + 1}</Text>
                </View>
                <View className={cn('min-h-[46px] flex-1 justify-center pr-3.5', index < CONNECT_STEPS.length - 1 && 'border-b border-separator')}>
                  <Text className="text-[15px] leading-[20px]">{step}</Text>
                </View>
              </View>)}
            </View>
          </View> : <Text className="text-headline text-muted">等待相机取景…</Text>}
        </ScrollView>}
        {hasFeed && <ScopesOverlay panels={scopePanels} bounds={{...(previewFrame || finderSize), insets: {top: 0, bottom: 0, left: 0, right: 0}}} active={state.active} rotateClockwise={!landscape} sourceAspectRatio={sourceRatio}/>}
        <CameraHud state={state} buffered={buffered} motion={motionEnabled} waiting={waiting} onLut={toggleLut} lutOpen={panel === 'lut'}
          onTopLayout={event => setHudTopHeight(event.nativeEvent.layout.height)} onBottomLayout={event => setHudBottomHeight(event.nativeEvent.layout.height)}/>
        <Animated.View pointerEvents="none" testID="shutter-flash" style={[StyleSheet.absoluteFill, styles.shutterFlash, {opacity: flash}]}/>
        <View pointerEvents="box-none" style={[styles.noticeSlot, {bottom: hudBottomHeight + 20}]}>
          <NoticeBar notice={shownNotice} onDismiss={dismissShown}/>
        </View>
        {waiting && <CountdownOverlay seconds={seconds} total={total}/>}
        {<LutFlyout visible={panel === 'lut'} luts={luts} activeName={state.lut} disabled={working || state.busy} landscape={landscape} bottomInset={hudBottomHeight + 20}
          onSelect={chooseLut} onImport={async () => {setWorking(true); try {await onImportLut();} finally {setWorking(false);}}} onRefresh={() => {void onRefresh();}} onClose={() => setPanel(null)}/>}
      </View>
    </View>
  </View>;

  // Modes and the drawer cross-fade in the same slot. Each is a Presence: the one leaving stops
  // taking touches at once (beta.7 lost taps to an invisible exiting copy of Reanimated layout animations).
  const zoneFill = landscape ? styles.zoneFillSide : styles.zoneFill;
  const zone = <View className={landscape ? 'flex-1 self-stretch' : 'h-full w-full'}>
    <Presence visible={!drawerOpen} kind="fade" appear={false} pointerEvents="box-none" style={zoneFill}>{modes}</Presence>
    <Presence visible={drawerOpen} kind={landscape ? 'push' : 'rise'} distance={landscape ? 18 : 14} spring="smooth" pointerEvents="box-none" style={zoneFill}>{drawer}</Presence>
  </View>;

  return <View testID="camera-workspace" className="flex-1 bg-canvas">
    {landscape ? <View className="flex-1 flex-row">
      <View testID="camera-tools" className="w-[72px] items-center justify-between py-4">{connection}{settingsButton}</View>
      {finder}
      <View testID="camera-drawer-zone" className="w-[92px] items-center self-stretch py-3">{zone}</View>
      <View testID="camera-dock" className="w-[96px] items-center justify-between py-4"><DrawerToggle open={drawerOpen} onPress={toggleDrawer}/>{shutter}{album}</View>
    </View> : <>
      <View testID="camera-tools" className="h-14 flex-row items-center justify-between px-4">{connection}{settingsButton}</View>
      {finder}
      <View testID="camera-drawer-zone" className="h-[92px] w-full items-center justify-center">{zone}</View>
      <View testID="camera-dock" className="h-[104px] flex-row items-center justify-between px-10">{album}{shutter}<DrawerToggle open={drawerOpen} onPress={toggleDrawer}/></View>
    </>}
    {micPrompt && <ConfirmDialog visible testID="microphone-confirm" confirmTestID="microphone-confirm-settings"
      title="开启收音" body="没有麦克风权限。请在系统设置里允许录音，再回来打开收音。" confirmLabel="去设置" cancelLabel="暂不"
      onCancel={() => setMicPrompt(false)} onConfirm={() => {void goMicrophoneSettings();}}/>}
  </View>;
}

function AlbumThumbnail({uri}: {uri: string}) {
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const seen = useRef(uri);
  useEffect(() => {
    if (seen.current === uri) return undefined;
    seen.current = uri;
    let cancel = false;
    const read = AccessibilityInfo.isReduceMotionEnabled?.();
    if (!read) return undefined;
    read.then(reduce => {
      if (cancel) return;
      if (reduce) { opacity.setValue(1); scale.setValue(1); return; }
      opacity.setValue(0); scale.setValue(0.82);
      Animated.parallel([
        Animated.timing(opacity, {toValue: 1, duration: 180, useNativeDriver: true}),
        Animated.timing(scale, {toValue: 1, duration: 180, useNativeDriver: true}),
      ]).start();
    }).catch(() => { opacity.setValue(1); scale.setValue(1); });
    return () => { cancel = true; };
  }, [opacity, scale, uri]);
  return <Animated.View testID="album-thumbnail" style={[StyleSheet.absoluteFill, {opacity, transform: [{scale}]}]}>
    <Image accessible={false} source={{uri}} style={StyleSheet.absoluteFill}/>
  </Animated.View>;
}

const hairline = StyleSheet.hairlineWidth;
const styles = StyleSheet.create({
  modeDot: {width: 4, height: 4, borderRadius: 2, backgroundColor: color.leica},
  zoneFill: {...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center'},
  zoneFillSide: {...StyleSheet.absoluteFillObject, alignItems: 'center'},
  previewFrame: {position: 'relative', overflow: 'hidden'}, previewFallback: {width: '100%', height: '100%'}, previewPending: {opacity: 0},
  gridBox: {position: 'absolute'},
  gridV: {position: 'absolute', top: 0, bottom: 0, width: hairline, backgroundColor: 'rgba(255,255,255,0.32)'},
  gridH: {position: 'absolute', left: 0, right: 0, height: hairline, backgroundColor: 'rgba(255,255,255,0.32)'},
  // Outside the guide only, light enough that the picture is still visible.
  referenceShade: {position: 'absolute', backgroundColor: '#00000073'},
  reference: {position: 'absolute', borderWidth: 1, borderColor: color.ink, backgroundColor: 'transparent'},
  ink: {textShadowColor: '#000000CC', textShadowOffset: {width: 0, height: 1}, textShadowRadius: 3},
  shutterFlash: {zIndex: 2, backgroundColor: '#FFFFFF'},
  focusTarget: {position: 'absolute', left: '50%', top: '50%', width: 64, height: 64, marginLeft: -32, marginTop: -32},
  focusCorner: {position: 'absolute', width: 14, height: 14, borderColor: color.ink},
  focusCornerTL: {left: 0, top: 0, borderLeftWidth: 1.5, borderTopWidth: 1.5, borderTopLeftRadius: 3},
  focusCornerTR: {right: 0, top: 0, borderRightWidth: 1.5, borderTopWidth: 1.5, borderTopRightRadius: 3},
  focusCornerBL: {left: 0, bottom: 0, borderLeftWidth: 1.5, borderBottomWidth: 1.5, borderBottomLeftRadius: 3},
  focusCornerBR: {right: 0, bottom: 0, borderRightWidth: 1.5, borderBottomWidth: 1.5, borderBottomRightRadius: 3},
  noticeSlot: {position: 'absolute', zIndex: 1080, left: 12, right: 12},
});
