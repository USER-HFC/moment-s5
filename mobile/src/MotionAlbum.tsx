import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Alert, Animated, AppState, BackHandler, Image, Pressable, ScrollView, SectionList, StatusBar, StyleSheet, View} from 'react-native';
import {Button, Text} from 'react-native-paper';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Video, {VideoRef} from 'react-native-video';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import {LutItem, MomentDetails, MomentItem} from './native';
import {ui} from './theme';
import CameraControl from './CameraControl';
import CameraIcon from './CameraIcon';
import AlbumSheet from './AlbumSheet';
import LutFilmstrip from './LutFilmstrip';
import PhotoInfo from './PhotoInfo';
import {ALBUM_FILTERS, AlbumFilter, albumFilterCounts, albumFilterEmpty, batchResultMessage, formatCaptureTitle, groupMomentsByDay, matchesAlbumFilter, momentSummary, shareDialogTitle, shareKindLabel, shareKinds, shareOptionHint, shareOptionLabel, viewerDismissPastThreshold} from './albumFormat';

type Props = {
  moments: MomentItem[];
  luts?: LutItem[];
  /** Open the viewer on this photo once it is in `moments`. Omitted keeps the grid. */
  initialMomentId?: string | null;
  onInitialMomentHandled?: () => void;
  onBack: () => void;
  /** Batch work passes quiet so the album can report one total instead of one notice per photo. */
  onExport: (id: string, quiet?: boolean) => Promise<void>;
  onDelete: (id: string, quiet?: boolean) => Promise<void>;
  onNotice?: (message: string) => void;
  onRender?: (id: string, lutId: string) => Promise<unknown>;
  onPreview?: (id: string, lutId: string) => Promise<string | null>;
  onThumbnail?: (id: string, lutId: string) => Promise<string | null>;
  onDetails?: (id: string) => Promise<MomentDetails>;
  onShare?: (id: string, kind: string) => Promise<void>;
};

const hasMotion = (moment: MomentItem) => moment.captureMode !== 'photo' && !!moment.videoUri && moment.complete;
const canExport = (moment: MomentItem) => moment.complete || (moment.captureMode === 'photo' && !!moment.imageUri);

function chunk<T>(items: T[], size: number) {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += size) rows.push(items.slice(i, i + size));
  return rows;
}

function Gradient({top}: {top: boolean}) {
  const id = top ? 'album-fade-top' : 'album-fade-bottom';
  return <Svg pointerEvents="none" width="100%" height="100%" style={StyleSheet.absoluteFill}>
    <Defs><LinearGradient id={id} x1="0" y1={top ? '0' : '1'} x2="0" y2={top ? '1' : '0'}>
      <Stop offset="0" stopColor="#000000" stopOpacity="0.78"/>
      <Stop offset="1" stopColor="#000000" stopOpacity="0"/>
    </LinearGradient></Defs>
    <Rect width="100%" height="100%" fill={`url(#${id})`}/>
  </Svg>;
}

export default function MotionAlbum({moments, luts = [], initialMomentId = null, onInitialMomentHandled, onBack, onExport, onDelete, onNotice, onRender, onPreview, onThumbnail, onDetails, onShare}: Props) {
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
  const [compareOriginal, setCompareOriginal] = useState(false);
  const [details, setDetails] = useState<MomentDetails | null | undefined>(undefined);
  const [albumFilter, setAlbumFilter] = useState<AlbumFilter>('all');
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const [shareOpen, setShareOpen] = useState(false);
  const [batching, setBatching] = useState(false);
  const [thumbs, setThumbs] = useState<Record<string, string | undefined>>({});
  const [mediaAspect, setMediaAspect] = useState<number | null>(null);
  const viewerIdRef = useRef<string | null>(null);
  const playingRef = useRef(false);
  const videoReadyRef = useRef(false);
  const zoomedRef = useRef(false);
  const chromeRef = useRef(true);
  const pinching = useRef(false);
  const scaleRef = useRef(1);
  const pinchStart = useRef(1);
  const txRef = useRef(0);
  const tyRef = useRef(0);
  const panStart = useRef({x: 0, y: 0});
  const previewToken = useRef(0);
  const thumbToken = useRef(0);
  const thumbCache = useRef(new Map<string, string>());
  const indexRef = useRef(0);
  const appliedInitial = useRef<string | null>(null);
  const selectingRef = useRef(false);
  const sheetOpenRef = useRef(false);
  const pageHeightRef = useRef(640);
  const videoRef = useRef<VideoRef>(null);
  const imageOpacity = useRef(new Animated.Value(1)).current;
  const videoOpacity = useRef(new Animated.Value(0)).current;
  const chromeOpacity = useRef(new Animated.Value(1)).current;
  const zoom = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const dragX = useRef(new Animated.Value(0)).current;
  const dismissY = useRef(new Animated.Value(0)).current;
  const dismissOpacity = useRef(new Animated.Value(1)).current;
  const baseX = useRef(new Animated.Value(0)).current;
  const rowX = useRef(Animated.add(dragX, baseX)).current;
  const pageWidth = frame.width || 360;
  const pageHeight = frame.height || 640;
  const landscape = frame.width > frame.height;
  const columns = pageWidth >= 900 ? 5 : pageWidth >= 600 ? 4 : 3;
  const topBarHeight = landscape ? 58 : 88;
  const bottomBarHeight = landscape ? 60 : 78;
  const current = moments.find((moment) => moment.id === viewerId) || null;
  const index = Math.max(0, moments.findIndex((moment) => moment.id === viewerId));
  const savedLutId = current ? current.lutId || (current.lut ? luts.find((lut) => lut.name === current.lut)?.id : null) || null : null;
  const selectedLutId = previewLutId ?? savedLutId ?? 'off';
  const counts = useMemo(() => albumFilterCounts(moments), [moments]);
  const filtered = useMemo(() => moments.filter((moment) => matchesAlbumFilter(moment, albumFilter)), [moments, albumFilter]);
  const sections = useMemo(() => groupMomentsByDay(filtered).map((section) => ({...section, data: chunk(section.moments, columns)})), [filtered, columns]);
  const visibleIds = useMemo(() => filtered.map((moment) => moment.id), [filtered]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const emptyCopy = albumFilterEmpty(albumFilter);
  // The photo is letterboxed; overlays such as LIVE belong to the image, not the black bars.
  const mediaBox = useMemo(() => {
    if (!mediaAspect) return {left: 0, top: 0, width: pageWidth, height: pageHeight};
    let width = pageWidth, height = pageWidth / mediaAspect;
    if (height > pageHeight) { height = pageHeight; width = pageHeight * mediaAspect; }
    return {left: (pageWidth - width) / 2, top: (pageHeight - height) / 2, width, height};
  }, [mediaAspect, pageWidth, pageHeight]);
  const mediaTop = Math.max(mediaBox.top, chrome ? topBarHeight : 0) + 8;
  viewerIdRef.current = viewerId;
  chromeRef.current = chrome;
  indexRef.current = current ? index : 0;
  selectingRef.current = selecting;
  sheetOpenRef.current = lutOpen || infoOpen || shareOpen;
  pageHeightRef.current = pageHeight;

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
  const fadeChrome = useCallback((visible: boolean) => {
    setChrome(visible);
    if (chromeRef.current === visible) { chromeOpacity.setValue(visible ? 1 : 0); return; }
    Animated.timing(chromeOpacity, {toValue: visible ? 1 : 0, duration: 180, useNativeDriver: true}).start();
  }, [chromeOpacity]);
  const clearPreview = useCallback(() => {
    previewToken.current += 1;
    setPreviewLutId(undefined);
    setPreviewUri(null);
    setPreviewing(false);
    setCompareOriginal(false);
  }, []);
  const stopPlayback = useCallback(() => {
    playingRef.current = false;
    setPlaying(false);
    imageOpacity.setValue(1);
    videoOpacity.setValue(0);
  }, [imageOpacity, videoOpacity]);
  const closeViewer = () => { setViewerId(null); fadeChrome(true); };
  const openViewer = (id: string) => { fadeChrome(true); setViewerId(id); };
  const closeLut = useCallback(() => { clearPreview(); setLutOpen(false); }, [clearPreview]);

  useEffect(() => { baseX.setValue(-pageWidth); }, [baseX, pageWidth]);
  useEffect(() => {
    if (!initialMomentId || appliedInitial.current === initialMomentId) return;
    if (!moments.some((moment) => moment.id === initialMomentId)) return;
    appliedInitial.current = initialMomentId;
    setViewerId(initialMomentId);
    onInitialMomentHandled?.();
  }, [initialMomentId, moments, onInitialMomentHandled]);
  const mounted = useRef(false);
  useEffect(() => {
    if (!mounted.current) { mounted.current = true; return; }
    videoReadyRef.current = false;
    stopPlayback();
    resetZoom();
    clearPreview();
    setLutOpen(false);
    setInfoOpen(false);
    setShareOpen(false);
    setDetails(undefined);
    setMediaAspect(null);
    dismissY.setValue(0);
    dismissOpacity.setValue(1);
  }, [viewerId, stopPlayback, resetZoom, clearPreview, dismissY, dismissOpacity]);
  useEffect(() => {
    if (viewerId && !moments.some((moment) => moment.id === viewerId)) setViewerId(moments[0]?.id ?? null);
  }, [moments, viewerId]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => { if (next !== 'active') stopPlayback(); });
    return () => { sub.remove(); imageOpacity.stopAnimation(); videoOpacity.stopAnimation(); chromeOpacity.stopAnimation(); };
  }, [imageOpacity, stopPlayback, videoOpacity, chromeOpacity]);
  useEffect(() => {
    const ids = new Set(moments.map((moment) => moment.id));
    setSelected((prev) => {
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (ids.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [moments]);
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (shareOpen) { setShareOpen(false); return true; }
      if (infoOpen) { setInfoOpen(false); return true; }
      if (lutOpen) { closeLut(); return true; }
      if (viewerIdRef.current) {
        if (!chromeRef.current) { fadeChrome(true); return true; }
        setViewerId(null);
        return true;
      }
      if (selectingRef.current) {
        setSelecting(false);
        setSelected(new Set());
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [shareOpen, infoOpen, lutOpen, closeLut, fadeChrome]);
  useEffect(() => {
    if (!infoOpen || !viewerId || !onDetails) return undefined;
    let live = true;
    setDetails(undefined);
    onDetails(viewerId).then((next) => { if (live) setDetails(next); }).catch(() => { if (live) setDetails(null); });
    return () => { live = false; };
  }, [infoOpen, viewerId, onDetails]);
  useEffect(() => {
    if (!lutOpen || !current) return;
    const token = ++thumbToken.current;
    const momentId = current.id;
    const original = current.originalUri || current.imageUri;
    const seeded: Record<string, string | undefined> = {off: original};
    for (const lut of luts) seeded[lut.id] = thumbCache.current.get(`${momentId}:${lut.id}`);
    setThumbs(seeded);
    if (!onThumbnail) return;
    for (const lut of luts) {
      const key = `${momentId}:${lut.id}`;
      if (thumbCache.current.has(key)) continue;
      onThumbnail(momentId, lut.id).then((uri) => {
        if (!uri) return;
        thumbCache.current.set(key, uri);
        if (token === thumbToken.current) setThumbs((previous) => ({...previous, [lut.id]: uri}));
      }).catch(() => { /* A LUT that cannot render keeps its swatch placeholder. */ });
    }
  }, [lutOpen, current, luts, onThumbnail]);

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
  const playMotion = () => {
    if (!current || !hasMotion(current)) return;
    resetZoom();
    playingRef.current = true;
    setPlaying(true);
    if (videoReadyRef.current) { videoRef.current?.seek(0); fadeToVideo(); }
  };
  const togglePlay = () => {
    if (!current || !hasMotion(current)) return;
    if (playingRef.current) { stopPlayback(); fadeToImage(); return; }
    playMotion();
  };
  const toggleZoom = () => {
    if (zoomedRef.current || scaleRef.current >= 1.05) { resetZoom(); return; }
    scaleRef.current = 2.5;
    zoomedRef.current = true;
    setZoomed(true);
    Animated.spring(zoom, {toValue: 2.5, useNativeDriver: true, damping: 20, stiffness: 220}).start();
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
  const doubleTap = Gesture.Tap().runOnJS(true).numberOfTaps(2).maxDistance(24).onEnd((_event, success) => {
    if (success) toggleZoom();
  });
  const singleTap = Gesture.Tap().runOnJS(true).maxDistance(24).maxDuration(280).onEnd((_event, success) => {
    if (success) fadeChrome(!chromeRef.current);
  });
  const longPress = Gesture.LongPress().runOnJS(true).minDuration(380).onStart(() => {
    if (lutOpen) setCompareOriginal(true);
    else if (!playingRef.current) playMotion();
  }).onEnd(() => setCompareOriginal(false)).onFinalize(() => setCompareOriginal(false));
  const setDismiss = (y: number) => {
    const next = Math.max(0, y);
    dismissY.setValue(next);
    const height = Math.max(pageHeightRef.current, 1);
    dismissOpacity.setValue(Math.max(0.4, 1 - next / height));
  };
  const springDismissBack = () => {
    Animated.parallel([
      Animated.spring(dismissY, {toValue: 0, useNativeDriver: true, damping: 22, stiffness: 240}),
      Animated.spring(dismissOpacity, {toValue: 1, useNativeDriver: true, damping: 22, stiffness: 240}),
    ]).start();
  };
  const dismissBlocked = () => zoomedRef.current || scaleRef.current >= 1.05 || pinching.current || sheetOpenRef.current;
  // Downward drag follows the finger and closes the viewer. A zoomed photo keeps this gesture from activating.
  const dismissPan = Gesture.Pan().runOnJS(true).enabled(!zoomed && !lutOpen && !infoOpen && !shareOpen).activeOffsetY([-10000, 28]).failOffsetX([-32, 32]).onUpdate((event) => {
    if (dismissBlocked()) return;
    setDismiss(event.translationY);
  }).onEnd((event) => {
    if (dismissBlocked()) { springDismissBack(); return; }
    const y = Math.max(0, event.translationY);
    if (!viewerDismissPastThreshold(y, event.velocityY || 0, pageHeightRef.current)) { springDismissBack(); return; }
    const height = Math.max(pageHeightRef.current, 1);
    Animated.parallel([
      Animated.timing(dismissY, {toValue: height, duration: 180, useNativeDriver: true}),
      Animated.timing(dismissOpacity, {toValue: 0, duration: 180, useNativeDriver: true}),
    ]).start((result) => {
      if (result && result.finished === false) { springDismissBack(); return; }
      dismissY.setValue(0);
      dismissOpacity.setValue(1);
      setViewerId(null);
    });
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
  const gesture = Gesture.Simultaneous(pinch, longPress, Gesture.Race(dismissPan, pan, Gesture.Exclusive(doubleTap, singleTap)));
  const transform = [{translateX}, {translateY}, {scale: zoom}];

  const askDelete = (id: string) => Alert.alert('删除这张照片？', '只删除 App 内副本；相机 SD 卡原片和已导出到系统相册的副本会保留。', [
    {text: '取消', style: 'cancel'}, {text: '删除', style: 'destructive', onPress: () => { void onDelete(id); }},
  ]);
  const exitSelection = () => { setSelecting(false); setSelected(new Set()); };
  const toggleSelected = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const beginSelection = (id: string) => { setSelecting(true); setSelected(new Set([id])); };
  const selectAllVisible = () => { setSelected(allVisibleSelected ? new Set() : new Set(visibleIds)); };
  const runBatch = async (verb: '导出' | '删除', run: (id: string) => Promise<void>) => {
    if (batching || selected.size === 0) return;
    const ids = [...selected];
    setBatching(true);
    let ok = 0;
    let failed = 0;
    for (const id of ids) {
      try { await run(id); ok += 1; }
      catch { failed += 1; }
    }
    onNotice?.(batchResultMessage(verb, ok, failed));
    setBatching(false);
    exitSelection();
  };
  const confirmBatchDelete = () => {
    if (batching || selected.size === 0) return;
    Alert.alert(`删除 ${selected.size} 张照片？`, '只删除 App 内副本，机身 SD 卡和系统相册里的照片不受影响。', [
      {text: '取消', style: 'cancel'},
      {text: '删除', style: 'destructive', onPress: () => runBatch('删除', (id) => onDelete(id, true))},
    ]);
  };
  // The system dialog keeps only three buttons, which hid 「分享动态照片」 and 「取消」.
  const share = () => { if (current && onShare) setShareOpen(true); };
  const selectLut = async (id: string) => {
    if (!current) return;
    const token = ++previewToken.current;
    setPreviewLutId(id);
    setCompareOriginal(false);
    if (id === 'off' || !onPreview) { setPreviewUri(null); setPreviewing(false); return; }
    setPreviewUri(thumbs[id] || null);
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
  const saveLutId = previewLutId ?? savedLutId ?? 'off';
  const saveLut = async () => {
    if (!current || !onRender || !saveLutId || saving || previewing) return;
    setSaving(true);
    try {
      await onRender(current.id, saveLutId);
      closeLut();
    } catch { /* App surfaces the native error and rethrows. */ }
    finally { setSaving(false); }
  };
  const openLut = () => {
    if (!current) return;
    stopPlayback();
    setInfoOpen(false);
    setShareOpen(false);
    clearPreview();
    setLutOpen(true);
  };
  const openInfo = () => {
    if (!current) return;
    stopPlayback();
    setLutOpen(false);
    setShareOpen(false);
    clearPreview();
    setInfoOpen(true);
  };
  const shownUri = (moment: MomentItem, active: boolean) => {
    if (!active) return moment.imageUri;
    if (lutOpen && compareOriginal) return moment.originalUri || moment.imageUri;
    if (previewLutId === 'off') return moment.originalUri || moment.imageUri;
    if (previewUri) return previewUri;
    return moment.imageUri;
  };

  const renderPage = (moment: MomentItem | undefined, active: boolean, slot: string) => <View key={moment?.id || slot} style={{width: pageWidth, height: pageHeight}}>
    {moment && <>
      {!!shownUri(moment, active) && <Animated.Image testID={active ? 'album-photo' : undefined} source={{uri: shownUri(moment, active)}} style={active ? [styles.media, {opacity: imageOpacity, transform}] : styles.media} resizeMode="contain"
        onLoad={active ? (event) => { const {width, height} = event.nativeEvent.source; if (width > 0 && height > 0) setMediaAspect(width / height); } : undefined}/>}
      {active && hasMotion(moment) && <Animated.View pointerEvents="none" style={[styles.videoLayer, {opacity: videoOpacity, transform}]}>
        <Video key={moment.id} ref={videoRef} source={{uri: moment.videoUri}} style={styles.media} resizeMode="contain" paused={!playing} repeat={false} muted={false}
          onLoad={() => { if (playingRef.current) videoRef.current?.seek(0); }}
          onReadyForDisplay={() => { videoReadyRef.current = true; if (playingRef.current) fadeToVideo(); }}
          onEnd={() => { stopPlayback(); fadeToImage(); }}
          onError={() => { stopPlayback(); fadeToImage(); }}/>
      </Animated.View>}
    </>}
  </View>;

  const grid = <View style={styles.fill} pointerEvents={current ? 'none' : 'auto'} accessibilityElementsHidden={!!current} importantForAccessibility={current ? 'no-hide-descendants' : 'auto'}>
    {selecting ? <View testID="album-select-bar" style={styles.gridHeader}>
      <Pressable accessibilityRole="button" accessibilityLabel="取消选择" onPress={exitSelection} style={styles.headerAction}>
        <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.headerActionLabel}>取消</Text>
      </Pressable>
      <Text testID="album-selected-count" numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.headerCount}>{`已选 ${selected.size}`}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={allVisibleSelected ? '取消全选' : '全选'} onPress={selectAllVisible} style={styles.headerAction}>
        <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.headerActionLabel}>{allVisibleSelected ? '取消全选' : '全选'}</Text>
      </Pressable>
    </View> : <View style={styles.gridHeader}>
      <CameraControl icon="back" accessibilityLabel="返回拍照页面" onPress={onBack}/>
      <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.headerTitle}>相册</Text>
      <View style={styles.headerSpacer}/>
    </View>}
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.filterScroll} contentContainerStyle={styles.filters} testID="album-filters">
      {ALBUM_FILTERS.map((filter) => {
        const on = filter.id === albumFilter;
        const count = counts[filter.id];
        return <Pressable key={filter.id} testID={`album-filter-${filter.id}`} accessibilityRole="button" accessibilityState={{selected: on}} accessibilityLabel={`${filter.label} ${count}`} onPress={() => setAlbumFilter(filter.id)} style={[styles.filterChip, on && styles.filterChipOn]}>
          <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.filterLabel, on && styles.filterLabelOn]}>{`${filter.label} ${count}`}</Text>
        </Pressable>;
      })}
    </ScrollView>
    {filtered.length === 0 ? <View style={styles.empty} testID="album-empty">
      <Text variant="titleLarge" style={styles.emptyTitle}>{emptyCopy.title}</Text>
      <Text style={styles.emptyCopy}>{emptyCopy.body}</Text>
      {moments.length === 0 && <Button mode="contained" buttonColor={ui.color.accent} textColor={ui.color.background} contentStyle={styles.touch} accessibilityLabel="去拍摄" onPress={onBack}>去拍摄</Button>}
    </View> : <SectionList
      testID="album-grid"
      style={styles.gridList}
      sections={sections}
      extraData={`${selecting}:${albumFilter}:${[...selected].join(',')}`}
      keyExtractor={(row) => row.map((moment) => moment.id).join('|')}
      initialNumToRender={8}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={styles.grid}
      renderSectionHeader={({section}) => <Text style={styles.sectionHeader}>{section.title}</Text>}
      renderItem={({item: row}) => <View style={styles.gridRow}>
        {row.map((item) => {
          const name = item.source || '照片';
          const chosen = selected.has(item.id);
          return <Pressable key={item.id} accessibilityRole="button" accessibilityLabel={selecting ? `选择${name}` : `打开${name}`} accessibilityState={selecting ? {selected: chosen} : undefined} onPress={() => { if (selecting) toggleSelected(item.id); else openViewer(item.id); }} onLongPress={() => { if (selecting) toggleSelected(item.id); else beginSelection(item.id); }} style={[styles.cell, {width: Math.floor(pageWidth / columns), height: Math.floor(pageWidth / columns)}]}>
            {item.imageUri ? <Image source={{uri: item.imageUri}} style={styles.thumb}/> : <View style={[styles.thumb, styles.thumbEmpty]}/>}
            {selecting && chosen && <View pointerEvents="none" style={styles.selectedFrame}/>}
            <View style={styles.cellTop}>
              {selecting && <View style={[styles.selectMark, chosen && styles.selectMarkOn]}>{chosen && <Text style={styles.selectGlyph}>✓</Text>}</View>}
              {!item.complete && <Text style={styles.statusMark}>{item.error ? '失败' : '未完成'}</Text>}
            </View>
            <View style={styles.cellMarks}>
              {item.cameraTriggered && !item.demo && <View style={styles.mark}><CameraIcon name="camera" size={13}/></View>}
              {item.experimentalWifi && <View style={styles.mark} testID="experimental-wifi-badge"><CameraIcon name="wifi" size={13}/></View>}
            </View>
            {hasMotion(item) && <Text maxFontSizeMultiplier={1.3} style={styles.live}>LIVE</Text>}
            <View style={styles.cellBottomRight}>
              {!!item.lut && <View style={styles.lutDot}/>}
              {item.demo && <Text style={styles.demoMark}>演示</Text>}
            </View>
            {!!item.error && <Text numberOfLines={2} style={styles.cellError}>{item.error}</Text>}
          </Pressable>;
        })}
      </View>}
    />}
    {selecting && <View testID="album-batch-bar" style={styles.batchBar}>
      <Pressable accessibilityRole="button" accessibilityLabel="批量导出" accessibilityState={{disabled: selected.size === 0 || batching}} disabled={selected.size === 0 || batching} onPress={() => runBatch('导出', (id) => onExport(id, true))} style={[styles.batchButton, (selected.size === 0 || batching) && styles.batchDisabled]}>
        <CameraIcon name="save"/>
        <Text maxFontSizeMultiplier={1.3} style={styles.batchLabel}>批量导出</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="批量删除" accessibilityState={{disabled: selected.size === 0 || batching}} disabled={selected.size === 0 || batching} onPress={confirmBatchDelete} style={[styles.batchButton, (selected.size === 0 || batching) && styles.batchDisabled]}>
        <CameraIcon name="delete" destructive/>
        <Text maxFontSizeMultiplier={1.3} style={styles.batchLabelDestructive}>批量删除</Text>
      </Pressable>
    </View>}
  </View>;

  const viewer = current && <View style={styles.viewer} testID="motion-viewer">
    <StatusBar hidden={!chrome} animated/>
    <GestureDetector gesture={gesture}><View style={styles.fill}>
      <Animated.View testID="album-dismiss-layer" style={[styles.fill, {opacity: dismissOpacity, transform: [{translateY: dismissY}]}]}>
        <View testID="album-pager" style={styles.viewport} accessibilityRole="button" accessibilityState={{selected: zoomed}} accessibilityHint={hasMotion(current) ? '单击切换沉浸模式，双击缩放，长按播放动态照片' : '单击切换沉浸模式，双击缩放'} accessibilityLabel={hasMotion(current) ? '单击显示或隐藏操作，双指缩放查看动态照片' : '单击显示或隐藏操作，双指缩放查看照片'} onAccessibilityTap={() => fadeChrome(!chromeRef.current)}>
          <Animated.View style={[styles.row, {width: pageWidth * 3, transform: [{translateX: rowX}]}]}>
            {renderPage(moments[index - 1], false, 'previous')}
            {renderPage(current, true, 'current')}
            {renderPage(moments[index + 1], false, 'next')}
          </Animated.View>
        </View>
        {hasMotion(current) && <Pressable testID="album-live-badge" accessibilityRole="button" accessibilityLabel="播放 LIVE" accessibilityHint="也可以长按照片播放" accessibilityState={{selected: playing}} onPress={playMotion} style={[styles.liveButton, {left: mediaBox.left + 4, top: mediaTop}]}>
          <Text maxFontSizeMultiplier={1.3} style={styles.liveBadge}>LIVE</Text>
        </Pressable>}
        {compareOriginal && <View pointerEvents="none" style={[styles.compareMark, {top: mediaTop}]}><Text style={styles.compareText}>原片</Text></View>}
    <Animated.View testID="album-top-bar" pointerEvents={chrome ? 'auto' : 'none'} accessibilityElementsHidden={!chrome} importantForAccessibility={chrome ? 'auto' : 'no-hide-descendants'} style={[styles.topBar, {height: topBarHeight, opacity: chromeOpacity}]}>
      <Gradient top/>
      <View style={styles.topRow}>
        <CameraControl icon="back" accessibilityLabel="返回网格" onPress={closeViewer}/>
        <View style={styles.topCopy}>
          <Text testID="album-title" numberOfLines={1} style={styles.viewerTitle}>{formatCaptureTitle(current.createdAt)}</Text>
          <Text testID="album-subtitle" numberOfLines={1} style={[styles.viewerSubtitle, !!current.error && styles.viewerError]}>{current.error || momentSummary(current)}</Text>
        </View>
        <Text testID="album-index" style={styles.viewerIndex}>{`${index + 1} / ${moments.length}`}</Text>
      </View>
    </Animated.View>

    <Animated.View testID="album-bottom-bar" pointerEvents={chrome ? 'auto' : 'none'} accessibilityElementsHidden={!chrome} importantForAccessibility={chrome ? 'auto' : 'no-hide-descendants'} style={[styles.bottomBar, {height: bottomBarHeight, opacity: chromeOpacity}]}>
      <Gradient top={false}/>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actions}>
        <CameraControl icon="info" label="信息" accessibilityLabel="照片信息" onPress={openInfo}/>
        {hasMotion(current) && <CameraControl icon="play" label={playing ? '停止' : '播放'} accessibilityLabel={playing ? '停止播放' : '播放动态照片'} onPress={togglePlay}/>}
        <CameraControl icon="lut" label="LUT" accessibilityLabel="更换 LUT" onPress={openLut}/>
        {!!onShare && <CameraControl icon="share" label="分享" accessibilityLabel={shareDialogTitle(current)} onPress={share}/>}
        {canExport(current) && <CameraControl icon="save" label="导出" accessibilityLabel={current.complete ? '导出到系统相册' : '导出原片到系统相册'} onPress={() => { void onExport(current.id); }}/>}
        <CameraControl icon="delete" label="删除" destructive accessibilityLabel="删除照片" onPress={() => askDelete(current.id)}/>
      </ScrollView>
    </Animated.View>
      </Animated.View>
    </View></GestureDetector>

    {infoOpen && <AlbumSheet testID="album-info-sheet" title="照片信息" height={pageHeight} initial={landscape ? 0.72 : 0.58} expanded={0.92} onClose={() => setInfoOpen(false)}>
      {details === undefined && <Text style={styles.sheetNote}>正在读取照片信息</Text>}
      {details === null && <Text style={styles.sheetError}>无法读取照片信息</Text>}
      {details && <PhotoInfo details={details} moment={current}/>}
    </AlbumSheet>}
    {lutOpen && <AlbumSheet testID="album-lut-sheet" title="更换 LUT" height={pageHeight} initial={landscape ? 0.6 : 0.4} expanded={0.92} showClose={false} onClose={closeLut} footer={
      <View style={styles.lutFooter}>
        <Text style={styles.sheetNote}>{previewing ? '正在生成预览…' : current.captureMode === 'photo' ? '按住照片对比原片 · 保存只改 App 内副本' : '按住照片对比原片 · 动态照片会用新静态图重新封装'}</Text>
        <View style={styles.lutButtons}>
          <Button mode="outlined" textColor={ui.color.text} contentStyle={styles.touch} accessibilityLabel="取消更换 LUT" onPress={closeLut} style={styles.lutButton}>取消</Button>
          <Button mode="contained" buttonColor={ui.color.accent} textColor={ui.color.background} contentStyle={styles.touch} accessibilityLabel="保存 LUT" disabled={!onRender || !saveLutId || saving || previewing} onPress={() => { void saveLut(); }} style={styles.lutButton}>{saving ? '正在保存' : '保存'}</Button>
        </View>
      </View>
    }>
      <LutFilmstrip luts={luts} selectedId={selectedLutId} savedId={savedLutId} thumbnails={thumbs} originalUri={current.originalUri || current.imageUri} disabled={saving} onSelect={(id) => { void selectLut(id); }}/>
    </AlbumSheet>}
    {shareOpen && onShare && <View style={styles.shareWrap} pointerEvents="box-none">
      <Pressable style={styles.shareBackdrop} accessibilityRole="button" accessibilityLabel="关闭分享" onPress={() => setShareOpen(false)}/>
      <View testID="album-share-sheet" accessibilityViewIsModal style={[styles.shareSheet, {height: Math.min(Math.round(pageHeight * (landscape ? 0.88 : 0.78)), 36 + ui.icon.touch + (shareKinds(current).length + 1) * 72)}]}>
        <View style={styles.shareHandle}/>
        <Text style={styles.shareTitle} accessibilityRole="header">{shareDialogTitle(current)}</Text>
        <ScrollView bounces={false} style={styles.shareScroll}>
          {shareKinds(current).map((kind) => <Pressable key={kind} testID={`album-share-${kind}`} accessibilityRole="button" accessibilityLabel={shareKindLabel[kind]} onPress={() => { setShareOpen(false); void onShare(current.id, kind); }} style={styles.shareOption}>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.shareOptionLabel}>{shareOptionLabel[kind]}</Text>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.shareOptionHint}>{shareOptionHint(kind, current)}</Text>
          </Pressable>)}
          <Pressable accessibilityRole="button" accessibilityLabel="取消" onPress={() => setShareOpen(false)} style={styles.shareOption}>
            <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.shareCancel}>取消</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>}
  </View>;

  return <View style={styles.root} onLayout={(event) => { const {width, height} = event.nativeEvent.layout; if (width > 0 && height > 0) setFrame((prev) => prev.width === width && prev.height === height ? prev : {width, height}); }}>
    {grid}
    {viewer}
  </View>;
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: ui.color.background}, fill: {flex: 1},
  gridHeader: {minHeight: 64, paddingHorizontal: ui.space.sm, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: ui.space.sm},
  headerTitle: {...ui.type.title, color: ui.color.text, flex: 1, textAlign: 'center'}, headerSpacer: {width: ui.icon.touch},
  headerAction: {minWidth: ui.icon.touch, minHeight: ui.icon.touch, paddingHorizontal: ui.space.sm, alignItems: 'center', justifyContent: 'center', flexShrink: 0},
  headerActionLabel: {...ui.type.body, color: ui.color.accent, fontWeight: '600'},
  headerCount: {...ui.type.title, color: ui.color.text, flex: 1, textAlign: 'center'},
  filterScroll: {flexGrow: 0, minHeight: ui.icon.touch},
  filters: {alignItems: 'center', paddingHorizontal: ui.space.gutter, paddingBottom: ui.space.sm, gap: ui.space.sm},
  filterChip: {minHeight: ui.icon.touch, paddingHorizontal: ui.space.md, borderRadius: ui.radius.pill, borderWidth: 1, borderColor: ui.color.outline, alignItems: 'center', justifyContent: 'center', flexShrink: 0},
  filterChipOn: {backgroundColor: ui.color.selected, borderColor: ui.color.accent},
  filterLabel: {...ui.type.body, color: ui.color.muted},
  filterLabelOn: {color: ui.color.accent, fontWeight: '600'},
  gridList: {flex: 1},
  grid: {paddingBottom: ui.space.lg},
  sectionHeader: {...ui.type.body, color: ui.color.text, fontWeight: '600', paddingHorizontal: ui.space.gutter, paddingTop: ui.space.gutter, paddingBottom: ui.space.sm},
  gridRow: {flexDirection: 'row'},
  empty: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: ui.space.md, padding: ui.space.lg},
  emptyTitle: {color: ui.color.text}, emptyCopy: {...ui.type.body, color: ui.color.muted, textAlign: 'center'}, touch: {minHeight: ui.icon.touch},
  cell: {padding: 1}, thumb: {flex: 1, backgroundColor: ui.color.surface}, thumbEmpty: {borderWidth: 1, borderColor: ui.color.outline},
  selectedFrame: {position: 'absolute', top: 1, left: 1, right: 1, bottom: 1, borderWidth: 2, borderColor: ui.color.accent},
  selectMark: {width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: ui.color.text, backgroundColor: ui.color.badge, alignItems: 'center', justifyContent: 'center'},
  selectMarkOn: {backgroundColor: ui.color.accent, borderColor: ui.color.accent},
  selectGlyph: {color: ui.color.background, fontSize: 14, lineHeight: 18, fontWeight: '700'},
  cellTop: {position: 'absolute', top: ui.space.xs, left: ui.space.xs, right: ui.space.xs, flexDirection: 'row'},
  statusMark: {...ui.type.label, color: ui.color.text, backgroundColor: ui.color.badge, paddingHorizontal: ui.space.xs, borderRadius: ui.space.xs, overflow: 'hidden'},
  cellMarks: {position: 'absolute', top: ui.space.xs, right: ui.space.xs, flexDirection: 'row', gap: ui.space.xs},
  mark: {width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: ui.color.badge},
  live: {position: 'absolute', left: ui.space.sm, bottom: ui.space.sm, ...ui.type.label, color: ui.color.text, backgroundColor: ui.color.badge, paddingHorizontal: ui.space.xs, borderRadius: ui.space.xs, overflow: 'hidden'},
  cellBottomRight: {position: 'absolute', right: ui.space.sm, bottom: ui.space.sm, flexDirection: 'row', alignItems: 'center', gap: ui.space.xs},
  lutDot: {width: 5, height: 5, borderRadius: 3, backgroundColor: ui.color.accent},
  demoMark: {fontSize: 9, lineHeight: 12, color: ui.color.muted, backgroundColor: ui.color.badge, paddingHorizontal: 3, borderRadius: 3, overflow: 'hidden'},
  cellError: {position: 'absolute', left: ui.space.xs, right: ui.space.xs, bottom: ui.space.xs, ...ui.type.caption, color: ui.color.destructive},
  batchBar: {flexDirection: 'row', alignItems: 'stretch', gap: ui.space.sm, paddingHorizontal: ui.space.gutter, paddingVertical: ui.space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderColor: ui.color.outline, backgroundColor: ui.color.background},
  batchButton: {flex: 1, minHeight: ui.icon.touch, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: ui.space.sm, paddingHorizontal: ui.space.sm, borderRadius: ui.radius.control, borderWidth: 1, borderColor: ui.color.outline},
  batchDisabled: {opacity: 0.45},
  batchLabel: {...ui.type.body, color: ui.color.text, flexShrink: 1, textAlign: 'center'},
  batchLabelDestructive: {...ui.type.body, color: ui.color.destructive, flexShrink: 1, textAlign: 'center'},
  viewer: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0},
  viewport: {flex: 1, overflow: 'hidden', backgroundColor: '#000'},
  row: {flexDirection: 'row', height: '100%'},
  media: {width: '100%', height: '100%'}, videoLayer: {...StyleSheet.absoluteFillObject},
  liveButton: {position: 'absolute', left: 6, width: ui.icon.touch, height: ui.icon.touch, alignItems: 'flex-start', justifyContent: 'center'},
  liveBadge: {...ui.type.label, color: ui.color.text, backgroundColor: ui.color.badge, paddingHorizontal: ui.space.xs, paddingVertical: 2, borderRadius: ui.space.xs, overflow: 'hidden'},
  compareMark: {position: 'absolute', right: ui.space.gutter, backgroundColor: ui.color.badge, paddingHorizontal: ui.space.sm, paddingVertical: 2, borderRadius: ui.space.xs},
  compareText: {...ui.type.label, color: ui.color.accent},
  topBar: {position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10},
  topRow: {flexDirection: 'row', alignItems: 'center', gap: ui.space.xs, paddingHorizontal: ui.space.sm, paddingTop: 2},
  topCopy: {flex: 1, minWidth: 0, alignItems: 'center', gap: 1},
  viewerTitle: {...ui.type.title, color: ui.color.text, textAlign: 'center'},
  viewerSubtitle: {...ui.type.caption, color: ui.color.muted, textAlign: 'center'},
  viewerError: {color: ui.color.destructive},
  viewerIndex: {...ui.type.label, color: ui.color.text, minWidth: 48, textAlign: 'right'},
  bottomBar: {position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 10, justifyContent: 'flex-end'},
  actions: {flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 2, paddingHorizontal: ui.space.sm, paddingBottom: 4},
  sheetNote: {...ui.type.caption, color: ui.color.muted}, sheetError: {...ui.type.caption, color: ui.color.destructive},
  lutFooter: {gap: ui.space.sm}, lutButtons: {flexDirection: 'row', gap: ui.space.sm},
  lutButton: {flex: 1},
  shareWrap: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40, justifyContent: 'flex-end'},
  shareBackdrop: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0},
  shareSheet: {borderTopLeftRadius: ui.radius.sheet, borderTopRightRadius: ui.radius.sheet, backgroundColor: ui.color.background, borderTopWidth: StyleSheet.hairlineWidth, borderColor: ui.color.outline, paddingHorizontal: ui.space.gutter, paddingBottom: ui.space.md, width: '100%', maxWidth: 680, alignSelf: 'center', elevation: 0},
  shareHandle: {width: 36, height: 4, borderRadius: 2, backgroundColor: ui.color.outline, alignSelf: 'center', marginTop: ui.space.sm, marginBottom: ui.space.xs},
  shareTitle: {...ui.type.title, color: ui.color.text, minHeight: ui.icon.touch, textAlignVertical: 'center', paddingTop: ui.space.sm},
  shareScroll: {flex: 1},
  shareOption: {minHeight: ui.icon.touch, justifyContent: 'center', paddingVertical: ui.space.sm, borderTopWidth: StyleSheet.hairlineWidth, borderColor: ui.color.outline},
  shareOptionLabel: {...ui.type.body, color: ui.color.text},
  shareOptionHint: {...ui.type.caption, color: ui.color.muted},
  shareCancel: {...ui.type.body, color: ui.color.muted, textAlign: 'center'},
});
