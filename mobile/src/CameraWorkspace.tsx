import React, {useEffect, useState} from 'react';
import {AppState, Image, Modal, StyleSheet, useWindowDimensions, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Button, ProgressBar, Surface, Text} from 'react-native-paper';
import {camera, CameraState, LutItem} from './native';
import {theme} from './theme';

export type CameraMode = 'monitor' | 'timer' | 'motion';
type Panel = 'focus' | 'lut' | 'delay' | null;
type Props = {
  page: CameraMode; go: (page: CameraMode | 'album') => void;
  state: CameraState; preview?: string; buffered: number; luts: LutItem[];
  onLut: (id: string) => Promise<void>; onImportLut: () => Promise<void>;
  onRefresh: () => Promise<void>;
};
const modes: [CameraMode, string][] = [['monitor', '监看'], ['timer', '定时'], ['motion', '动态']];

export default function CameraWorkspace({page, go, state, preview, buffered, luts, onLut, onImportLut, onRefresh}: Props) {
  const {width, height, fontScale} = useWindowDimensions();
  const landscape = width > height;
  const [panel, setPanel] = useState<Panel>(null);
  const [grid, setGrid] = useState(true);
  const [audio, setAudio] = useState(false);
  const [delay, setDelay] = useState(10);
  const [deadline, setDeadline] = useState<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [lutPage, setLutPage] = useState(0);
  const [working, setWorking] = useState(false);
  const pageSize = Math.max(1, Math.min(4, Math.floor((height - 250) / (56 * fontScale))));
  const pages = Math.max(1, Math.ceil(luts.length / pageSize));
  const currentPage = Math.min(lutPage, pages - 1);
  const waiting = deadline !== null;

  useEffect(() => { setDeadline(null); setPanel(null); }, [page]);
  useEffect(() => {
    if (!state.active) setDeadline(null);
  }, [state.active]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', next => { if (next !== 'active') setDeadline(null); });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    if (deadline === null) return;
    const tick = () => {
      const left = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setSeconds(left);
      if (left === 0) { setDeadline(null); camera?.remoteShutter(); }
    };
    const timer = setInterval(tick, 100);
    return () => clearInterval(timer);
  }, [deadline]);
  const fire = () => {
    if (waiting) { setDeadline(null); return; }
    if (!state.active || state.busy) return;
    if (page === 'motion') { if (state.ready) camera?.capture(); }
    else if (page === 'timer') { setSeconds(delay); setDeadline(Date.now() + delay * 1000); }
    else camera?.remoteShutter();
  };
  const chooseLut = async (id: string) => {
    setWorking(true);
    try { await onLut(id); } finally { setWorking(false); }
  };
  const captureLabel = waiting ? '取消倒计时' : page === 'motion' ? '拍摄动态照片' : page === 'timer' ? '开始倒计时' : '拍照到相机';
  const disabled = !waiting && (!state.active || state.busy || (page === 'motion' && !state.ready));

  return <View style={styles.root} testID="camera-workspace">
    <View style={styles.tools}>
      <Button compact mode={grid ? 'contained-tonal' : 'text'} style={styles.tool} contentStyle={styles.touch} accessibilityLabel="构图网格" accessibilityState={{selected: grid}} onPress={() => setGrid(!grid)}>网格</Button>
      <Button compact style={styles.tool} contentStyle={styles.touch} onPress={() => setPanel('focus')}>对焦</Button>
      <Button compact style={styles.tool} contentStyle={styles.touch} mode={state.lut ? 'contained-tonal' : 'text'} onPress={() => {setLutPage(0); setPanel('lut');}}>LUT</Button>
      {page === 'timer'
        ? <Button compact style={styles.tool} contentStyle={styles.touch} disabled={waiting} onPress={() => setPanel('delay')}>{delay}秒</Button>
        : <Button compact style={styles.tool} contentStyle={styles.touch} mode={audio ? 'contained-tonal' : 'text'} accessibilityLabel="环境声" accessibilityState={{selected: audio}} onPress={() => {setAudio(!audio); camera?.setAudio(!audio);}}>声音</Button>}
    </View>
    <View testID="camera-body" style={[styles.body, landscape && styles.bodyLandscape]}>
      <View style={styles.finder} testID="viewfinder">
        {preview ? <Image accessibilityLabel="相机实时取景" source={{uri: preview}} style={StyleSheet.absoluteFill} resizeMode="contain" fadeDuration={0}/> :
          <View style={styles.empty}><Text variant="titleMedium">等待相机取景</Text><Text style={styles.muted}>USB 连接后开始监看</Text><Button contentStyle={styles.touch} onPress={() => camera?.demo()}>体验演示</Button></View>}
        {grid && <View pointerEvents="none" style={StyleSheet.absoluteFill} accessible={false}>
          <View style={[styles.gridV, {left: '33.33%'}]}/><View style={[styles.gridV, {left: '66.67%'}]}/>
          <View style={[styles.gridH, {top: '33.33%'}]}/><View style={[styles.gridH, {top: '66.67%'}]}/>
        </View>}
        <View pointerEvents="none" style={styles.finderCaption}><Text numberOfLines={1} style={styles.muted}>{state.demo ? '演示 · ' : ''}{state.lut || '原色'}{page === 'motion' ? ` · 缓存 ${buffered.toFixed(1)} / 3 秒` : ' · 照片存至机身 SD 卡'}</Text></View>
        {waiting && <View pointerEvents="none" style={styles.countdown}><Text variant="displayLarge" accessibilityLiveRegion="polite">{seconds}</Text></View>}
        {page === 'motion' && <ProgressBar style={styles.buffer} progress={Math.max(0, Math.min(1, buffered / 3))}/>}
      </View>
      <View testID="camera-dock" style={[styles.dock, landscape && styles.dockLandscape]}>
        <Button contentStyle={styles.touch} compact onPress={() => go('album')}>相册</Button>
        <Button testID="shutter" accessibilityLabel={captureLabel} mode="contained" disabled={disabled} onPress={fire} style={styles.shutter} contentStyle={styles.shutterContent}>{waiting ? '取消' : state.busy ? '处理中' : '拍摄'}</Button>
        <Text style={styles.dockHint} variant="labelMedium">{waiting ? `${seconds}秒` : page === 'motion' ? '快门前3秒' : page === 'timer' ? `${delay}秒延时` : '机身照片'}</Text>
      </View>
    </View>
    <View style={styles.modes} testID="camera-modes">{modes.map(([mode, title]) =>
      <Button key={mode} testID={`mode-${mode}`} compact style={styles.tool} contentStyle={styles.touch} accessibilityLabel={`切换${title}模式`} accessibilityState={{selected: page === mode}} mode={page === mode ? 'contained-tonal' : 'text'} onPress={() => go(mode)}>{title}</Button>)}</View>
    <Modal visible={panel !== null} transparent animationType="none" supportedOrientations={['portrait', 'landscape']} onRequestClose={() => setPanel(null)}>
      <SafeAreaView style={styles.scrim}>
        <Surface elevation={0} style={styles.panel} accessibilityViewIsModal>
          <View style={styles.panelHeader}><Text variant="titleMedium">{panel === 'lut' ? 'LUT 仓库' : panel === 'focus' ? '对焦控制' : '快门延时'}</Text><Button contentStyle={styles.touch} onPress={() => setPanel(null)}>完成</Button></View>
          {panel === 'focus' && <View style={styles.options}>{[[-1, '远对焦'], [0, '自动对焦'], [1, '近对焦']].map(([direction, label]) => <Button key={label} compact style={styles.option} contentStyle={styles.touch} mode="outlined" disabled={!state.active || state.busy} onPress={() => camera?.focus(Number(direction))}>{label}</Button>)}</View>}
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
  root: {flex: 1, minHeight: 0},
  tools: {flexDirection: 'row', gap: 8, paddingHorizontal: 8, paddingBottom: 4},
  tool: {flex: 1}, touch: {minHeight: 48},
  body: {flex: 1, minHeight: 0}, bodyLandscape: {flexDirection: 'row'},
  finder: {flex: 1, minHeight: 0, backgroundColor: theme.colors.surface, overflow: 'hidden'},
  empty: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8},
  muted: {color: theme.colors.onSurfaceVariant},
  finderCaption: {position: 'absolute', top: 8, left: 8, right: 8, backgroundColor: theme.colors.background, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8},
  gridV: {position: 'absolute', top: 0, bottom: 0, width: StyleSheet.hairlineWidth, backgroundColor: theme.colors.outline},
  gridH: {position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: theme.colors.outline},
  buffer: {position: 'absolute', bottom: 0, left: 0, right: 0, height: 4},
  countdown: {...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center'},
  dock: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', padding: 8, gap: 8},
  dockLandscape: {flexDirection: 'column', width: 112},
  shutter: {borderRadius: 40}, shutterContent: {width: 80, minHeight: 72},
  dockHint: {textAlign: 'center', color: theme.colors.onSurfaceVariant, maxWidth: 96},
  modes: {flexDirection: 'row', gap: 8, padding: 8},
  scrim: {flex: 1, backgroundColor: theme.colors.backdrop, justifyContent: 'center', padding: 16},
  panel: {width: '100%', maxWidth: 520, maxHeight: '90%', alignSelf: 'center', borderRadius: 24, padding: 12, gap: 8, backgroundColor: theme.colors.surface},
  panelHeader: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  options: {flexDirection: 'row', flexWrap: 'wrap', gap: 8}, option: {flexGrow: 1},
  pagination: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  emptyLuts: {padding: 8, color: theme.colors.onSurfaceVariant},
});
