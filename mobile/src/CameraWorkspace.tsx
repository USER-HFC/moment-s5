import React, {useEffect, useMemo, useRef, useState} from 'react';
import {AppState, Image, Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Button, Surface, Text} from 'react-native-paper';
import {camera, CameraState, LutItem} from './native';
import {theme} from './theme';

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
type IconName = 'back' | 'grid' | 'lut' | 'motion' | 'timer' | 'focus' | 'far' | 'near' | 'usb' | 'mic' | 'album' | 'ratio' | 'delay';

function CameraIcon({name, active = false, label}: {name: IconName; active?: boolean; label?: string}) {
  const color = active ? theme.colors.primary : '#E4E6DF';
  if (name === 'back') return <View style={styles.backIcon}><View style={[styles.backStem, {backgroundColor: color}]}/><View style={[styles.backHead, {borderLeftColor: color, borderBottomColor: color}]}/></View>;
  if (name === 'lut') return <Text style={[styles.typeIcon, {color, borderColor: color}]}>LUT</Text>;
  if (name === 'grid') return <View style={[styles.iconBox, {borderColor: color}]}><View style={[styles.iconLineV, {backgroundColor: color, left: '33%'}]}/><View style={[styles.iconLineV, {backgroundColor: color, left: '66%'}]}/><View style={[styles.iconLineH, {backgroundColor: color, top: '33%'}]}/><View style={[styles.iconLineH, {backgroundColor: color, top: '66%'}]}/></View>;
  if (name === 'motion') return <View style={[styles.motionIcon, {borderColor: color}]}><View style={[styles.playTriangle, {borderLeftColor: color}]}/><View style={[styles.motionTick, {backgroundColor: color, left: 5}]}/><View style={[styles.motionTick, {backgroundColor: color, left: 10}]}/></View>;
  if (name === 'timer' || name === 'delay') return <View style={[styles.timerIcon, {borderColor: color}]}><View style={[styles.timerHand, {backgroundColor: color, transform: [{rotate: '0deg'}]}]}/><View style={[styles.timerHandShort, {backgroundColor: color, transform: [{rotate: '45deg'}]}]}/><View style={[styles.timerCap, {backgroundColor: color}]}/></View>;
  if (name === 'mic') return <View style={styles.micIcon}><View style={[styles.micStem, {backgroundColor: color}]}/><View style={[styles.micBody, {borderColor: color}]}/></View>;
  if (name === 'usb') return <View style={styles.usbIcon}><View style={[styles.usbStem, {backgroundColor: color}]}/><View style={[styles.usbNode, {backgroundColor: color, top: 0}]}/><View style={[styles.usbNode, {backgroundColor: color, bottom: 1, left: 1}]}/><View style={[styles.usbNode, {backgroundColor: color, bottom: 1, right: 1}]}/></View>;
  if (name === 'album') return <View style={[styles.albumIcon, {borderColor: color}]}><View style={[styles.albumMountain, {borderBottomColor: color}]}/><View style={[styles.albumDot, {backgroundColor: color}]}/></View>;
  if (name === 'ratio') return <Text style={[styles.ratioIcon, {color}]}>{label || '3:2'}</Text>;
  if (name === 'far' || name === 'near') return <View style={[styles.focusIcon, {borderColor: color}]}><View style={[styles.focusCircle, {borderColor: color}]}/><View style={[styles.focusArrowStem, {backgroundColor: color, transform: [{rotate: name === 'far' ? '0deg' : '180deg'}]}]}><View style={[styles.focusArrowHead, {borderBottomColor: color}]}/></View></View>;
  return <View style={[styles.focusIcon, {borderColor: color}]}><View style={[styles.focusCircle, {borderColor: color}]}/></View>;
}

function ToolButton({label, icon, active = false, onPress, switchValue, rotateIcon = false}: {label: string; icon: IconName; active?: boolean; onPress: () => void; switchValue?: boolean; rotateIcon?: boolean}) {
  return <Pressable
    accessibilityRole={switchValue === undefined ? 'button' : 'switch'}
    accessibilityLabel={label}
    accessibilityState={switchValue === undefined ? {selected: active} : {checked: switchValue}}
    hitSlop={6}
    onPress={onPress}
    style={({pressed}) => [styles.toolButton, active && styles.toolButtonActive, pressed && styles.toolButtonPressed]}>
    <View style={[styles.iconVisual, rotateIcon && styles.iconVisualPortrait]}><CameraIcon name={icon} active={active}/></View>
  </Pressable>;
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
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.toolsViewport, landscape && styles.toolsViewportLandscape]} contentContainerStyle={[styles.tools, landscape && styles.toolsLandscape]} testID="camera-tools">
      <Pressable accessibilityRole="button" accessibilityLabel="返回首页" onPress={() => go('home')} style={styles.toolButton}><View style={[styles.iconVisual, !landscape && styles.iconVisualPortrait]}><CameraIcon name="back"/></View></Pressable>
      <ToolButton label="构图网格" icon="grid" rotateIcon={!landscape} active={grid} onPress={() => setGrid(value => !value)} />
      <ToolButton label="LUT 风格" icon="lut" rotateIcon={!landscape} active={!!state.lut} onPress={() => {setLutPage(0); setPanel('lut');}} />
      <ToolButton label="动态照片" icon="motion" rotateIcon={!landscape} active={motionEnabled} switchValue={motionEnabled} onPress={toggleMotion} />
      <ToolButton label="定时" icon="timer" rotateIcon={!landscape} active={timerEnabled} switchValue={timerEnabled} onPress={toggleTimer} />
      <ToolButton label="自动对焦" icon="focus" rotateIcon={!landscape} active={focusMode === 'auto'} onPress={() => chooseFocus('auto', 0)} />
      <ToolButton label="远对焦" icon="far" rotateIcon={!landscape} active={focusMode === 'far'} onPress={() => chooseFocus('far', -1)} />
      <ToolButton label="近对焦" icon="near" rotateIcon={!landscape} active={focusMode === 'near'} onPress={() => chooseFocus('near', 1)} />
    </ScrollView>
    <Pressable accessibilityRole="button" accessibilityLabel="相机连接" onPress={() => { void onConnect(); }} style={[styles.usbPinned, landscape ? styles.usbPinnedLandscape : styles.usbPinnedPortrait]}><View style={[styles.iconVisual, !landscape && styles.iconVisualPortrait]}><CameraIcon name="usb" active={state.active}/></View></Pressable>
    <View testID="camera-body" style={[styles.body, landscape && styles.bodyLandscape]}>
      <View testID="viewfinder" style={styles.finder} onLayout={event => setFinderSize(event.nativeEvent.layout)}>
        <View testID="preview-frame" style={[styles.previewFrame, previewFrame || styles.previewFallback, !previewFrame && styles.previewPending]}>
          {previewSlots.map((uri, slot) => uri && <Image key={slot} accessibilityLabel="相机实时取景" source={{uri}} style={[previewImageStyle, {opacity: activeSlot === slot ? 1 : 0}]} resizeMode="cover" fadeDuration={0} onLoad={() => commitPreview(slot as 0 | 1, uri)} />)}
          {grid && <View pointerEvents="none" style={StyleSheet.absoluteFill} accessible={false}>
            <View style={[styles.gridV, {left: '33.33%'}]}/><View style={[styles.gridV, {left: '66.67%'}]}/>
            <View style={[styles.gridH, {top: '33.33%'}]}/><View style={[styles.gridH, {top: '66.67%'}]}/>
          </View>}
          <Pressable accessibilityRole="button" accessibilityLabel="中央自动对焦" hitSlop={8} onPress={() => chooseFocus('auto', 0)} style={styles.focusTarget}><View pointerEvents="none" style={[styles.focusCorner, styles.focusCornerTL]}/><View pointerEvents="none" style={[styles.focusCorner, styles.focusCornerTR]}/><View pointerEvents="none" style={[styles.focusCorner, styles.focusCornerBL]}/><View pointerEvents="none" style={[styles.focusCorner, styles.focusCornerBR]}/><View pointerEvents="none" style={styles.focusDot}/></Pressable>
          {!preview && <View style={styles.empty}><Text variant="titleMedium">等待相机取景</Text><Text style={styles.muted}>USB 连接后开始监看</Text><Button contentStyle={styles.touch} onPress={() => camera?.demo()}>体验演示</Button></View>}
          <View pointerEvents="none" style={styles.hudTopLeft}>{state.demo && <Text style={styles.hud}>DEMO</Text>}{state.lut && <Text style={[styles.hud, styles.hudAccent]}>{state.lut}</Text>}</View>
          <View pointerEvents="none" style={[styles.hudTopRight, landscape && styles.hudTopRightLandscape]}><Text style={styles.hud}>CAM 82%</Text><Text style={styles.hud}>PHONE 96%</Text></View>
          <View pointerEvents="none" style={styles.hudBottomLeft}><Text style={styles.hud}>{focusLabel}</Text></View>
          <View pointerEvents="none" style={styles.hudBottomRight}><Text style={styles.hud}>F2.8</Text><Text style={styles.hud}>1/125</Text><Text style={styles.hud}>ISO 400</Text></View>
          {waiting && <View pointerEvents="none" style={styles.countdown}><Text variant="displayLarge" accessibilityLiveRegion="polite">{seconds}</Text></View>}
          {captureMark && <View pointerEvents="none" style={styles.captureMark}><View style={styles.captureMarkCircle}><Text style={styles.captureMarkText}>✓</Text></View></View>}
          {motionEnabled && <View pointerEvents="none" style={styles.bufferBadge}><Text style={styles.hud}>{buffered.toFixed(1)}s</Text></View>}
        </View>
      </View>
      <ScrollView horizontal={!landscape} showsHorizontalScrollIndicator={false} showsVerticalScrollIndicator={false} style={[styles.dockViewport, landscape && styles.dockViewportLandscape]} contentContainerStyle={[styles.dock, landscape && styles.dockLandscape]} testID="camera-dock">
        <ToolButton label="环境声" icon="mic" active={audio} onPress={() => {setAudio(value => {camera?.setAudio(!value); return !value;});}} />
        <Pressable accessibilityRole="button" accessibilityLabel={`画幅 ${ratioMode}`} onPress={() => setRatioMode(value => value === '3:2' ? '16:9' : '3:2')} style={styles.dockIconButton}><CameraIcon name="ratio" label={ratioMode}/></Pressable>
        {timerEnabled && <Pressable accessibilityRole="button" accessibilityLabel={`延时 ${delay} 秒`} onPress={() => setPanel('delay')} style={styles.dockIconButton}><CameraIcon name="delay"/><Text style={styles.dockTiny}>{delay}</Text></Pressable>}
        <Pressable testID="shutter" accessibilityRole="button" accessibilityLabel={captureLabel} disabled={disabled} onPress={fire} style={[styles.shutter, disabled && styles.shutterDisabled]}><View style={[styles.shutterCore, waiting && styles.shutterCounting]}/></Pressable>
        <Text style={styles.dockHint} variant="labelMedium">{waiting ? `${seconds}秒` : motionEnabled ? '快门前3秒' : timerEnabled ? `${delay}秒延时` : '机身照片'}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="打开相册" onPress={() => go('album')} style={[styles.dockIconButton, landscape ? styles.dockAlbumLandscape : styles.dockAlbumPortrait]}><CameraIcon name="album"/></Pressable>
      </ScrollView>
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
  toolsViewport: {flexGrow: 0, backgroundColor: '#080909'}, toolsViewportLandscape: {position: 'absolute', zIndex: 5, top: 0, left: 0, right: 96, height: 64},
  tools: {flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 4, paddingVertical: 8, backgroundColor: '#080909'}, toolsLandscape: {minWidth: 360},
  toolButton: {width: 48, height: 48, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1, borderColor: 'transparent', backgroundColor: '#080909'}, iconVisual: {alignItems: 'center', justifyContent: 'center'}, iconVisualPortrait: {transform: [{rotate: '-90deg'}]}, usbPinned: {position: 'absolute', zIndex: 8, width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#080909'}, usbPinnedPortrait: {right: 4, top: 64}, usbPinnedLandscape: {top: 8, right: 100},
  toolButtonActive: {borderColor: '#46563D', backgroundColor: '#101610'}, toolButtonPressed: {backgroundColor: '#202321'},
  typeIcon: {fontSize: 10, fontWeight: '700', letterSpacing: .5, borderWidth: 1.5, borderRadius: 4, paddingHorizontal: 2, paddingVertical: 3}, backIcon: {width: 22, height: 22, alignItems: 'center', justifyContent: 'center'}, backStem: {width: 16, height: 1.5, marginLeft: 5}, backHead: {position: 'absolute', left: 1, top: 7, width: 8, height: 8, borderLeftWidth: 1.5, borderBottomWidth: 1.5, transform: [{rotate: '45deg'}]},
  iconBox: {width: 22, height: 22, borderWidth: 1.5, borderRadius: 3, position: 'relative'}, iconLineV: {position: 'absolute', top: 0, bottom: 0, width: 1}, iconLineH: {position: 'absolute', left: 0, right: 0, height: 1},
  motionIcon: {width: 22, height: 16, borderWidth: 1.5, borderRadius: 3, position: 'relative'}, playTriangle: {position: 'absolute', right: -6, top: 3, width: 0, height: 0, borderTopWidth: 5, borderBottomWidth: 5, borderLeftWidth: 6, borderTopColor: 'transparent', borderBottomColor: 'transparent'}, motionTick: {position: 'absolute', top: -5, width: 1.5, height: 4},
  timerIcon: {width: 22, height: 22, borderWidth: 1.5, borderRadius: 11, position: 'relative'}, timerHand: {position: 'absolute', width: 1.5, height: 7, left: 9, top: 4}, timerHandShort: {position: 'absolute', width: 1.5, height: 6, left: 9, top: 9}, timerCap: {position: 'absolute', width: 6, height: 2, top: -4, left: 7, borderRadius: 1},
  micIcon: {width: 22, height: 24, position: 'relative', alignItems: 'center'}, micBody: {width: 9, height: 15, borderWidth: 1.5, borderRadius: 5}, micStem: {position: 'absolute', width: 1.5, height: 7, bottom: 0}, usbIcon: {width: 22, height: 24, position: 'relative'}, usbStem: {position: 'absolute', width: 1.5, height: 20, left: 10, top: 2}, usbNode: {position: 'absolute', width: 5, height: 5, borderRadius: 3},
  albumIcon: {width: 24, height: 20, borderWidth: 1.5, borderRadius: 3, position: 'relative', overflow: 'hidden'}, albumMountain: {position: 'absolute', left: 3, bottom: 2, width: 16, height: 10, borderBottomWidth: 1.5, transform: [{rotate: '-25deg'}]}, albumDot: {position: 'absolute', right: 4, top: 4, width: 3, height: 3, borderRadius: 2}, ratioIcon: {fontSize: 11, fontVariant: ['tabular-nums'], fontWeight: '700'}, focusIcon: {width: 22, height: 22, borderWidth: 1.5, borderRadius: 3, alignItems: 'center', justifyContent: 'center'}, focusCircle: {width: 7, height: 7, borderWidth: 1.2, borderRadius: 4}, focusArrowStem: {position: 'absolute', width: 1.5, height: 9, right: -5, bottom: -4, alignItems: 'center'}, focusArrowHead: {position: 'absolute', bottom: 0, width: 0, height: 0, borderLeftWidth: 3, borderRightWidth: 3, borderBottomWidth: 4, borderLeftColor: 'transparent', borderRightColor: 'transparent'},
  touch: {minHeight: 48},
  body: {flex: 1, minHeight: 0}, bodyLandscape: {flexDirection: 'row'},
  finder: {flex: 1, minHeight: 0, minWidth: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#080909', overflow: 'hidden'},
  previewFrame: {position: 'relative', overflow: 'hidden', backgroundColor: '#181D18'}, previewFallback: {width: '100%', height: '100%'}, previewPending: {opacity: 0},
  empty: {flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', gap: 8}, muted: {color: theme.colors.onSurfaceVariant},
  gridV: {position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: '#D8DEC8'}, gridH: {position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: '#D8DEC8'},
  hud: {paddingHorizontal: 7, paddingVertical: 5, backgroundColor: '#131714', color: '#EEEEEA', fontSize: 10, fontVariant: ['tabular-nums']},
  hudTopLeft: {position: 'absolute', top: 12, left: 12, flexDirection: 'row', gap: 6}, hudTopRight: {position: 'absolute', top: 12, right: 12, flexDirection: 'row', gap: 6}, hudTopRightLandscape: {top: 76}, hudAccent: {color: theme.colors.primary}, hudBottomLeft: {position: 'absolute', left: 12, bottom: 10}, hudBottomRight: {position: 'absolute', right: 12, bottom: 10, flexDirection: 'row', gap: 5}, bufferBadge: {position: 'absolute', left: 12, bottom: 10},
  focusTarget: {position: 'absolute', left: '50%', top: '50%', width: 64, height: 64, marginLeft: -32, marginTop: -32}, focusCorner: {position: 'absolute', width: 16, height: 16, borderColor: theme.colors.primary}, focusCornerTL: {left: 0, top: 0, borderLeftWidth: 1.5, borderTopWidth: 1.5}, focusCornerTR: {right: 0, top: 0, borderRightWidth: 1.5, borderTopWidth: 1.5}, focusCornerBL: {left: 0, bottom: 0, borderLeftWidth: 1.5, borderBottomWidth: 1.5}, focusCornerBR: {right: 0, bottom: 0, borderRightWidth: 1.5, borderBottomWidth: 1.5}, focusDot: {position: 'absolute', left: 29, top: 29, width: 6, height: 6, borderRadius: 3, backgroundColor: theme.colors.primary}, countdown: {...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center'}, captureMark: {...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center'}, captureMarkCircle: {width: 58, height: 58, borderRadius: 29, alignItems: 'center', justifyContent: 'center', backgroundColor: '#131714'}, captureMarkText: {fontSize: 32, color: theme.colors.primary},
  dockViewport: {height: 96, flexGrow: 0, backgroundColor: '#080909'}, dockViewportLandscape: {width: 96, height: '100%', flexGrow: 0, flexShrink: 0},
  dock: {height: 96, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', minWidth: '100%', padding: 8, gap: 6, backgroundColor: '#080909'}, dockLandscape: {height: '100%', flexDirection: 'column', minWidth: 0, width: 96, paddingHorizontal: 6, justifyContent: 'space-between'},
  dockIconButton: {width: 48, height: 48, flexShrink: 0, alignItems: 'center', justifyContent: 'center', borderRadius: 12}, dockAlbumPortrait: {marginLeft: 'auto'}, dockAlbumLandscape: {marginTop: 'auto'}, dockTiny: {position: 'absolute', right: 7, bottom: 5, fontSize: 9, color: theme.colors.primary},
  shutter: {width: 80, height: 80, flexShrink: 0, borderRadius: 40, borderWidth: 2, borderColor: '#F7F7F2', backgroundColor: '#080909', alignItems: 'center', justifyContent: 'center'}, shutterCore: {width: 64, height: 64, borderRadius: 32, backgroundColor: '#F7F7F2'}, shutterDisabled: {opacity: .45}, shutterCounting: {width: 26, height: 26, borderRadius: 6, backgroundColor: theme.colors.primary}, dockHint: {textAlign: 'center', color: theme.colors.onSurfaceVariant, maxWidth: 96, flexShrink: 0},
  scrim: {flex: 1, backgroundColor: '#00000099', justifyContent: 'center', padding: 16}, panel: {width: '100%', maxWidth: 520, maxHeight: '90%', alignSelf: 'center', borderRadius: 10, borderWidth: 1, borderColor: theme.colors.outline, padding: 16, gap: 12, backgroundColor: '#101210'},
  panelHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.outline}, panelKicker: {letterSpacing: 1.5, color: theme.colors.primary}, panelScroll: {gap: 12, paddingBottom: 4},
  options: {flexDirection: 'row', flexWrap: 'wrap', gap: 8}, option: {flexGrow: 1}, pagination: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}, emptyLuts: {padding: 8, color: theme.colors.onSurfaceVariant},
});
