import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Alert, AlertButton, Animated, AppState, BackHandler, FlatList, Image, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {Button, Text} from 'react-native-paper';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Video, {VideoRef} from 'react-native-video';
import {LutItem, MomentDetails, MomentItem} from './native';
import {ui} from './theme';
import ExperimentalWifiBadge from './connection/ExperimentalWifiBadge';
import CameraControl from './CameraControl';
import CameraSheet from './CameraSheet';
import LutPresetList from './LutPresetList';
import {fileLabel, formatBytes, formatDimensions, formatMomentDate, formatMomentDateTime, momentOrigin, momentTransport, shareKindLabel, shareKinds} from './albumFormat';

type Props = {
  moments: MomentItem[];
  luts?: LutItem[];
  onBack: () => void;
  onExport: (id: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onRender?: (id: string, lutId: string) => Promise<unknown>;
  onPreview?: (id: string, lutId: string) => Promise<string | null>;
  onDetails?: (id: string) => Promise<MomentDetails>;
  onShare?: (id: string, kind: string) => Promise<void>;
};

const hasMotion = (moment: MomentItem) => moment.captureMode !== 'photo' && !!moment.videoUri && moment.complete;
const canExport = (moment: MomentItem) => moment.complete || (moment.captureMode === 'photo' && !!moment.imageUri);

export default function MotionAlbum({moments, luts = [], onBack, onExport, onDelete, onRender, onPreview, onDetails, onShare}: Props) {
  const [frame, setFrame] = useState({width: 0, height: 0});
  const [viewerId, setViewerId] = useState<string | null>(null);
  const [chrome, setChrome] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [lutOpen, setLutOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [previewLutId, setPreviewLutId] = useState<string | undefined>(undefined);
  const [previewUri, setPreviewUri] = useState<string | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [details, setDetails] = useState<MomentDetails | null | undefined>(undefined);
  const viewerIdRef = useRef<string | null>(null);
  const playingRef = useRef(false);
  const videoReadyRef = useRef(false);
  const zoomedRef = useRef(false);
  const pinching = useRef(false);
  const scaleRef = useRef(1);
  const pinchStart = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);
  const panStart = useRef({x: 0, y: 0});
  const previewToken = useRef(0);
  const indexRef = useRef(0);
  const videoRef = useRef<VideoRef>(null);
  const imageOpacity = useRef(new Animated.Value(1)).current;
  const videoOpacity = useRef(new Animated.Value(0)).current;
  const zoom = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const dragX = useRef(new Animated.Value(0)).current;
  const baseX = useRef(new Animated.Value(0)).current;
  const rowX = useRef(Animated.add(dragX, baseX)).current;
  const pageWidth = frame.width || 360;
  const pageHeight = frame.height || 640;
  const columns = pageWidth >= 900 ? 5 : pageWidth >= 600 ? 4 : 3;
  const current = moments.find((moment) => moment.id === viewerId) || null;
  const index = Math.max(0, moments.findIndex((moment) => moment.id === viewerId));
  viewerIdRef.current = viewerId;
  indexRef.current = current ? index : 0;

  const resetZoom = useCallback(() => {
    scaleRef.current = 1;
    txRef.current = 0;
    tyRef.current = 0;
    pinching.current = false;
    zoom.setValue(1);
    translateX.setValue(0);
    translateY.setValue(0);
    dragX.setValue(0);
    if (zoomedRef.current) { zoomedRef.current = false; setZoomed(false); }
    else zoomedRef.current = false;
  }, [dragX, translateX, translateY, zoom]);
  const clearPreview = useCallback(() => {
    previewToken.current += 1;
    setPreviewLutId(undefined);
    setPreviewUri(null);
    setPreviewing(false);
  }, []);
  const stopPlayback = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    imageOpacity.setValue(1);
    videoOpacity.setValue(0);
  }, [imageOpacity, videoOpacity]);

  useEffect(() => { baseX.setValue(-pageWidth); }, [baseX, pageWidth]);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    videoReadyRef.current = false;
    stopPlayback();
    resetZoom();
    clearPreview();
    setLutOpen(false);
    setInfoOpen(false);
  }, [viewerId, stopPlayback, resetZoom, clearPreview]);
  useEffect(() => {
    if (viewerId && !moments.some((moment) => moment.id === viewerId)) setViewerId(moments[0]?.id ?? null);
  }, [moments, viewerId]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => { if (next !== 'active') stopPlayback(); });
    return () => { sub.remove(); imageOpacity.stopAnimation(); videoOpacity.stopAnimation(); };
  }, [imageOpacity, stopPlayback, videoOpacity]);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (infoOpen) { setInfoOpen(false); return true; }
      if (lutOpen) { clearPreview(); setLutOpen(false); return true; }
      if (viewerIdRef.current) { setViewerId(null); return true; }
      return false;
    });
    return () => sub.remove();
  }, [infoOpen, lutOpen, clearPreview]);
  useEffect(() => {
    if (!infoOpen || !viewerId || !onDetails) return undefined;
    let live = true;
    setDetails(undefined);
    onDetails(viewerId).then((next) => { if (live) setDetails(next); }).catch(() => { if (live) setDetails(null); });
    return () => { live = false; };
  }, [infoOpen, viewerId, onDetails]);

  const fadeToVideo = () => {
    imageOpacity.stopAnimation(); videoOpacity.stopAnimation();
    Animated.parallel([
      Animated.timing(imageOpacity, {toValue: 0, duration: 180, useNativeDriver: true}),
      Animated.timing(videoOpacity, {toValue: 1, duration: 220, useNativeDriver: true}),
    ]).start();
  };
  const fadeToImage = () => Animated.parallel([
    Animated.timing(videoOpacity, {toValue: 0, duration: 220, useNativeDriver: true}),
    Animated.timing(imageOpacity, {toValue: 1, duration: 320, useNativeDriver: true}),
  ]).start();
  const togglePlay = () => {
    if (!current || !hasMotion(current)) return;
    if (playingRef.current) { stopPlayback(); fadeToImage(); return; }
    resetZoom();
    playingRef.current = true;
    setPlaying(true);
    if (videoReadyRef.current) { videoRef.current?.seek(0); fadeToVideo(); }
  };

  // One pan both pages and, after a pinch, moves the enlarged photo. A scaled photo must not change pages.
  // A Pressable in this tree calls requestDisallowInterceptTouchEvent and swallows the swipe, so chrome toggles with a tap gesture instead.
  const finishPinch = () => {
    const wasPinching = pinching.current;
    pinching.current = false;
    if (wasPinching && scaleRef.current < 1.05) resetZoom();
  };
  // onStart, not onBegin: a one-finger swipe also begins the pinch recognizer, and that was paging the photo instead of the album.
  const pinch = Gesture.Pinch().runOnJS(true).onStart(() => {
    pinching.current = true;
    pinchStart.current = scaleRef.current;
    dragX.setValue(0);
  }).onUpdate((event) => {
    const next = Math.min(4, Math.max(1, pinchStart.current * event.scale));
    scaleRef.current = next;
    zoom.setValue(next);
    const zoomedNow = next >= 1.05;
    if (zoomedNow !== zoomedRef.current) { zoomedRef.current = zoomedNow; setZoomed(zoomedNow); }
  }).onEnd(finishPinch).onFinalize(finishPinch);
  const tap = Gesture.Tap().runOnJS(true).maxDistance(24).onEnd((_event, success) => {
    if (!success) return;
    setChrome((value) => !value);
  });
  const pan = Gesture.Pan().runOnJS(true).activeOffsetX([-24, 24]).onBegin(() => {
    panStart.current = {x: txRef.current, y: tyRef.current};
  }).onUpdate((event) => {
    if (pinching.current || scaleRef.current >= 1.05) {
      const x = panStart.current.x + event.translationX;
      const y = panStart.current.y + event.translationY;
      txRef.current = x; tyRef.current = y;
      translateX.setValue(x); translateY.setValue(y);
      return;
    }
    const atStart = indexRef.current <= 0 && event.translationX > 0;
    const atEnd = indexRef.current >= moments.length - 1 && event.translationX < 0;
    dragX.setValue(atStart || atEnd ? event.translationX * 0.25 : event.translationX);
  }).onEnd((event) => {
    dragX.setValue(0);
    if (pinching.current || scaleRef.current >= 1.05 || zoomedRef.current) return;
    const threshold = Math.max(48, pageWidth * 0.18);
    const direction = event.translationX <= -threshold ? 1 : event.translationX >= threshold ? -1 : 0;
    const next = moments[indexRef.current + direction];
    if (direction !== 0 && next) setViewerId(next.id);
  });
  const gesture = Gesture.Simultaneous(pinch, Gesture.Exclusive(pan, tap));
  const transform = [{translateX}, {translateY}, {scale: zoom}];

  const askDelete = (id: string) => Alert.alert('删除这张照片？', '只删除 App 内副本；相机 SD 卡原片和已导出到系统相册的副本会保留。', [
    {text: '取消', style: 'cancel'}, {text: '删除', style: 'destructive', onPress: () => { void onDelete(id); }},
  ]);
  const share = () => {
    if (!current || !onShare) return;
    const id = current.id;
    const buttons: AlertButton[] = shareKinds(current).map((kind) => ({text: shareKindLabel[kind], onPress: () => { void onShare(id, kind); }}));
    buttons.push({text: '取消', style: 'cancel'});
    Alert.alert('分享照片', '选择要分享的文件', buttons);
  };
  const selectLut = async (id: string) => {
    if (!current) return;
    const token = ++previewToken.current;
    setPreviewLutId(id);
    if (id === 'off' || !onPreview) { setPreviewUri(null); setPreviewing(false); return; }
    setPreviewing(true);
    try {
      const uri = await onPreview(current.id, id);
      if (token !== previewToken.current) return;
      setPreviewUri(uri);
    } catch {
      if (token === previewToken.current) setPreviewUri(null);
    } finally {
      if (token === previewToken.current) setPreviewing(false);
    }
  };
  const saveLutId = current ? (previewLutId ?? current.lutId ?? (current.lut ? luts.find((lut) => lut.name === current.lut)?.id : 'off')) : undefined;
  const saveLut = async () => {
    if (!current || !onRender || !saveLutId || saving || previewing) return;
    setSaving(true);
    try { await onRender(current.id, saveLutId); clearPreview(); setLutOpen(false); }
    catch { /* App surfaces the native error and rethrows. */ }
    finally { setSaving(false); }
  };
  const shownUri = (moment: MomentItem, active: boolean) => {
    if (!active) return moment.imageUri;
    if (previewLutId === 'off') return moment.originalUri || moment.imageUri;
    if (previewUri) return previewUri;
    return moment.imageUri;
  };
  const activeLutName = previewLutId === undefined ? (current?.lut || null) : previewLutId === 'off' ? null : (luts.find((lut) => lut.id === previewLutId)?.name || previewLutId);

  const renderPage = (moment: MomentItem | undefined, active: boolean, slot: string) => <View key={moment?.id || slot} style={{width: pageWidth, height: pageHeight}}>
    {moment && <>
      {!!shownUri(moment, active) && <Animated.Image testID={active ? 'album-photo' : undefined} source={{uri: shownUri(moment, active)}} style={active ? [styles.media, {opacity: imageOpacity, transform}] : styles.media} resizeMode="contain"/>}
      {active && hasMotion(moment) && <Animated.View pointerEvents="none" style={[styles.videoLayer, {opacity: videoOpacity, transform}]}>
        <Video key={moment.id} ref={videoRef} source={{uri: moment.videoUri}} style={styles.media} resizeMode="contain" paused={!playing} repeat={false} muted={false}
          onLoad={() => { if (playingRef.current) videoRef.current?.seek(0); }}
          onReadyForDisplay={() => { videoReadyRef.current = true; if (playingRef.current) fadeToVideo(); }}
          onEnd={() => { stopPlayback(); fadeToImage(); }}
          onError={() => { stopPlayback(); fadeToImage(); }}/>
      </Animated.View>}
    </>}
  </View>;

  const grid = <View style={styles.fill}>
    <View style={styles.gridHeader}><CameraControl icon="back" accessibilityLabel="返回拍照页面" onPress={onBack}/><Text style={styles.headerTitle}>相册</Text><View style={styles.headerSpacer}/></View>
    {moments.length === 0 ? <View style={styles.empty}><Text variant="titleLarge">还没有照片</Text></View> : <FlatList
      key={columns} testID="album-grid" data={moments} numColumns={columns} keyExtractor={(moment) => moment.id} initialNumToRender={12}
      contentContainerStyle={styles.grid} renderItem={({item}) => <Pressable accessibilityRole="button" accessibilityLabel={`打开${item.source || '照片'}`} onPress={() => { setChrome(true); setViewerId(item.id); }} style={[styles.cell, {width: Math.floor(pageWidth / columns), height: Math.floor(pageWidth / columns)}]}>
        {item.imageUri ? <Image source={{uri: item.imageUri}} style={styles.thumb}/> : <View style={[styles.thumb, styles.thumbEmpty]}/>}
        <View style={styles.cellTop}>{!item.complete && <Text style={styles.chip}>{item.error ? '失败' : '未完成'}</Text>}<Text style={styles.chip}>{momentOrigin(item)}</Text></View>
        {hasMotion(item) && <Text maxFontSizeMultiplier={1.3} style={styles.live}>LIVE</Text>}
        {!!item.error && <Text numberOfLines={2} style={styles.cellError}>{item.error}</Text>}
        {item.experimentalWifi && <ExperimentalWifiBadge state={{transport: 'wifi'}}/>}
      </Pressable>}/>}
  </View>;

  const viewer = current && <View style={styles.fill} testID="motion-viewer">
    <GestureDetector gesture={gesture}><View testID="album-pager" style={styles.viewport} accessibilityRole="button" accessibilityState={{selected: zoomed}} accessibilityLabel={hasMotion(current) ? '单击显示或隐藏操作，双指缩放查看动态照片' : '单击显示或隐藏操作，双指缩放查看照片'} onAccessibilityTap={() => setChrome((value) => !value)}>
      <Animated.View style={[styles.row, {width: pageWidth * 3, transform: [{translateX: rowX}]}]}>
        {renderPage(moments[index - 1], false, 'previous')}
        {renderPage(current, true, 'current')}
        {renderPage(moments[index + 1], false, 'next')}
      </Animated.View>
    </View></GestureDetector>
    {!chrome && <View pointerEvents="none" style={styles.indexWrap}><Text testID="album-index" style={styles.index}>{`${index + 1} / ${moments.length}`}</Text></View>}
    {chrome && <View style={styles.topCard}>
      <View style={styles.topRow}>
        <CameraControl icon="back" accessibilityLabel="返回网格" onPress={() => setViewerId(null)}/>
        <View style={styles.topCopy}>
          <Text testID="album-index" style={styles.index}>{`${index + 1} / ${moments.length}`}</Text>
          <Text numberOfLines={1} style={styles.headerTitle}>{`${momentOrigin(current)} · ${momentTransport(current.transport, current.demo)}`}</Text>
          <Text numberOfLines={1} style={styles.date}>{current.source || '照片'}</Text>
          <Text numberOfLines={1} style={styles.date}>{current.lut || '原色'} · {formatMomentDate(current.createdAt)}</Text>
        </View>
      </View>
      {current.experimentalWifi && <ExperimentalWifiBadge state={{transport: 'wifi'}}/>}
      {!!current.error && <Text accessibilityLiveRegion="polite" style={styles.error}>{current.error}</Text>}
    </View>}
    {chrome && <View style={styles.bottomCard}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actions}>
        <CameraControl icon="info" label="信息" accessibilityLabel="照片信息" onPress={() => { setLutOpen(false); setInfoOpen(true); }}/>
        {hasMotion(current) && <CameraControl icon="play" label={playing ? '停止' : '播放'} accessibilityLabel={playing ? '停止播放' : '播放动态照片'} onPress={togglePlay}/>}
        <CameraControl icon="lut" label="LUT" accessibilityLabel="更换 LUT" onPress={() => { setInfoOpen(false); setLutOpen(true); }}/>
        {!!onShare && <CameraControl icon="share" label="分享" accessibilityLabel="分享照片" onPress={share}/>}
        {canExport(current) && <CameraControl icon="save" label="保存" accessibilityLabel={current.complete ? '保存到系统相册' : '保存原片到系统相册'} onPress={() => { void onExport(current.id); }}/>}
        <CameraControl icon="delete" label="删除" destructive accessibilityLabel="删除照片" onPress={() => askDelete(current.id)}/>
      </ScrollView>
    </View>}
    <CameraSheet visible={lutOpen} title="更换 LUT" anchor="bottom" onClose={() => { clearPreview(); setLutOpen(false); }} footer={<View style={styles.lutFooter}>
      <Text style={styles.date}>从原片重新生成，不修改 original.jpg。动态视频本身不会重新调色。</Text>
      {current.captureMode !== 'photo' && <Text style={styles.date}>实况文件会用新的静态图重新封装，视频片段保持原样。</Text>}
      <Button mode="contained" buttonColor={ui.color.accent} textColor={ui.color.background} accessibilityLabel="从原片重新套用 LUT" disabled={!onRender || !saveLutId || saving || previewing} onPress={() => { void saveLut(); }}>{saving ? '正在保存' : '保存'}</Button>
    </View>}>
      <LutPresetList luts={luts} compact activeName={activeLutName} disabled={saving || previewing} onSelect={selectLut}/>
    </CameraSheet>
    <CameraSheet visible={infoOpen} title="照片信息" onClose={() => setInfoOpen(false)}>
      {details === undefined && <Text style={styles.date}>正在读取照片信息</Text>}
      {details === null && <Text style={styles.error}>无法读取照片信息</Text>}
      {details && <>
        <InfoLine label="来源" value={details.origin}/>
        <InfoLine label="连接" value={details.transport}/>
        <InfoLine label="机身文件" value={details.cameraFile || (current.demo ? '演示素材不在机身 SD 卡' : '—')}/>
        <InfoLine label="拍摄时间" value={formatMomentDateTime(details.capturedAt)}/>
        <InfoLine label="机型" value={details.camera || '—'}/>
        <InfoLine label="镜头" value={details.lens || '—'}/>
        <InfoLine label="ISO" value={details.iso || '—'}/>
        <InfoLine label="快门" value={details.shutter || '—'}/>
        <InfoLine label="光圈" value={details.aperture || '—'}/>
        <InfoLine label="焦距" value={details.focalLength || '—'}/>
        <InfoLine label="尺寸" value={formatDimensions(details.width, details.height)}/>
        <InfoLine label="LUT" value={details.lut ? `${details.lut}${details.lutApplied ? '' : '（未成功套用）'}` : '原色'}/>
        <InfoLine label="App 内目录" value={details.directory} selectable/>
        <InfoLine label="系统相册" value={!details.exportKnown ? '无法确认系统相册' : details.exported ? `已导出 · ${details.exportPath || 'DCIM/MomentS5'}` : '未导出到系统相册'} selectable={!!details.exportPath}/>
        {details.files.map((file) => <InfoLine key={file.name} label={fileLabel(file.name)} value={formatBytes(file.bytes)}/>)}
      </>}
    </CameraSheet>
  </View>;

  return <View style={styles.root} onLayout={(event) => { const {width, height} = event.nativeEvent.layout; if (width > 0 && height > 0) setFrame((prev) => prev.width === width && prev.height === height ? prev : {width, height}); }}>
    {viewer || grid}
  </View>;
}

function InfoLine({label, value, selectable = false}: {label: string; value: string; selectable?: boolean}) {
  return <View style={styles.infoLine}><Text style={styles.infoLabel}>{label}</Text><Text selectable={selectable} style={styles.infoValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: ui.color.background}, fill: {flex: 1},
  empty: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: ui.space.md, padding: ui.space.lg},
  gridHeader: {minHeight: 64, paddingHorizontal: ui.space.gutter, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'},
  headerTitle: {...ui.type.title, color: ui.color.text, flexShrink: 1}, headerSpacer: {width: ui.icon.touch},
  grid: {paddingBottom: ui.space.lg},
  cell: {padding: 1}, thumb: {flex: 1, backgroundColor: ui.color.surface}, thumbEmpty: {borderWidth: 1, borderColor: ui.color.outline},
  cellTop: {position: 'absolute', top: ui.space.xs, left: ui.space.xs, right: ui.space.xs, flexDirection: 'row', gap: ui.space.xs, flexWrap: 'wrap'},
  chip: {...ui.type.label, color: ui.color.text, backgroundColor: ui.color.badge, paddingHorizontal: ui.space.xs, borderRadius: ui.space.xs, overflow: 'hidden'},
  live: {position: 'absolute', left: ui.space.sm, bottom: ui.space.sm, ...ui.type.label, color: ui.color.text, backgroundColor: ui.color.badge, paddingHorizontal: ui.space.xs, borderRadius: ui.space.xs, overflow: 'hidden'},
  cellError: {position: 'absolute', left: ui.space.xs, right: ui.space.xs, bottom: ui.space.xs, ...ui.type.caption, color: ui.color.destructive},
  viewport: {flex: 1, overflow: 'hidden', backgroundColor: '#000'},
  row: {flexDirection: 'row', height: '100%'},
  media: {width: '100%', height: '100%'}, videoLayer: {...StyleSheet.absoluteFillObject},
  indexWrap: {position: 'absolute', top: ui.space.sm, left: 0, right: 0, alignItems: 'center'},
  index: {...ui.type.label, color: ui.color.text, backgroundColor: ui.color.badge, paddingHorizontal: ui.space.sm, paddingVertical: ui.space.xs, borderRadius: ui.radius.pill, overflow: 'hidden'},
  topCard: {position: 'absolute', top: ui.space.xl, left: ui.space.gutter, right: ui.space.gutter, gap: ui.space.sm, padding: ui.space.sm, borderRadius: ui.radius.sheet, backgroundColor: ui.color.badge, borderWidth: 1, borderColor: ui.color.outline},
  topRow: {flexDirection: 'row', alignItems: 'center', gap: ui.space.sm}, topCopy: {flex: 1, minWidth: 0, gap: ui.space.xs},
  date: {...ui.type.caption, color: ui.color.muted}, error: {...ui.type.caption, color: ui.color.destructive},
  bottomCard: {position: 'absolute', left: ui.space.gutter, right: ui.space.gutter, bottom: ui.space.gutter, borderRadius: ui.radius.sheet, backgroundColor: ui.color.badge, borderWidth: 1, borderColor: ui.color.outline},
  actions: {flexDirection: 'row', alignItems: 'center', gap: ui.space.xs, paddingHorizontal: ui.space.sm},
  lutFooter: {gap: ui.space.sm},
  infoLine: {gap: ui.space.xs, paddingVertical: ui.space.xs}, infoLabel: {...ui.type.caption, color: ui.color.muted}, infoValue: {...ui.type.body, color: ui.color.text},
});
