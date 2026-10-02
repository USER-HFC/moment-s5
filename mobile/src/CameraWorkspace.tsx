import React, {useEffect, useMemo, useRef, useState} from 'react';
import {AppState, Image, Modal, Pressable, StyleSheet, useWindowDimensions, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Button, ProgressBar, Surface, Text} from 'react-native-paper';
import {camera, CameraState, LutItem} from './native';
import {theme} from './theme';

export type CameraMode = 'monitor' | 'timer' | 'motion';
type FocusMode = 'auto' | 'far' | 'near';
type Panel = 'lut' | 'delay' | null;
type Props = {
  page: CameraMode; go: (page: CameraMode | 'album') => void;
  state: CameraState; preview?: string; buffered: number; luts: LutItem[];
  onLut: (id: string) => Promise<void>; onImportLut: () => Promise<void>;
  onRefresh: () => Promise<void>; onConnect: () => Promise<void>;
};
type PreviewSlots = [string | undefined, string | undefined];

function ToolButton({label, glyph, active = false, onPress, switchValue}: {label: string; glyph: string; active?: boolean; onPress: () => void; switchValue?: boolean}) {
  return <Pressable
    accessibilityRole={switchValue === undefined ? 'button' : 'switch'}
    accessibilityLabel={label}
    accessibilityState={switchValue === undefined ? {selected: active} : {checked: switchValue}}
    hitSlop={6}
    onPress={onPress}
    style={({pressed}) => [styles.toolButton, active && styles.toolButtonActive, pressed && styles.toolButtonPressed]}>
    <Text style={[styles.toolGlyph, active && styles.toolGlyphActive]}>{glyph}</Text>
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
  const [finderSize, setFinderSize] = useState({width: 0, height: 0});
  const [previewSlots, setPreviewSlots] = useState<PreviewSlots>([undefined, undefined]);
  const [activeSlot, setActiveSlot] = useState(0);
  const activeSlotRef = useRef(0);
  const pendingSlotRef = useRef<number | null>(null);
  const slotUrisRef = useRef<PreviewSlots>([undefined, undefined]);
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

  useEffect(() => {
    setDeadline(null); setPanel(null);
    setMotionEnabled(page === 'motion'); setTimerEnabled(page === 'timer');
  }, [page]);
  useEffect(() => { if (!state.active) setDeadline(null); }, [state.active]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', next => { if (next !== 'active') setDeadline(null); });
    return () => sub.remove();
  }, []);
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
    <View style={[styles.tools, landscape && styles.toolsLandscape]} testID="camera-tools">
      <ToolButton label="构图网格" glyph="▦" active={grid} onPress={() => setGrid(value => !value)} />
      <ToolButton label="LUT 风格" glyph="LUT" active={!!state.lut} onPress={() => {setLutPage(0); setPanel('lut');}} />
      <ToolButton label="动态照片" glyph="▣" active={motionEnabled} switchValue={motionEnabled} onPress={toggleMotion} />
      <ToolButton label="定时" glyph="◷" active={timerEnabled} switchValue={timerEnabled} onPress={toggleTimer} />
      <ToolButton label="自动对焦" glyph="AF" active={focusMode === 'auto'} onPress={() => chooseFocus('auto', 0)} />
      <ToolButton label="远对焦" glyph="∞" active={focusMode === 'far'} onPress={() => chooseFocus('far', -1)} />
      <ToolButton label="近对焦" glyph="·" active={focusMode === 'near'} onPress={() => chooseFocus('near', 1)} />
      <ToolButton label="相机连接" glyph="USB" active={state.active} onPress={() => { void onConnect(); }} />
    </View>
    <View testID="camera-body" style={[styles.body, landscape && styles.bodyLandscape]}>
      <View testID="viewfinder" style={styles.finder} onLayout={event => setFinderSize(event.nativeEvent.layout)}>
        <View testID="preview-frame" style={[styles.previewFrame, previewFrame || styles.previewFallback]}>
          {previewSlots.map((uri, slot) => uri && <Image key={slot} accessibilityLabel="相机实时取景" source={{uri}} style={[StyleSheet.absoluteFill, {opacity: activeSlot === slot ? 1 : 0}]} resizeMode="cover" fadeDuration={0} onLoad={() => commitPreview(slot as 0 | 1, uri)} />)}
          {grid && <View pointerEvents="none" style={StyleSheet.absoluteFill} accessible={false}>
            <View style={[styles.gridV, {left: '33.33%'}]}/><View style={[styles.gridV, {left: '66.67%'}]}/>
            <View style={[styles.gridH, {top: '33.33%'}]}/><View style={[styles.gridH, {top: '66.67%'}]}/>
          </View>}
          {!preview && <View style={styles.empty}><Text variant="titleMedium">等待相机取景</Text><Text style={styles.muted}>USB 连接后开始监看</Text><Button contentStyle={styles.touch} onPress={() => camera?.demo()}>体验演示</Button></View>}
          <View pointerEvents="none" style={[styles.hudTopRight, landscape && styles.hudTopRightLandscape]}><Text style={styles.hud}>CAM 82%</Text><Text style={styles.hud}>PHONE 96%</Text></View>
          <View pointerEvents="none" style={styles.hudBottomLeft}><Text style={styles.hud}>{focusLabel}</Text></View>
          <View pointerEvents="none" style={styles.hudBottomRight}><Text style={styles.hud}>F2.8</Text><Text style={styles.hud}>1/125</Text><Text style={styles.hud}>ISO 400</Text></View>
          {waiting && <View pointerEvents="none" style={styles.countdown}><Text variant="displayLarge" accessibilityLiveRegion="polite">{seconds}</Text></View>}
          {motionEnabled && <ProgressBar style={styles.buffer} progress={Math.max(0, Math.min(1, buffered / 3))}/>}
        </View>
      </View>
      <View testID="camera-dock" style={[styles.dock, landscape && styles.dockLandscape]}>
        <ToolButton label="环境声" glyph="MIC" active={audio} onPress={() => {setAudio(value => {camera?.setAudio(!value); return !value;});}} />
        <Button contentStyle={styles.touch} compact onPress={() => go('album')}>相册</Button>
        <Button contentStyle={styles.touch} compact onPress={() => setRatioMode(value => value === '3:2' ? '16:9' : '3:2')}>{ratioMode}</Button>
        {timerEnabled && <Button contentStyle={styles.touch} compact onPress={() => setPanel('delay')}>{delay}秒</Button>}
        <Button testID="shutter" accessibilityLabel={captureLabel} mode="contained" disabled={disabled} onPress={fire} style={styles.shutter} contentStyle={styles.shutterContent}>{waiting ? '取消' : state.busy ? '处理中' : '拍摄'}</Button>
        <Text style={styles.dockHint} variant="labelMedium">{waiting ? `${seconds}秒` : motionEnabled ? '快门前3秒' : timerEnabled ? `${delay}秒延时` : '机身照片'}</Text>
      </View>
    </View>
    <Modal visible={panel !== null} transparent animationType="none" supportedOrientations={['portrait', 'landscape']} onRequestClose={() => setPanel(null)}>
      <SafeAreaView style={styles.scrim}>
        <Surface elevation={0} style={styles.panel} accessibilityViewIsModal>
          <View style={styles.panelHeader}><View><Text variant="labelSmall" style={styles.panelKicker}>LUMIX CONTROL</Text><Text variant="titleMedium">{panel === 'lut' ? 'LUT 风格' : '快门延时'}</Text></View><Button contentStyle={styles.touch} onPress={() => setPanel(null)}>关闭</Button></View>
          {panel === 'delay' && <View style={styles.options}>{[2, 5, 10, 30].map(value => <Button key={value} compact style={styles.option} contentStyle={styles.touch} accessibilityState={{selected: delay === value}} mode={delay === value ? 'contained' : 'outlined'} onPress={() => {setDelay(value); setPanel(null);}}>{value}秒</Button>)}</View>}
          {panel === 'lut' && <>
            <View style={styles.options}><Button compact contentStyle={styles.touch} disabled={working || state.busy} onPress={() => chooseLut('off')}>原色</Button><Button compact contentStyle={styles.touch} disabled={working || state.busy} onPress={async () => {setWorking(true); try {await onImportLut();} finally {setWorking(false);}}}>导入</Button><Button compact contentStyle={styles.touch} disabled={working} onPress={onRefresh}>刷新</Button></View>
            {luts.length === 0 ? <Text style={styles.emptyLuts}>导入 LUMIX Lab 的 .cube 或 .zip 文件</Text> : luts.slice(currentPage * pageSize, (currentPage + 1) * pageSize).map(lut => <Button key={lut.id} contentStyle={styles.touch} disabled={working || state.busy} mode={state.lut === lut.name ? 'contained-tonal' : 'text'} accessibilityLabel={`选择 LUT ${lut.name}`} onPress={() => chooseLut(lut.id)}>{lut.name}</Button>)}
            <View style={styles.pagination}><Button compact contentStyle={styles.touch} disabled={currentPage === 0} onPress={() => setLutPage(currentPage - 1)}>上一页</Button><Text>{currentPage + 1} / {pages}</Text><Button compact contentStyle={styles.touch} disabled={currentPage + 1 >= pages} onPress={() => setLutPage(currentPage + 1)}>下一页</Button></View>
          </>}
        </Surface>
      </SafeAreaView>
    </Modal>
  </View>;
}

const styles = StyleSheet.create({
  root: {flex: 1, minHeight: 0, backgroundColor: '#080909'},
  tools: {flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 4, paddingVertical: 8, backgroundColor: '#080909'}, toolsLandscape: {position: 'absolute', zIndex: 5, top: 0, left: 0, right: 96},
  toolButton: {width: 44, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#080909'},
  toolButtonActive: {}, toolButtonPressed: {backgroundColor: '#202321'},
  toolGlyph: {fontSize: 17, fontWeight: '600', color: '#E4E6DF', textAlign: 'center'}, toolGlyphActive: {color: theme.colors.primary},
  touch: {minHeight: 48},
  body: {flex: 1, minHeight: 0}, bodyLandscape: {flexDirection: 'row'},
  finder: {flex: 1, minHeight: 0, minWidth: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: '#080909', overflow: 'hidden'},
  previewFrame: {position: 'relative', overflow: 'hidden', backgroundColor: '#181D18'}, previewFallback: {width: '100%', height: '100%'},
  empty: {flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center', gap: 8}, muted: {color: theme.colors.onSurfaceVariant},
  gridV: {position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: '#D8DEC8'}, gridH: {position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: '#D8DEC8'},
  hud: {paddingHorizontal: 7, paddingVertical: 5, backgroundColor: '#131714', color: '#EEEEEA', fontSize: 10, fontVariant: ['tabular-nums']},
  hudTopRight: {position: 'absolute', top: 12, right: 12, flexDirection: 'row', gap: 6}, hudTopRightLandscape: {top: 76}, hudBottomLeft: {position: 'absolute', left: 12, bottom: 10}, hudBottomRight: {position: 'absolute', right: 12, bottom: 10, flexDirection: 'row', gap: 5},
  buffer: {position: 'absolute', bottom: 0, left: 0, right: 0, height: 4}, countdown: {...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center'},
  dock: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', padding: 8, gap: 4, backgroundColor: '#080909'}, dockLandscape: {flexDirection: 'column', width: 96, paddingHorizontal: 6},
  shutter: {borderRadius: 40}, shutterContent: {width: 80, minHeight: 72}, dockHint: {textAlign: 'center', color: theme.colors.onSurfaceVariant, maxWidth: 96},
  scrim: {flex: 1, backgroundColor: '#00000099', justifyContent: 'center', padding: 16}, panel: {width: '100%', maxWidth: 520, maxHeight: '90%', alignSelf: 'center', borderRadius: 10, borderWidth: 1, borderColor: theme.colors.outline, padding: 16, gap: 12, backgroundColor: '#101210'},
  panelHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: theme.colors.outline}, panelKicker: {letterSpacing: 1.5, color: theme.colors.primary},
  options: {flexDirection: 'row', flexWrap: 'wrap', gap: 8}, option: {flexGrow: 1}, pagination: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}, emptyLuts: {padding: 8, color: theme.colors.onSurfaceVariant},
});
