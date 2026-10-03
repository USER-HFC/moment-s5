import React, {useEffect, useMemo, useRef, useState} from 'react';
import {AppState, Image, Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Button, Surface, Text} from 'react-native-paper';
import {camera, CameraState, LutItem} from './native';
import {theme} from './theme';
import CameraIcon, {CameraIconName} from './CameraIcon';

export type CameraMode = 'monitor' | 'timer' | 'motion';
type FocusMode = 'auto' | 'far' | 'near';
type Panel = 'lut' | 'delay' | null;
type Props = {
  page: CameraMode; go: (page: CameraMode | 'album' | 'home') => void;
  state: CameraState; preview?: string; buffered: number; luts: LutItem[];
  onLut: (id: string) => Promise<void>; onImportLut: () => Promise<void>;
  onRefresh: () => Promise<void>; onConnect: () => Promise<void>;
};
type PreviewSlots = [string | undefined, string | undefined];
type IconRotation = false | 'portrait' | 'landscape';

function ToolButton({label, icon, active = false, onPress, switchValue, rotateIcon = false}: {label: string; icon: CameraIconName; active?: boolean; onPress: () => void; switchValue?: boolean; rotateIcon?: IconRotation}) {
  return <Pressable
    accessibilityRole={switchValue === undefined ? 'button' : 'switch'}
    accessibilityLabel={label}
    accessibilityState={switchValue === undefined ? {selected: active} : {checked: switchValue}}
    hitSlop={6}
    onPress={onPress}
    style={({pressed}) => [styles.toolButton, rotateIcon === 'landscape' && styles.toolButtonLandscape, active && styles.toolButtonActive, pressed && styles.toolButtonPressed]}>
    <View style={styles.iconVisual}><View style={rotateIcon === 'portrait' ? styles.iconVisualPortrait : rotateIcon === 'landscape' ? styles.iconVisualLandscape : undefined}><CameraIcon name={icon} active={active} size={18}/></View><Text numberOfLines={1} style={[styles.toolLabel, active && styles.toolLabelActive]}>{label.replace('构图网格', '网格').replace('LUT 风格', 'LUT').replace('动态照片', '动态').replace('自动对焦', '自动').replace('相机连接', '连接').replace('环境声', '环境')}</Text></View>
  </Pressable>;
}

function DockButton({label, icon, iconLabel, active = false, onPress, accessibilityLabel}: {label: string; icon: CameraIconName; iconLabel?: string; active?: boolean; onPress: () => void; accessibilityLabel: string}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({pressed}) => [styles.dockIconButton, active && styles.dockIconActive, pressed && styles.toolButtonPressed]}><CameraIcon name={icon} active={active} label={iconLabel} size={18}/><Text numberOfLines={1} style={[styles.dockLabel, active && styles.dockLabelActive]}>{label}</Text></Pressable>;
}

export default function CameraWorkspace({page, go, state, preview, buffered, luts, onLut, onImportLut, onRefresh, onConnect}: Props) {
  const {width, height} = useWindowDimensions();
  const landscape = width > height;
  const [panel, setPanel] = useState<Panel>(null);
  const [grid, setGrid] = useState(true);
  const [audio, setAudio] = useState(false);
  const [motionEnabled, setMotionEnabled] = useState(page === 'motion');
  const [timerEnabled, setTimerEnabled] = useState(page === 'timer');
  const [focusMode, setFocusMode] = useState<FocusMode>('auto');
  const [ratioMode, setRatioMode] = useState<'3:2' | '16:9'>('3:2');
  const [delay, setDelay] = useState(10);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [lutPage, setLutPage] = useState(0);
  const [working, setWorking] = useState(false);
  const [captureMark, setCaptureMark] = useState(false);
  const [finderSize, setFinderSize] = useState({width: 0, height: 0});
  const [previewSlots, setPreviewSlots] = useState<PreviewSlots>([undefined, undefined]);
  const [activeSlot, setActiveSlot] = useState(0);
  const activeSlotRef = useRef(0);
  const pendingSlotRef = useRef<number | null>(null);
  const slotUrisRef = useRef<PreviewSlots>([undefined, undefined]);
  const captureMarkTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageSize = Math.max(1, Math.min(4, Math.floor((height - 250) / 56)));
  const pages = Math.max(1, Math.ceil(luts.length / pageSize));
  const currentPage = Math.min(lutPage, pages - 1);
  const waiting = deadline !== null;
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

  useEffect(() => {
    setDeadline(null); setPanel(null);
    setMotionEnabled(page === 'motion'); setTimerEnabled(page === 'timer');
  }, [page]);
  useEffect(() => { if (!state.active) setDeadline(null); }, [state.active]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', next => { if (next !== 'active') setDeadline(null); });
    return () => sub.remove();
  }, []);
  useEffect(() => () => { if (captureMarkTimer.current) clearTimeout(captureMarkTimer.current); }, []);
  useEffect(() => {
    if (deadline === null) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSeconds(left);
      if (left === 0) { setDeadline(null); captureNow(); }
    };
    const timer = setInterval(tick, 100);
    return () => clearInterval(timer);
  }, [deadline]);
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
    setCaptureMark(true);
    if (captureMarkTimer.current) clearTimeout(captureMarkTimer.current);
    captureMarkTimer.current = setTimeout(() => setCaptureMark(false), 700);
    if (motionEnabled) { if (state.ready) camera?.capture(); }
    else camera?.remoteShutter();
  }
  const fire = () => {
    if (waiting) { setDeadline(null); return; }
    if (!state.active || state.busy || (motionEnabled && !state.ready)) return;
    if (timerEnabled) { setSeconds(delay); setDeadline(Date.now() + delay * 1000); return; }
    captureNow();
  };
  const chooseLut = async (id: string) => { setWorking(true); try { await onLut(id); } finally { setWorking(false); } };
  const chooseFocus = (mode: FocusMode, direction: number) => { setFocusMode(mode); camera?.focus(direction); };
  const toggleMotion = () => setMotionEnabled(value => !value);
  const toggleTimer = () => setTimerEnabled(value => { if (value) setDeadline(null); return !value; });
  const captureLabel = waiting ? '取消倒计时' : motionEnabled ? '拍摄动态照片' : timerEnabled ? '开始倒计时' : '拍照到相机';
  const disabled = !waiting && (!state.active || state.busy || (motionEnabled && !state.ready));
  const focusLabel = focusMode === 'auto' ? 'AFS' : 'MF';
  const commitPreview = (slot: 0 | 1, uri: string) => {
    if (pendingSlotRef.current !== slot || slotUrisRef.current[slot] !== uri) return;
    activeSlotRef.current = slot; pendingSlotRef.current = null; setActiveSlot(slot);
  };

  return <View style={styles.root} testID="camera-workspace">
    <View style={[styles.toolsRail, landscape && styles.toolsRailLandscape]}>
      <ScrollView horizontal={!landscape} showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false} style={[styles.toolsViewport, landscape && styles.toolsViewportLandscape]} contentContainerStyle={[styles.tools, landscape && styles.toolsLandscape]} testID="camera-tools">
      <Pressable hitSlop={6} accessibilityRole="button" accessibilityLabel="返回首页" onPress={() => go('home')} style={[styles.toolButton, landscape && styles.toolButtonLandscape]}><View style={styles.iconVisual}><View style={landscape ? styles.iconVisualLandscape : styles.iconVisualPortrait}><CameraIcon name="back" size={18}/></View><Text style={styles.toolLabel}>返回</Text></View></Pressable>
      <ToolButton label="构图网格" icon="grid" rotateIcon={landscape ? 'landscape' : 'portrait'} active={grid} onPress={() => setGrid(value => !value)} />
      <ToolButton label="LUT 风格" icon="lut" rotateIcon={landscape ? 'landscape' : 'portrait'} active={!!state.lut} onPress={() => {setLutPage(0); setPanel('lut');}} />
      <ToolButton label="动态照片" icon="motion" rotateIcon={landscape ? 'landscape' : 'portrait'} active={motionEnabled} switchValue={motionEnabled} onPress={toggleMotion} />
      <ToolButton label="定时" icon="timer" rotateIcon={landscape ? 'landscape' : 'portrait'} active={timerEnabled} switchValue={timerEnabled} onPress={toggleTimer} />
      <ToolButton label="自动对焦" icon="focus" rotateIcon={landscape ? 'landscape' : 'portrait'} active={focusMode === 'auto'} onPress={() => chooseFocus('auto', 0)} />
      <ToolButton label="远对焦" icon="far" rotateIcon={landscape ? 'landscape' : 'portrait'} active={focusMode === 'far'} onPress={() => chooseFocus('far', -1)} />
      <ToolButton label="近对焦" icon="near" rotateIcon={landscape ? 'landscape' : 'portrait'} active={focusMode === 'near'} onPress={() => chooseFocus('near', 1)} />
      </ScrollView>
      <Pressable hitSlop={6} accessibilityRole="button" accessibilityLabel="相机连接" onPress={() => { void onConnect(); }} style={[styles.usbPinned, landscape ? styles.usbPinnedLandscape : styles.usbPinnedPortrait]}><View style={styles.iconVisual}><View style={landscape ? styles.iconVisualLandscape : styles.iconVisualPortrait}><CameraIcon name="usb" active={state.active} size={18}/></View><Text style={[styles.toolLabel, state.active && styles.toolLabelActive]}>连接</Text></View></Pressable>
    </View>
    <View testID="camera-body" style={[styles.body, landscape && styles.bodyLandscape]}>
      <View testID="viewfinder" style={[styles.finder, landscape && styles.finderLandscape]} onLayout={event => setFinderSize(event.nativeEvent.layout)}>
        <View testID="preview-frame" style={[styles.previewFrame, previewFrame || styles.previewFallback, !previewFrame && styles.previewPending]}>
          {previewSlots.map((uri, slot) => uri && <Image key={slot} accessibilityLabel="相机实时取景" source={{uri}} style={[previewImageStyle, {opacity: activeSlot === slot ? 1 : 0}]} resizeMode="cover" fadeDuration={0} onLoad={() => commitPreview(slot as 0 | 1, uri)} />)}
          {grid && <View pointerEvents="none" style={StyleSheet.absoluteFill} accessible={false}>
            <View style={[styles.gridV, {left: '33.33%'}]}/><View style={[styles.gridV, {left: '66.67%'}]}/>
            <View style={[styles.gridH, {top: '33.33%'}]}/><View style={[styles.gridH, {top: '66.67%'}]}/>
          </View>}
          <Pressable accessibilityRole="button" accessibilityLabel="中央自动对焦" hitSlop={8} onPress={() => chooseFocus('auto', 0)} style={styles.focusTarget}><View pointerEvents="none" style={[styles.focusCorner, styles.focusCornerTL]}/><View pointerEvents="none" style={[styles.focusCorner, styles.focusCornerTR]}/><View pointerEvents="none" style={[styles.focusCorner, styles.focusCornerBL]}/><View pointerEvents="none" style={[styles.focusCorner, styles.focusCornerBR]}/><View pointerEvents="none" style={styles.focusDot}/></Pressable>
          {!preview && <View style={styles.empty}><Text variant="titleMedium">等待相机取景</Text><Text style={styles.muted}>USB 连接后开始监看</Text><Button contentStyle={styles.touch} onPress={() => camera?.demo()}>体验演示</Button></View>}
          <View pointerEvents="none" style={styles.hudTopLeft}>{state.demo && <Text style={styles.hud}>DEMO</Text>}{state.lut && <Text style={[styles.hud, styles.hudAccent]}>{state.lut}</Text>}</View>
          <View pointerEvents="none" style={styles.hudTopRight}><Text style={styles.hud}>CAM 82%</Text><Text style={styles.hud}>PHONE 96%</Text></View>
          <View pointerEvents="none" style={styles.hudBottomLeft}><Text style={styles.hud}>{focusLabel}</Text></View>
          <View pointerEvents="none" style={styles.hudBottomRight}><Text style={styles.hud}>F2.8</Text><Text style={styles.hud}>1/125</Text><Text style={styles.hud}>ISO 400</Text></View>
          {waiting && <View pointerEvents="none" style={styles.countdown}><Text variant="displayLarge" accessibilityLiveRegion="polite">{seconds}</Text></View>}
          {captureMark && <View pointerEvents="none" style={styles.captureMark}><View style={styles.captureMarkCircle}><Text style={styles.captureMarkText}>✓</Text></View></View>}
          {motionEnabled && <View pointerEvents="none" style={styles.bufferBadge}><Text style={styles.hud}>{buffered.toFixed(1)}s</Text></View>}
        </View>
      </View>
      <View testID="camera-dock" style={[styles.dock, landscape && styles.dockLandscape]}>
        <View style={[styles.dockSide, landscape && styles.dockSideLandscape]}>
          <View style={[styles.dockLeft, landscape && styles.dockLeftLandscape]}>
            <DockButton label="环境" icon="mic" active={audio} accessibilityLabel="环境声" onPress={() => {setAudio(value => {camera?.setAudio(!value); return !value;});}} />
            <DockButton label="画幅" icon="ratio" iconLabel={ratioMode} accessibilityLabel={`画幅 ${ratioMode}`} onPress={() => setRatioMode(value => value === '3:2' ? '16:9' : '3:2')} />
            {timerEnabled && <DockButton label={`${delay}秒`} icon="delay" accessibilityLabel={`延时 ${delay} 秒`} onPress={() => setPanel('delay')} />}
          </View>
          <DockButton label="相册" icon="album" accessibilityLabel="打开相册" onPress={() => go('album')} />
        </View>
        <Pressable testID="shutter" accessibilityRole="button" accessibilityLabel={captureLabel} disabled={disabled} onPress={fire} style={[styles.shutter, disabled && styles.shutterDisabled]}><View style={[styles.shutterCore, waiting && styles.shutterCounting]}/></Pressable>
        <Text style={styles.dockHint} variant="labelMedium">{waiting ? `${seconds}秒` : motionEnabled ? '快门前3秒' : timerEnabled ? `${delay}秒延时` : '机身照片'}</Text>
      </View>
    </View>
    <Modal visible={panel !== null} transparent animationType="none" supportedOrientations={['portrait', 'landscape']} onRequestClose={() => setPanel(null)}>
      <SafeAreaView style={styles.scrim}>
        <Surface elevation={0} style={styles.panel} accessibilityViewIsModal>
          <View style={styles.panelHeader}><View><Text variant="labelSmall" style={styles.panelKicker}>LUMIX CONTROL</Text><Text variant="titleMedium">{panel === 'lut' ? 'LUT 风格' : '快门延时'}</Text></View><Button contentStyle={styles.touch} onPress={() => setPanel(null)}>关闭</Button></View>
          <ScrollView contentContainerStyle={styles.panelScroll} showsVerticalScrollIndicator={false}>
          {panel === 'delay' && <View style={styles.options}>{[2, 5, 10, 30].map(value => <Button key={value} compact style={styles.option} contentStyle={styles.touch} accessibilityState={{selected: delay === value}} mode={delay === value ? 'contained' : 'outlined'} onPress={() => {setDelay(value); setPanel(null);}}>{value}秒</Button>)}</View>}
          {panel === 'lut' && <>
            <View style={styles.options}><Button compact contentStyle={styles.touch} disabled={working || state.busy} onPress={() => chooseLut('off')}>原色</Button><Button compact contentStyle={styles.touch} disabled={working || state.busy} onPress={async () => {setWorking(true); try {await onImportLut();} finally {setWorking(false);}}}>导入</Button><Button compact contentStyle={styles.touch} disabled={working} onPress={onRefresh}>刷新</Button></View>
            {luts.length === 0 ? <Text style={styles.emptyLuts}>导入 LUMIX Lab 的 .cube 或 .zip 文件</Text> : luts.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(lut => <Button key={lut.id} contentStyle={styles.touch} disabled={working || state.busy} mode={state.lut === lut.name ? 'contained-tonal' : 'text'} accessibilityLabel={`选择 LUT ${lut.name}`} onPress={() => chooseLut(lut.id)}>{lut.name}</Button>)}
            <View style={styles.pagination}><Button compact contentStyle={styles.touch} disabled={currentPage === 0} onPress={() => setLutPage(currentPage - 1)}>上一页</Button><Text>{currentPage + 1} / {pages}</Text><Button compact contentStyle={styles.touch} disabled={currentPage + 1 >= pages} onPress={() => setLutPage(currentPage + 1)}>下一页</Button></View>
          </>}
          </ScrollView>
        </Surface>
      </SafeAreaView>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  root: {flex: 1, minHeight: 0, backgroundColor: '#080909'},
  toolsRail: {height: 64, position: 'relative', zIndex: 5, backgroundColor: '#080909'}, toolsRailLandscape: {position: 'absolute', top: 0, bottom: 0, left: 0, width: 72, height: 'auto', alignItems: 'center'},
  toolsViewport: {flexGrow: 0, backgroundColor: '#080909'}, toolsViewportLandscape: {position: 'relative', top: 0, bottom: 0, left: 0, width: 72, flex: 1, flexGrow: 1},
  tools: {flexDirection: 'row', alignItems: 'center', gap: 0, paddingHorizontal: 2, paddingVertical: 6, backgroundColor: '#080909'}, toolsLandscape: {minHeight: '100%', minWidth: 72, flexDirection: 'column', alignItems: 'center', gap: 0},
  toolButton: {width: 44, height: 48, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 10, borderWidth: 1, borderColor: 'transparent', backgroundColor: '#080909'}, toolButtonLandscape: {width: 48, height: 40}, iconVisual: {alignItems: 'center', justifyContent: 'center', gap: 2}, iconVisualPortrait: {transform: [{rotate: '-90deg'}]}, iconVisualLandscape: {transform: [{rotate: '-90deg'}]}, toolLabel: {fontSize: 8, lineHeight: 10, color: '#B0B9AB', textAlign: 'center'}, toolLabelActive: {color: theme.colors.primary}, usbPinned: {position: 'absolute', zIndex: 8, width: 52, height: 60, alignItems: 'center', justifyContent: 'center', borderRadius: 10, backgroundColor: '#080909'}, usbPinnedPortrait: {right: 4, top: 4}, usbPinnedLandscape: {position: 'relative', left: 0, bottom: 0, width: 48, height: 40, marginBottom: 6},
  toolButtonActive: {borderColor: 'transparent', backgroundColor: '#080909'}, toolButtonPressed: {backgroundColor: '#202321'},
  typeIcon: {fontSize: 10, fontWeight: '700', letterSpacing: .5, borderWidth: 1.5, borderRadius: 4, paddingHorizontal: 2, paddingVertical: 3},
  iconBox: {width: 22, height: 22, borderWidth: 1.5, borderRadius: 3, position: 'relative'}, iconLineV: {position: 'absolute', top: 0, bottom: 0, width: 1}, iconLineH: {position: 'absolute', left: 0, right: 0, height: 1},
  motionIcon: {width: 22, height: 16, borderWidth: 1.5, borderRadius: 3, position: 'relative'}, playTriangle: {position: 'absolute', right: -6, top: 3, width: 0, height: 0, borderTopWidth: 5, borderBottomWidth: 5, borderLeftWidth: 6, borderTopColor: 'transparent', borderBottomColor: 'transparent'}, motionTick: {position: 'absolute', top: -5, width: 1.5, height: 4},
  timerIcon: {width: 22, height: 22, borderWidth: 1.5, borderRadius: 11, position: 'relative'}, timerHand: {position: 'absolute', width: 1.5, height: 7, left: 9, top: 4}, timerHandShort: {position: 'absolute', width: 1.5, height: 6, left: 9, top: 9}, timerCap: {position: 'absolute', width: 6, height: 2, top: -4, left: 7, borderRadius: 1},
  micIcon: {width: 22, height: 24, position: 'relative', alignItems: 'center'}, micBody: {width: 9, height: 15, borderWidth: 1.5, borderRadius: 5}, micStem: {position: 'absolute', width: 1.5, height: 7, bottom: 0}, usbIcon: {width: 22, height: 24, position: 'relative'}, usbStem: {position: 'absolute', width: 1.5, height: 20, left: 10, top: 2}, usbNode: {position: 'absolute', width: 5, height: 5, borderRadius: 3},
  albumIcon: {width: 24, height: 20, borderWidth: 1.5, borderRadius: 3, position: 'relative', overflow: 'hidden'}, albumMountain: {position: 'absolute', left: 3, bottom: 2, width: 16, height: 10, borderBottomWidth: 1.5, transform: [{rotate: '-25deg'}]}, albumDot: {position: 'absolute', right: 4, top: 4, width: 3, height: 3, borderRadius: 2}, ratioIcon: {fontSize: 11, fontVariant: ['tabular-nums'], fontWeight: '700'}, focusIcon: {width: 22, height: 22, borderWidth: 1.5, borderRadius: 3, alignItems: 'center', justifyContent: 'center'}, focusCircle: {width: 7, height: 7, borderWidth: 1.2, borderRadius: 4}, focusArrowStem: {position: 'absolute', width: 1.5, height: 9, right: -5, bottom: -4, alignItems: 'center'}, focusArrowHead: {position: 'absolute', bottom: 0, width: 0, height: 0, borderLeftWidth: 3, borderRightWidth: 3, borderBottomWidth: 4, borderLeftColor: 'transparent', borderRightColor: 'transparent'},
  touch: {minHeight: 48},
  body: {flex: 1, minHeight: 0}, bodyLandscape: {flexDirection: 'row'},
  finder: {flex: 1, minHeight: 0, minWidth: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#080909', overflow: 'hidden'}, finderLandscape: {marginLeft: 72},
  previewFrame: {position: 'relative', overflow: 'hidden', backgroundColor: '#181D18'}, previewFallback: {width: '100%', height: '100%'}, previewPending: {opacity: 0},
  empty: {flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', gap: 8}, muted: {color: theme.colors.onSurfaceVariant},
  gridV: {position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: '#D8DEC8'}, gridH: {position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: '#D8DEC8'},
  hud: {paddingHorizontal: 7, paddingVertical: 5, backgroundColor: '#131714', color: '#EEEEEA', fontSize: 10, fontVariant: ['tabular-nums']},
  hudTopLeft: {position: 'absolute', top: 12, left: 12, flexDirection: 'row', gap: 6}, hudTopRight: {position: 'absolute', top: 12, right: 12, flexDirection: 'row', gap: 6}, hudAccent: {color: theme.colors.primary}, hudBottomLeft: {position: 'absolute', left: 12, bottom: 10}, hudBottomRight: {position: 'absolute', right: 12, bottom: 10, flexDirection: 'row', gap: 5}, bufferBadge: {position: 'absolute', left: 12, bottom: 10},
  focusTarget: {position: 'absolute', left: '50%', top: '50%', width: 64, height: 64, marginLeft: -32, marginTop: -32}, focusCorner: {position: 'absolute', width: 16, height: 16, borderColor: theme.colors.primary}, focusCornerTL: {left: 0, top: 0, borderLeftWidth: 1.5, borderTopWidth: 1.5}, focusCornerTR: {right: 0, top: 0, borderRightWidth: 1.5, borderTopWidth: 1.5}, focusCornerBL: {left: 0, bottom: 0, borderLeftWidth: 1.5, borderBottomWidth: 1.5}, focusCornerBR: {right: 0, bottom: 0, borderRightWidth: 1.5, borderBottomWidth: 1.5}, focusDot: {position: 'absolute', left: 29, top: 29, width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.primary}, countdown: {...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center'}, captureMark: {...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center'}, captureMarkCircle: {width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: '#131714'}, captureMarkText: {fontSize: 32, color: theme.colors.primary},
  dockViewport: {height: 148, flexGrow: 0, backgroundColor: '#080909'}, dockViewportLandscape: {width: 96, height: '100%', flexGrow: 0, flexShrink: 0},
  dock: {height: 148, position: 'relative', backgroundColor: '#080909'}, dockLandscape: {height: '100%', flexDirection: 'column', minWidth: 0, width: 96}, dockSide: {position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20}, dockSideLandscape: {flexDirection: 'column', paddingHorizontal: 6, paddingVertical: 16}, dockLeft: {flexDirection: 'row', alignItems: 'center', gap: 8}, dockLeftLandscape: {flexDirection: 'column', gap: 8},
  dockIconButton: {width: 56, height: 48, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 10}, dockIconActive: {backgroundColor: '#080909'}, dockLabel: {fontSize: 9, lineHeight: 11, color: '#B0B9AB', textAlign: 'center'}, dockLabelActive: {color: theme.colors.primary}, dockTiny: {position: 'absolute', right: 7, bottom: 5, fontSize: 9, color: theme.colors.primary},
  shutter: {position: 'absolute', left: '50%', top: '50%', width: 76, height: 76, marginLeft: -38, marginTop: -38, flexShrink: 0, borderRadius: 38, borderWidth: 2, borderColor: '#F7F7F2', backgroundColor: '#080909', alignItems: 'center', justifyContent: 'center'}, shutterCore: {width: 64, height: 64, borderRadius: 32, backgroundColor: '#F7F7F2'}, shutterDisabled: {opacity: .45}, shutterCounting: {width: 26, height: 26, borderRadius: 6, backgroundColor: theme.colors.primary}, dockHint: {position: 'absolute', left: '50%', top: '50%', marginLeft: -48, marginTop: 50, width: 96, textAlign: 'center', color: theme.colors.onSurfaceVariant, maxWidth: 96},
  scrim: {flex: 1, backgroundColor: '#00000099', justifyContent: 'center', padding: 16}, panel: {width: '100%', maxWidth: 520, maxHeight: '90%', alignSelf: 'center', borderRadius: 10, borderWidth: 1, borderColor: theme.colors.outline, padding: 16, gap: 12, backgroundColor: '#101210'},
  panelHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.outline}, panelKicker: {letterSpacing: 1.5, color: theme.colors.primary}, panelScroll: {gap: 12, paddingBottom: 4},
  options: {flexDirection: 'row', flexWrap: 'wrap', gap: 8}, option: {flexGrow: 1}, pagination: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}, emptyLuts: {padding: 8, color: theme.colors.onSurfaceVariant},
});
