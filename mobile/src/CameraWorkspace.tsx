import React, {useEffect, useMemo, useRef, useState} from 'react';
import {Image, Pressable, ScrollView, StyleSheet, useWindowDimensions, View} from 'react-native';
import {Button, Text} from 'react-native-paper';
import {camera, CameraState, LutItem} from './native';
import {ui} from './theme';
import CameraIcon from './CameraIcon';
import CameraControl from './CameraControl';
import CameraSheet from './CameraSheet';
import useCaptureCountdown from './useCaptureCountdown';
import {requestMicrophonePermission} from './microphonePermission';
import ScopeToolbar from './scopes/ScopeToolbar';
import ScopesOverlay from './scopes/ScopesOverlay';
import {useScopePanels} from './scopes/useScopes';
import ExperimentalWifiBadge from './connection/ExperimentalWifiBadge';
import LutPresetList, {lutDisplayName} from './LutPresetList';

type Panel = 'lut' | 'delay' | null;
type Props = {
  onAlbum: () => void; latestPhoto?: string;
  state: CameraState; preview?: string; buffered: number; luts: LutItem[];
  onLut: (id: string) => Promise<void>; onImportLut: () => Promise<void>;
  onRefresh: () => Promise<void>; onConnect: () => Promise<void>;
};
type PreviewSlots = [string | undefined, string | undefined];

export default function CameraWorkspace({onAlbum, state, preview, buffered, luts, onLut, onImportLut, onRefresh, onConnect, latestPhoto}: Props) {
  const {width, height} = useWindowDimensions();
  const landscape = width > height;
  const scopePanels = useScopePanels();
  const [panel, setPanel] = useState<Panel>(null);
  const [grid, setGrid] = useState(true);
  const [audio, setAudio] = useState(!!state.audio);
  const audioPending = useRef(false);
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [timerEnabled, setTimerEnabled] = useState(false);
  const [ratioMode, setRatioMode] = useState<'3:2' | '16:9'>('3:2');
  const [delay, setDelay] = useState(10);
  const [working, setWorking] = useState(false);
  const [finderSize, setFinderSize] = useState({width: 0, height: 0});
  const [workspaceSize, setWorkspaceSize] = useState({width: 0, height: 0});
  const [previewSlots, setPreviewSlots] = useState<PreviewSlots>([undefined, undefined]);
  const [activeSlot, setActiveSlot] = useState(0);
  const activeSlotRef = useRef(0);
  const pendingSlotRef = useRef<number | null>(null);
  const slotUrisRef = useRef<PreviewSlots>([undefined, undefined]);
  const [hudTopHeight, setHudTopHeight] = useState(64);
  const [hudBottomHeight, setHudBottomHeight] = useState(88);
  const hasFeed = !!preview && state.active;
  const {waiting, seconds, start: startCountdown, cancel: cancelCountdown} = useCaptureCountdown(captureNow, state.active && !state.busy);
  const sourceRatio = ratioMode === '3:2' ? 1.5 : 16 / 9;
  const previewRatio = landscape ? sourceRatio : 1 / sourceRatio;
  const previewFrame = useMemo(() => {
    if (!finderSize.width || !finderSize.height) return null;
    const frameWidth = Math.min(finderSize.width, finderSize.height * previewRatio);
    return {width: frameWidth, height: frameWidth / previewRatio};
  }, [finderSize, previewRatio]);
  const previewImageStyle = previewFrame && !landscape ? {
    position: 'absolute' as const,
    width: previewFrame.height,
    height: previewFrame.width,
    left: (previewFrame.width - previewFrame.height) / 2,
    top: (previewFrame.height - previewFrame.width) / 2,
    transform: [{rotate: '90deg'}],
  } : StyleSheet.absoluteFillObject;

  useEffect(() => { if (state.audio !== undefined) setAudio(state.audio); }, [state.audio]);
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

  function captureNow() {
    if (!state.active || state.busy || (motionEnabled && !state.ready)) return;
    if (motionEnabled) { if (state.ready) camera?.capture(); }
    else camera?.captureStill();
  }
  const fire = () => {
    if (waiting) { cancelCountdown(); return; }
    if (!state.active || state.busy || (motionEnabled && !state.ready)) return;
    if (timerEnabled) { startCountdown(delay); return; }
    captureNow();
  };
  const chooseLut = async (id: string) => { setWorking(true); try { await onLut(id); } finally { setWorking(false); } };
  const toggleTimer = () => {
    if (waiting) {cancelCountdown(); setTimerEnabled(false); return;}
    if (timerEnabled) setPanel('delay'); else setTimerEnabled(true);
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
  const disabled = !waiting && (!state.active || state.busy || (motionEnabled && !state.ready));
  const canAutofocus = state.transport !== 'wifi' || !!state.autofocus;
  const connectionLabel = state.active ? state.demo ? '演示' : state.transport === 'wifi' ? 'Wi-Fi' : 'USB' : '连接';
  const commitPreview = (slot: 0 | 1, uri: string) => {
    if (pendingSlotRef.current !== slot || slotUrisRef.current[slot] !== uri) return;
    activeSlotRef.current = slot; pendingSlotRef.current = null; setActiveSlot(slot);
  };

  return <View style={styles.screen} onLayout={event => setWorkspaceSize(event.nativeEvent.layout)}>
    <View style={[styles.root, landscape && styles.rootLandscape, landscape && workspaceSize.width > 0 && {width: Math.min(workspaceSize.width, workspaceSize.height * sourceRatio + 184), alignSelf: 'center'}]} testID="camera-workspace">
    <View style={[styles.toolsRail, landscape && styles.toolsRailLandscape]} testID="camera-tools">
      <View style={[styles.viewTools, landscape && styles.viewToolsLandscape]}>
        <CameraControl label="网格" accessibilityLabel="构图网格" icon="grid" active={grid} checked={grid} onPress={() => setGrid(value => !value)}/>
        <CameraControl label="LUT" accessibilityLabel="LUT 风格" icon="lut" active={!!state.lut} onPress={() => setPanel('lut')}/>
        <ScopeToolbar panels={scopePanels} landscape={landscape}/>
      </View>
      <CameraControl label={connectionLabel} accessibilityLabel="相机连接"
        accessibilityHint={`${state.active ? connectionLabel + '已连接' : '相机未连接'}，点按选择 USB、Wi-Fi（实验）或演示`}
        icon={state.active ? state.demo ? 'demo' : state.transport === 'wifi' ? 'wifi' : 'usb' : 'disconnected'} active={state.active} onPress={() => {void onConnect();}}/>
    </View>
    <View testID="camera-body" style={[styles.body, landscape && styles.bodyLandscape]}>
      <View testID="viewfinder" style={styles.finder} onLayout={event => setFinderSize(event.nativeEvent.layout)}>
        <View testID="preview-frame" style={[styles.previewFrame, previewFrame || styles.previewFallback, !previewFrame && styles.previewPending]}>
          {hasFeed && previewSlots.map((uri, slot) => uri && <Image key={slot} accessibilityLabel="相机实时取景" source={{uri}} style={[previewImageStyle, {opacity: activeSlot === slot ? 1 : 0}]} resizeMode="cover" fadeDuration={0} onLoad={() => commitPreview(slot as 0 | 1, uri)}/>)}
          {grid && hasFeed && <View pointerEvents="none" style={StyleSheet.absoluteFill} accessible={false}>
            <View style={[styles.gridV, {left: '33.33%'}]}/><View style={[styles.gridV, {left: '66.67%'}]}/>
            <View style={[styles.gridH, {top: '33.33%'}]}/><View style={[styles.gridH, {top: '66.67%'}]}/>
          </View>}
          {hasFeed && !waiting && canAutofocus && <Pressable accessibilityRole="button" accessibilityLabel="中央自动对焦" onPress={() => camera?.focus(0)} style={styles.focusTarget}>
            <View pointerEvents="none" style={[styles.focusCorner, styles.focusCornerTL]}/><View pointerEvents="none" style={[styles.focusCorner, styles.focusCornerTR]}/>
            <View pointerEvents="none" style={[styles.focusCorner, styles.focusCornerBL]}/><View pointerEvents="none" style={[styles.focusCorner, styles.focusCornerBR]}/><View pointerEvents="none" style={styles.focusDot}/>
          </Pressable>}
          {!hasFeed && <ScrollView style={[styles.emptyViewport, {top: hudTopHeight + ui.space.lg, bottom: hudBottomHeight + ui.space.lg}]} contentContainerStyle={[styles.empty, landscape && styles.emptyLandscape]}>
            <View style={[styles.emptyCopy, landscape && styles.emptyCopyLandscape]}><Text style={styles.emptyTitle}>等待相机取景</Text></View>
            <Button textColor={ui.color.text} mode="outlined" accessibilityLabel="体验演示" contentStyle={styles.touch} onPress={() => camera?.demo()}>体验演示</Button>
          </ScrollView>}
          {hasFeed && <ScopesOverlay panels={scopePanels} bounds={{...(previewFrame || finderSize), insets: {top: hudTopHeight + ui.space.lg, bottom: hudBottomHeight + ui.space.lg, left: ui.space.gutter, right: ui.space.gutter}}} active={state.active} rotateClockwise={!landscape} sourceAspectRatio={sourceRatio}/>}
          <View pointerEvents="none" testID="hud-top" style={styles.hudTop} onLayout={event => setHudTopHeight(event.nativeEvent.layout.height)}>
            <ExperimentalWifiBadge state={state}/><View style={styles.hudStatusRow}>{state.demo && <Text style={styles.hud}>DEMO</Text>}{state.lut && <Text numberOfLines={1} style={[styles.hud, styles.lutBadge]}>{lutDisplayName(state.lut)}</Text>}<View style={styles.hudSpacer}/></View>
          </View>
          <View pointerEvents="box-none" testID="hud-bottom" style={styles.hudBottom} onLayout={event => setHudBottomHeight(event.nativeEvent.layout.height)}>
            <View pointerEvents="none" style={styles.hudBadgeRow}>{motionEnabled && <Text style={styles.hud}>{buffered.toFixed(1)}s</Text>}<View style={styles.hudSpacer}/></View>
          </View>
          {waiting && <View pointerEvents="none" style={styles.countdown}><Text variant="displayLarge" accessibilityLiveRegion="polite">{seconds}</Text></View>}
        </View>
      </View>
      <View testID="camera-dock" style={[styles.dock, landscape && styles.dockLandscape]}>
        <View style={[styles.captureRow, landscape && styles.captureRowLandscape]}>
          <View style={styles.captureSide}>
            <CameraControl label={waiting ? '取消' : timerEnabled ? `${delay}秒` : '定时'} icon="timer" active={timerEnabled} accessibilityLabel="定时"
              accessibilityHint={waiting ? '取消倒计时并关闭定时' : timerEnabled ? '已开启，点按选择延时或关闭' : '启用定时，长按选择延时'} onPress={toggleTimer} onLongPress={() => {cancelCountdown(); setPanel('delay');}}/>
            <CameraControl label="环境声" icon={audio ? 'mic' : 'muted'} active={audio} checked={audio} accessibilityLabel="环境声" onPress={() => {void toggleAudio();}}/>
          </View>
          <Pressable testID="shutter" accessibilityRole="button" accessibilityLabel={captureLabel} accessibilityState={{disabled}} disabled={disabled} onPress={fire} style={[styles.shutter, disabled && styles.shutterDisabled]}><View style={[styles.shutterCore, waiting && styles.shutterCounting]}/></Pressable>
          <View style={styles.captureSide}>
            <CameraControl label={ratioMode} icon="ratio" accessibilityLabel={`画幅 ${ratioMode}`} accessibilityHint="在 3:2 与 16:9 之间切换" onPress={() => setRatioMode(value => value === '3:2' ? '16:9' : '3:2')}/>
            <CameraControl label="相册" icon="album" thumbnail={latestPhoto} accessibilityLabel="打开相册" onPress={() => {cancelCountdown(); onAlbum();}}/>
          </View>
        </View>
        <View testID="camera-modes" accessibilityRole="radiogroup" style={[styles.modes, landscape && styles.modesLandscape]}>
          <Pressable accessibilityRole="radio" accessibilityLabel="普通照片" accessibilityHint="下载本次原片并将所选 LUT 保存到 App 相册" accessibilityState={{checked: !motionEnabled}} onPress={() => setMotionEnabled(false)} style={[styles.mode, !motionEnabled && styles.modeSelected]}><CameraIcon name="photo" active={!motionEnabled}/><Text style={[styles.modeLabel, !motionEnabled && styles.activeLabel]}>照片</Text></Pressable>
          <Pressable accessibilityRole="radio" accessibilityLabel="动态照片" accessibilityHint="保存快门前约三秒动态与原片" accessibilityState={{checked: motionEnabled}} onPress={() => setMotionEnabled(true)} style={[styles.mode, motionEnabled && styles.modeSelected]}><CameraIcon name="motion" active={motionEnabled}/><Text style={[styles.modeLabel, motionEnabled && styles.activeLabel]}>动态</Text></Pressable>
        </View>
      </View>
    </View>
    <CameraSheet visible={panel !== null} title={panel === 'lut' ? 'LUT 风格' : '快门延时'} onClose={() => setPanel(null)}
      actions={panel === 'lut' && <><CameraControl icon="import" accessibilityLabel="导入 LUT" disabled={working || state.busy} onPress={async () => {setWorking(true); try {await onImportLut();} finally {setWorking(false);}}}/><CameraControl icon="refresh" accessibilityLabel="刷新 LUT" disabled={working} onPress={() => {void onRefresh();}}/></>}>
      {panel === 'delay' && <View style={styles.options}>
        <Button textColor={timerEnabled ? ui.color.text : ui.color.accent} contentStyle={styles.touch} accessibilityLabel="关闭定时" mode={!timerEnabled ? 'contained-tonal' : 'outlined'} onPress={() => {cancelCountdown(); setTimerEnabled(false); setPanel(null);}}>关闭</Button>
        {[2, 5, 10, 30].map(value => <Button key={value} textColor={timerEnabled && delay === value ? ui.color.accent : ui.color.text} contentStyle={styles.touch} accessibilityLabel={`延时 ${value} 秒`} accessibilityState={{selected: timerEnabled && delay === value}} mode={timerEnabled && delay === value ? 'contained-tonal' : 'outlined'} onPress={() => {cancelCountdown(); setDelay(value); setTimerEnabled(true); setPanel(null);}}>{value}秒</Button>)}
      </View>}
      {panel === 'lut' && <><LutPresetList luts={luts} activeName={state.lut} disabled={working || state.busy} onSelect={chooseLut}/>{!luts.length && <Text style={styles.muted}>导入 .cube 或 .zip 文件</Text>}</>}
    </CameraSheet>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  screen: {flex: 1, minHeight: 0, backgroundColor: ui.color.background},
  root: {flex: 1, minHeight: 0, backgroundColor: ui.color.background}, rootLandscape: {flexDirection: 'row'},
  toolsRail: {minHeight: 64, paddingHorizontal: ui.space.gutter, paddingVertical: ui.space.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  toolsRailLandscape: {width: 64, paddingHorizontal: ui.space.sm, paddingVertical: ui.space.gutter, flexDirection: 'column'},
  viewTools: {flexDirection: 'row', gap: ui.space.sm}, viewToolsLandscape: {flexDirection: 'column'},
  body: {flex: 1, minHeight: 0, minWidth: 0}, bodyLandscape: {flexDirection: 'row'},
  finder: {flex: 1, minHeight: 0, minWidth: 0, alignItems: 'center', justifyContent: 'center', overflow: 'hidden'},
  previewFrame: {position: 'relative', overflow: 'hidden', backgroundColor: ui.color.surface}, previewFallback: {width: '100%', height: '100%'}, previewPending: {opacity: 0},
  emptyViewport: {...StyleSheet.absoluteFillObject},
  empty: {flexGrow: 1, alignItems: 'center', justifyContent: 'center', gap: ui.space.sm, paddingHorizontal: ui.space.gutter},
  emptyLandscape: {flexDirection: 'row', gap: ui.space.lg}, emptyCopy: {alignItems: 'center', gap: ui.space.sm}, emptyCopyLandscape: {flexShrink: 1, alignItems: 'flex-start'},
  emptyTitle: {...ui.type.title}, muted: {...ui.type.body, color: ui.color.muted}, touch: {minHeight: ui.icon.touch},
  gridV: {position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: '#D8DEC880'}, gridH: {position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: '#D8DEC880'},
  hud: {...ui.type.label, paddingHorizontal: ui.space.sm, paddingVertical: ui.space.xs, borderRadius: ui.space.xs, backgroundColor: ui.color.badge, color: ui.color.text, fontVariant: ['tabular-nums']},
  hudTop: {position: 'absolute', zIndex: 1000, top: ui.space.gutter, left: ui.space.gutter, right: ui.space.gutter, gap: ui.space.xs},
  hudStatusRow: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: ui.space.xs}, lutBadge: {maxWidth: '35%', flexShrink: 1}, hudSpacer: {flexGrow: 1}, scopeSource: {alignSelf: 'flex-start', color: ui.color.muted},
  hudBottom: {position: 'absolute', zIndex: 1000, bottom: ui.space.gutter, left: ui.space.gutter, right: ui.space.gutter, gap: ui.space.sm},
  hudBadgeRow: {flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: ui.space.xs},
  focusTarget: {position: 'absolute', left: '50%', top: '50%', width: 64, height: 64, marginLeft: -32, marginTop: -32}, focusCorner: {position: 'absolute', width: 16, height: 16, borderColor: ui.color.accent},
  focusCornerTL: {left: 0, top: 0, borderLeftWidth: ui.icon.stroke, borderTopWidth: ui.icon.stroke}, focusCornerTR: {right: 0, top: 0, borderRightWidth: ui.icon.stroke, borderTopWidth: ui.icon.stroke}, focusCornerBL: {left: 0, bottom: 0, borderLeftWidth: ui.icon.stroke, borderBottomWidth: ui.icon.stroke}, focusCornerBR: {right: 0, bottom: 0, borderRightWidth: ui.icon.stroke, borderBottomWidth: ui.icon.stroke}, focusDot: {position: 'absolute', left: 30, top: 30, width: 4, height: 4, borderRadius: 2, backgroundColor: ui.color.accent},
  countdown: {...StyleSheet.absoluteFillObject, zIndex: 1100, alignItems: 'center', justifyContent: 'center'},
  dock: {padding: ui.space.gutter, gap: ui.space.sm}, dockLandscape: {width: 120, paddingHorizontal: ui.space.sm, paddingVertical: ui.space.sm},
  captureRow: {minHeight: 80, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}, captureRowLandscape: {flex: 1, flexDirection: 'column', gap: ui.space.sm}, captureSide: {flexDirection: 'row'},
  shutter: {width: 76, height: 76, flexShrink: 0, borderRadius: 38, borderWidth: 2, borderColor: ui.color.text, alignItems: 'center', justifyContent: 'center'}, shutterCore: {width: 64, height: 64, borderRadius: 32, backgroundColor: ui.color.text}, shutterDisabled: {opacity: .45}, shutterCounting: {width: 24, height: 24, borderRadius: ui.radius.small, backgroundColor: ui.color.accent},
  modes: {width: 208, alignSelf: 'center', flexDirection: 'row', padding: ui.space.xs, backgroundColor: ui.color.surface, borderRadius: ui.radius.control}, modesLandscape: {width: '100%'},
  mode: {flex: 1, minHeight: ui.icon.touch, alignItems: 'center', justifyContent: 'center', borderRadius: ui.radius.small, gap: ui.space.xs}, modeSelected: {backgroundColor: ui.color.selected}, modeLabel: {...ui.type.label, color: ui.color.muted}, activeLabel: {color: ui.color.accent}, options: {flexDirection: 'row', flexWrap: 'wrap', gap: ui.space.sm},
});
