import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {AccessibilityInfo, Animated, AppState, BackHandler, findNodeHandle, Image, Pressable, ScrollView, SectionList, StyleSheet, View} from 'react-native';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Video, {VideoRef} from 'react-native-video';
import Svg, {Defs, LinearGradient, Rect, Stop} from 'react-native-svg';
import {LutItem, MomentDetails, MomentItem} from './native';
import {ui} from './theme';
import {Camera, Check, ChevronLeft, Download, Image as ImageIcon, Images, Info, Palette, Play, Share, Square, Trash2, Wifi, X} from 'lucide-react-native';
import type {LucideIcon} from 'lucide-react-native';
import {Button, cn, color, Icon, MotionGlyph, RoundButton, Text} from './ui';
import AlbumSheet from './AlbumSheet';
import ConfirmDialog from './ConfirmDialog';
import LutFilmstrip from './LutFilmstrip';
import NoticeBar from './NoticeBar';
import PhotoInfo from './PhotoInfo';
import {Notice} from './notice';
import {ALBUM_FILTERS, AlbumFilter, albumFilterCounts, albumFilterEmpty, batchResultMessage, formatCaptureTitle, groupMomentsByDay, matchesAlbumFilter, momentAccessibilityName, momentSummary, shareDialogTitle, shareKindLabel, shareKinds, shareOptionHint, shareOptionLabel, viewerDismissPastThreshold} from './albumFormat';
import {A11yHideView} from './A11yHideView';

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
  /** Selected photos, motion files included, handed to the system share sheet together. */
  onShareMany?: (ids: string[]) => Promise<void>;
};

type ConfirmRequest = {title: string; body: string; onConfirm: () => void};

// The grid drops the photo at once. Native deletion waits so 撤销 can restore the same slot.
const UNDO_MS = 5000;

function emptyAlbumIcon(filter: AlbumFilter): LucideIcon {
  if (filter === 'photo') return ImageIcon;
  if (filter === 'camera') return Camera;
  return Images;
}

const hasMotion = (moment: MomentItem) => moment.captureMode !== 'photo' && !!moment.videoUri && moment.complete;
// A fresh [] default would retrigger the thumbnail effect on every render once the sheet opens.
const noLuts: LutItem[] = [];
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

/** Viewer toolbar action: one glyph size, a short label under it, delete in red. */
function ViewerAction({glyph, label, accessibilityLabel, danger = false, onPress}: {glyph: LucideIcon; label: string; accessibilityLabel: string; danger?: boolean; onPress: () => void}) {
  return <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress}
    className="min-h-[52px] w-14 items-center justify-center gap-1 rounded-xl active:bg-white/10">
    <Icon as={glyph} size={22} color={danger ? color.danger : color.ink}/>
    <Text numberOfLines={1} className={cn('text-[11px] leading-[13px] font-medium', danger ? 'text-danger' : 'text-subtle')}>{label}</Text>
  </Pressable>;
}

export default function MotionAlbum({moments, luts = noLuts, initialMomentId = null, onInitialMomentHandled, onBack, onExport, onDelete, onNotice, onRender, onPreview, onThumbnail, onDetails, onShare, onShareMany}: Props) {
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
  const [confirm, setConfirm] = useState<ConfirmRequest | null>(null);
  const [pendingIds, setPendingIds] = useState<ReadonlySet<string>>(() => new Set());
  const [undoNotice, setUndoNotice] = useState<Notice | null>(null);
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
  const confirmRef = useRef<ConfirmRequest | null>(null);
  const pendingRef = useRef<Set<string>>(new Set());
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushRef = useRef<() => void>(() => {});
  const alive = useRef(true);
  const onDeleteRef = useRef(onDelete);
  const onNoticeRef = useRef(onNotice);
  const sheetOpenRef = useRef(false);
  const pageHeightRef = useRef(640);
  const videoRef = useRef<VideoRef>(null);
  const viewerTitleRef = useRef<View>(null);
  const shareTitleRef = useRef<View>(null);
  const viewerWasOpen = useRef(false);
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
  const listed = useMemo(() => moments.filter((moment) => !pendingIds.has(moment.id)), [moments, pendingIds]);
  const current = listed.find((moment) => moment.id === viewerId) || null;
  const index = Math.max(0, listed.findIndex((moment) => moment.id === viewerId));
  const savedLutId = current ? current.lutId || (current.lut ? luts.find((lut) => lut.name === current.lut)?.id : null) || null : null;
  const selectedLutId = previewLutId ?? savedLutId ?? 'off';
  const counts = useMemo(() => albumFilterCounts(listed), [listed]);
  const filtered = useMemo(() => listed.filter((moment) => matchesAlbumFilter(moment, albumFilter)), [listed, albumFilter]);
  const sections = useMemo(() => groupMomentsByDay(filtered).map((section) => ({...section, data: chunk(section.moments, columns)})), [filtered, columns]);
  const visibleIds = useMemo(() => filtered.map((moment) => moment.id), [filtered]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  // With nothing saved yet the filter chips only show four zeros, so they are hidden and the copy speaks about the whole album.
  const albumEmpty = moments.length === 0;
  const emptyFilter: AlbumFilter = albumEmpty ? 'all' : albumFilter;
  const emptyCopy = albumFilterEmpty(emptyFilter);
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
  confirmRef.current = confirm;
  onDeleteRef.current = onDelete;
  onNoticeRef.current = onNotice;
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
    const open = viewerId != null;
    const justOpened = open && !viewerWasOpen.current;
    viewerWasOpen.current = open;
    if (!justOpened) return undefined;
    const node = findNodeHandle(viewerTitleRef.current);
    if (node == null) return undefined;
    const timer = setTimeout(() => AccessibilityInfo.setAccessibilityFocus(node), 300);
    return () => clearTimeout(timer);
  }, [viewerId]);
  useEffect(() => {
    if (!shareOpen) return undefined;
    const node = findNodeHandle(shareTitleRef.current);
    if (node == null) return undefined;
    const timer = setTimeout(() => AccessibilityInfo.setAccessibilityFocus(node), 300);
    return () => clearTimeout(timer);
  }, [shareOpen]);
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
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') return;
      stopPlayback();
      // Leaving the app must not leave a confirmed delete sitting only in memory.
      flushRef.current();
    });
    return () => {
      sub.remove();
      imageOpacity.stopAnimation();
      videoOpacity.stopAnimation();
      chromeOpacity.stopAnimation();
      flushRef.current();
    };
  }, [imageOpacity, stopPlayback, videoOpacity, chromeOpacity]);
  useEffect(() => () => { alive.current = false; }, []);
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
      if (confirmRef.current) { setConfirm(null); return true; }
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
      // The grid is the root of the album. Back returns to capture instead of leaving the app.
      onBack();
      return true;
    });
    return () => sub.remove();
  }, [shareOpen, infoOpen, lutOpen, closeLut, fadeChrome, onBack]);
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
    const atEnd = indexRef.current >= listed.length - 1 && event.translationX < 0;
    dragX.setValue(atStart || atEnd ? event.translationX * 0.25 : event.translationX);
  }).onEnd((event) => {
    dragX.setValue(0);
    if (pinching.current || scaleRef.current >= 1.05 || zoomedRef.current) return;
    const threshold = Math.max(48, pageWidth * 0.18);
    const direction = event.translationX <= -threshold ? 1 : event.translationX >= threshold ? -1 : 0;
    const next = listed[indexRef.current + direction];
    if (direction !== 0 && next) setViewerId(next.id);
  });
  const gesture = Gesture.Simultaneous(pinch, longPress, Gesture.Race(dismissPan, pan, Gesture.Exclusive(doubleTap, singleTap)));
  const transform = [{translateX}, {translateY}, {scale: zoom}];

  const dropPending = (id: string) => {
    if (!alive.current) return;
    setPendingIds((prev) => {
      if (!prev.has(id)) return prev;
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };
  const flushPending = () => {
    if (undoTimer.current) { clearTimeout(undoTimer.current); undoTimer.current = null; }
    const ids = [...pendingRef.current];
    pendingRef.current = new Set();
    if (ids.length === 0) return;
    if (alive.current) setUndoNotice(null);
    for (const id of ids) {
      void onDeleteRef.current(id, true).then(() => { dropPending(id); }).catch(() => {
        dropPending(id);
        if (alive.current) onNoticeRef.current?.('有照片未能删除');
      });
    }
  };
  flushRef.current = flushPending;
  const undoPending = () => {
    if (undoTimer.current) { clearTimeout(undoTimer.current); undoTimer.current = null; }
    const restoring = pendingRef.current;
    pendingRef.current = new Set();
    setPendingIds((prev) => {
      const next = new Set(prev);
      for (const id of restoring) next.delete(id);
      return next;
    });
    setUndoNotice(null);
  };
  const stageDelete = (ids: string[]) => {
    if (ids.length === 0) return;
    const next = new Set(pendingRef.current);
    for (const id of ids) next.add(id);
    pendingRef.current = next;
    setPendingIds(new Set(next));
    if (viewerIdRef.current && next.has(viewerIdRef.current)) setViewerId(null);
    setSelecting(false);
    setSelected(new Set());
    setUndoNotice({message: `已删除 ${next.size} 张`, durationMs: UNDO_MS, action: {label: '撤销', onPress: undoPending}});
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => { undoTimer.current = null; flushRef.current(); }, UNDO_MS);
  };
  const askDelete = (id: string) => setConfirm({
    title: '删除这张照片？',
    body: '只删除 App 内副本；相机 SD 卡原片和已导出到系统相册的副本会保留。',
    onConfirm: () => { setConfirm(null); stageDelete([id]); },
  });
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
    const ids = [...selected];
    setConfirm({
      title: `删除 ${ids.length} 张照片？`,
      body: '只删除 App 内副本，机身 SD 卡和系统相册里的照片不受影响。',
      onConfirm: () => { setConfirm(null); stageDelete(ids); },
    });
  };
  const shareSelected = async () => {
    if (batching || selected.size === 0 || !onShareMany) return;
    const ids = [...selected];
    try { await onShareMany(ids); exitSelection(); }
    catch { /* The app reports the failure and rethrows so the selection stays. */ }
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
  const appliedLutId = savedLutId ?? 'off';
  const saveLutId = previewLutId ?? appliedLutId;
  const lutChanged = saveLutId !== appliedLutId;
  const saveDisabled = !onRender || !lutChanged || saving || previewing;
  const saveLut = async () => {
    if (!current || !onRender || !lutChanged || saving || previewing) return;
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

  const cellSize = Math.floor(pageWidth / columns);
  const motionCount = listed.filter(hasMotion).length;
  const batchDisabled = selected.size === 0 || batching;
  const batchButton = (label: string, accessibilityLabel: string, glyph: LucideIcon, onPress: () => void, danger = false) =>
    <Pressable accessibilityRole="button" accessibilityLabel={accessibilityLabel} accessibilityState={{disabled: batchDisabled}} disabled={batchDisabled} onPress={onPress}
      className={cn('h-11 flex-1 flex-row items-center justify-center gap-1.5 rounded-full px-3 active:bg-raised', batchDisabled && 'opacity-40')}>
      <Icon as={glyph} size={20} color={danger ? color.danger : color.ink}/>
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} className={cn('text-[15px] leading-[20px] font-semibold', danger && 'text-danger')}>{label}</Text>
    </Pressable>;
  const grid = <A11yHideView testID="album-grid-layer" collapsable={false} style={styles.fill} pointerEvents={current ? 'none' : 'auto'} accessibilityElementsHidden={!!current} importantForAccessibility={current ? 'no-hide-descendants' : 'auto'}>
    {filtered.length === 0 ? <View className="flex-1 items-center justify-center gap-3 px-8" style={{paddingTop: 104}} testID="album-empty">
      <View className="mb-1 h-[72px] w-[72px] items-center justify-center rounded-full bg-grouped">
        {emptyFilter === 'motion' ? <MotionGlyph size={32} testID="album-empty-icon-motion"/> : <Icon as={emptyAlbumIcon(emptyFilter)} size={32} testID={`album-empty-icon-${emptyFilter}`}/>}
      </View>
      <Text className="text-title text-center">{emptyCopy.title}</Text>
      <Text className="text-[15px] leading-[21px] text-center text-muted">{emptyCopy.body}</Text>
      {albumEmpty && <Button variant="primary" size="lg" className="mt-3 self-stretch" testID="album-empty-shoot" accessibilityLabel="去拍第一张" onPress={onBack}><Text>去拍第一张</Text></Button>}
    </View> : <SectionList
      testID="album-grid"
      style={styles.gridList}
      sections={sections}
      extraData={`${selecting}:${albumFilter}:${[...selected].join(',')}`}
      keyExtractor={(row) => row.map((moment) => moment.id).join('|')}
      initialNumToRender={8}
      stickySectionHeadersEnabled={false}
      contentContainerStyle={{paddingTop: landscape ? 72 : 112, paddingBottom: 112}}
      renderSectionHeader={({section}) => <Text className="px-4 pb-2 pt-4 text-[15px] leading-[20px] font-semibold">{section.title}</Text>}
      renderItem={({item: row}) => <View style={styles.gridRow}>
        {row.map((item) => {
          const name = item.exported ? `${momentAccessibilityName(item)}，已导出` : momentAccessibilityName(item);
          const chosen = selected.has(item.id);
          return <Pressable key={item.id} testID={`album-cell-${item.id}`} accessibilityRole="button" accessibilityLabel={selecting ? `选择${name}` : name} accessibilityState={selecting ? {selected: chosen} : undefined} onPress={() => { if (selecting) toggleSelected(item.id); else openViewer(item.id); }} onLongPress={() => { if (selecting) toggleSelected(item.id); else beginSelection(item.id); }} style={[styles.cell, {width: cellSize, height: cellSize}]}>
            {item.imageUri ? <Image source={{uri: item.imageUri}} style={styles.thumb}/> : <View style={[styles.thumb, styles.thumbEmpty]}/>}
            {selecting && chosen && <View pointerEvents="none" style={styles.selectedFrame}/>}
            <View style={styles.cellTop}>
              {hasMotion(item) && <View testID={`album-live-${item.id}`}><MotionGlyph size={16}/></View>}
              {!item.complete && <Text className="overflow-hidden rounded-full bg-black/60 px-1.5 text-[10px] leading-[15px] font-semibold">{item.error ? '失败' : '未完成'}</Text>}
              <View className="flex-1"/>
              {item.experimentalWifi && <View testID="experimental-wifi-badge"><Icon as={Wifi} size={14}/></View>}
              {selecting && <View className={cn('h-[22px] w-[22px] items-center justify-center rounded-full border-[1.5px] border-ink', chosen ? 'bg-ink' : 'bg-black/30')}>
                {chosen && <Icon as={Check} size={14} strokeWidth={2.6} color="#000000"/>}
              </View>}
            </View>
            <View style={styles.cellBottom}>
              {item.exported && <Text testID={`album-exported-${item.id}`} className="overflow-hidden rounded-full bg-black/55 px-1.5 text-[10px] leading-[15px] font-semibold">已导出</Text>}
              <View className="flex-1"/>
              {!!item.lut && <View className="h-[5px] w-[5px] rounded-full bg-leica"/>}
              {item.demo && <Text className="text-[10px] leading-[13px] font-semibold text-subtle" style={styles.ink}>演示</Text>}
              {item.cameraTriggered && !item.demo && <Text className="text-[10px] leading-[13px] font-semibold" style={styles.ink}>机身</Text>}
            </View>
            {!!item.error && <Text numberOfLines={2} className="absolute bottom-1 left-1 right-1 text-caption text-danger" style={styles.ink}>{item.error}</Text>}
          </Pressable>;
        })}
      </View>}
    />}
    {/* Header floats over the grid like iOS Photos: large title, translucent fade underneath. */}
    <View pointerEvents="box-none" style={[styles.header, {height: landscape ? 72 : 112}]}>
      <Gradient top/>
      <View pointerEvents="box-none" className="absolute bottom-2 left-4 right-4 flex-row items-end justify-between gap-3">
        {selecting ? <View testID="album-select-bar" className="flex-1 flex-row items-end justify-between gap-3">
          <Text testID="album-selected-count" numberOfLines={1} className="text-large shrink" style={{letterSpacing: -0.4}}>{`已选 ${selected.size}`}</Text>
          <View className="flex-row gap-2 pb-0.5">
            <Button variant="tinted" size="sm" accessibilityLabel={allVisibleSelected ? '取消全选' : '全选'} onPress={selectAllVisible}><Text>{allVisibleSelected ? '取消全选' : '全选'}</Text></Button>
            <Button variant="tinted" size="sm" accessibilityLabel="取消选择" onPress={exitSelection}><Text>取消</Text></Button>
          </View>
        </View> : <>
          <View className="shrink gap-0.5">
            <Text accessibilityRole="header" className="text-large" style={{letterSpacing: -0.4}}>相册</Text>
            {!albumEmpty && <Text testID="album-summary" className="text-footnote text-subtle">{motionCount > 0 ? `${listed.length} 张 · ${motionCount} 张动态` : `${listed.length} 张`}</Text>}
          </View>
          <View className="flex-row items-center gap-2 pb-0.5">
            {!albumEmpty && <Button variant="tinted" size="sm" accessibilityLabel="选择照片" onPress={() => { setSelecting(true); setSelected(new Set()); }}><Text>选择</Text></Button>}
            <RoundButton tone="filled" size={32} className="bg-raised" accessibilityLabel="返回拍照页面" onPress={onBack}><Icon as={X} size={16} strokeWidth={2.4}/></RoundButton>
          </View>
        </>}
      </View>
    </View>
    {!albumEmpty && !selecting && <View pointerEvents="box-none" style={styles.bottomFloat}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} testID="album-filters" style={styles.filterScroll} contentContainerStyle={styles.filterContent}>
        <View className="h-10 flex-row gap-0.5 rounded-full bg-raised/90 p-[3px]">
          {ALBUM_FILTERS.map((filter) => {
            const on = filter.id === albumFilter;
            const count = counts[filter.id];
            return <Pressable key={filter.id} testID={`album-filter-${filter.id}`} accessibilityRole="button" accessibilityState={{selected: on}} accessibilityLabel={`${filter.label} ${count}`} onPress={() => setAlbumFilter(filter.id)}
              className={cn('h-[34px] items-center justify-center rounded-full px-[18px] active:opacity-70', on && 'bg-faint')}>
              <Text numberOfLines={1} className={cn('text-[14px] leading-[18px] font-semibold', on ? 'text-ink' : 'text-[#D1D1D6]')}>{filter.label}</Text>
            </Pressable>;
          })}
        </View>
      </ScrollView>
    </View>}
    {selecting && <View pointerEvents="box-none" style={styles.bottomFloat}>
      <View testID="album-batch-bar" className="w-full max-w-[420px] flex-row gap-1 rounded-full bg-raised/95 p-1">
        {!!onShareMany && batchButton('分享', '分享', Share, () => { void shareSelected(); })}
        {batchButton('导出', '批量导出', Download, () => { void runBatch('导出', (id) => onExport(id, true)); })}
        {batchButton('删除', '批量删除', Trash2, confirmBatchDelete, true)}
      </View>
    </View>}
  </A11yHideView>;

  const sheetCover = lutOpen || infoOpen || shareOpen;
  const viewer = current && <View style={styles.viewer} testID="motion-viewer" accessibilityViewIsModal>
    {/* Chrome used to set StatusBar hidden={false}, which put the clock back on the title. The activity keeps the system bars hidden. */}
    <GestureDetector gesture={gesture}><A11yHideView testID="album-viewer-body" collapsable={false} style={styles.fill} accessibilityElementsHidden={sheetCover} importantForAccessibility={sheetCover ? 'no-hide-descendants' : 'auto'}>
      <Animated.View testID="album-dismiss-layer" style={[styles.fill, {opacity: dismissOpacity, transform: [{translateY: dismissY}]}]}>
        <View testID="album-pager" style={styles.viewport} accessibilityRole="button" accessibilityState={{selected: zoomed}} accessibilityHint={hasMotion(current) ? '单击切换沉浸模式，双击缩放，长按播放动态照片' : '单击切换沉浸模式，双击缩放'} accessibilityLabel={hasMotion(current) ? '单击显示或隐藏操作，双指缩放查看动态照片' : '单击显示或隐藏操作，双指缩放查看照片'} onAccessibilityTap={() => fadeChrome(!chromeRef.current)}>
          <Animated.View style={[styles.row, {width: pageWidth * 3, transform: [{translateX: rowX}]}]}>
            {renderPage(moments[index - 1], false, 'previous')}
            {renderPage(current, true, 'current')}
            {renderPage(moments[index + 1], false, 'next')}
          </Animated.View>
        </View>
        {hasMotion(current) && <Pressable testID="album-live-badge" accessibilityRole="button" accessibilityLabel="播放 LIVE" accessibilityHint="也可以长按照片播放" accessibilityState={{selected: playing}} onPress={playMotion} hitSlop={8} style={[styles.liveButton, {left: mediaBox.left + 12, top: mediaTop}]}>
          <View className={cn('h-[26px] flex-row items-center gap-1 rounded-full px-2', playing ? 'bg-ink' : 'bg-black/45')}>
            <MotionGlyph size={14} color={playing ? '#000000' : color.ink}/>
            <Text className={cn('text-[11px] leading-[14px] font-semibold', playing && 'text-black')} style={{letterSpacing: 1}}>LIVE</Text>
          </View>
        </Pressable>}
        {compareOriginal && <View pointerEvents="none" style={[styles.compareMark, {top: mediaTop}]}><Text className="text-[11px] leading-[14px] font-semibold">原片</Text></View>}
    <Animated.View testID="album-top-bar" pointerEvents={chrome ? 'auto' : 'none'} accessibilityElementsHidden={!chrome} importantForAccessibility={chrome ? 'auto' : 'no-hide-descendants'} style={[styles.topBar, {height: topBarHeight, opacity: chromeOpacity}]}>
      <Gradient top/>
      <View style={styles.topRow}>
        <RoundButton tone="filled" size={36} accessibilityLabel="返回网格" onPress={closeViewer}><Icon as={ChevronLeft} size={22}/></RoundButton>
        <View style={styles.topCopy}>
          <View ref={viewerTitleRef} accessible accessibilityRole="header" accessibilityLabel={formatCaptureTitle(current.createdAt)}>
            <Text testID="album-title" numberOfLines={1} className="text-center text-headline">{formatCaptureTitle(current.createdAt)}</Text>
          </View>
          <Text testID="album-subtitle" numberOfLines={1} className={cn('text-center text-caption', current.error ? 'text-danger' : 'text-subtle')}>{current.error || momentSummary(current)}</Text>
        </View>
        <Text testID="album-index" className="min-w-[36px] text-right text-caption font-semibold text-subtle" style={{fontVariant: ['tabular-nums']}}>{`${index + 1}/${listed.length}`}</Text>
      </View>
    </Animated.View>

    <Animated.View testID="album-bottom-bar" pointerEvents={chrome ? 'auto' : 'none'} accessibilityElementsHidden={!chrome} importantForAccessibility={chrome ? 'auto' : 'no-hide-descendants'} style={[styles.bottomBar, {height: bottomBarHeight, opacity: chromeOpacity}]}>
      <Gradient top={false}/>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.actions}>
        <ViewerAction glyph={Info} label="信息" accessibilityLabel="照片信息" onPress={openInfo}/>
        {hasMotion(current) && <ViewerAction glyph={playing ? Square : Play} label={playing ? '停止' : '播放'} accessibilityLabel={playing ? '停止播放' : '播放动态照片'} onPress={togglePlay}/>}
        <ViewerAction glyph={Palette} label="LUT" accessibilityLabel="更换 LUT" onPress={openLut}/>
        {!!onShare && <ViewerAction glyph={Share} label="分享" accessibilityLabel={shareDialogTitle(current)} onPress={share}/>}
        {canExport(current) && <ViewerAction glyph={Download} label="导出" accessibilityLabel={current.complete ? '导出到系统相册' : '导出原片到系统相册'} onPress={() => { void onExport(current.id); }}/>}
        <ViewerAction glyph={Trash2} label="删除" danger accessibilityLabel="删除照片" onPress={() => askDelete(current.id)}/>
      </ScrollView>
    </Animated.View>
      </Animated.View>
    </A11yHideView></GestureDetector>

    {infoOpen && <AlbumSheet testID="album-info-sheet" title="照片信息" height={pageHeight} initial={landscape ? 0.72 : 0.58} expanded={0.92} onClose={() => setInfoOpen(false)}>
      {details === undefined && <Text className="text-caption text-muted">正在读取照片信息</Text>}
      {details === null && <Text className="text-caption text-danger">无法读取照片信息</Text>}
      {details && <PhotoInfo details={details} moment={current}/>}
    </AlbumSheet>}
    {lutOpen && <AlbumSheet testID="album-lut-sheet" title="更换 LUT" height={pageHeight} initial={landscape ? 0.6 : 0.4} expanded={0.92} showClose={false} onClose={closeLut} footer={
      <View style={styles.lutFooter}>
        <Text className="text-caption text-muted">{previewing ? '正在生成预览…' : current.captureMode === 'photo' ? '按住照片可对比原片。保存只改 App 内副本' : '按住照片可对比原片。动态照片的封面也会换成新风格'}</Text>
        <View style={styles.lutButtons}>
          <Button variant="tinted" className="flex-1" accessibilityLabel="取消更换 LUT" onPress={closeLut}><Text>取消</Text></Button>
          <Button testID="album-lut-save" variant="primary" className="flex-1" accessibilityLabel="保存 LUT" disabled={saveDisabled} onPress={() => { void saveLut(); }}><Text>{saving ? '正在保存' : '保存'}</Text></Button>
        </View>
      </View>
    }>
      <LutFilmstrip luts={luts} selectedId={selectedLutId} savedId={savedLutId} thumbnails={thumbs} originalUri={current.originalUri || current.imageUri} disabled={saving} onSelect={(id) => { void selectLut(id); }}/>
    </AlbumSheet>}
    {shareOpen && onShare && <View style={styles.shareWrap} pointerEvents="box-none">
      <Pressable style={styles.shareBackdrop} accessibilityRole="button" accessibilityLabel="关闭分享" onPress={() => setShareOpen(false)}/>
      <View testID="album-share-sheet" accessibilityViewIsModal style={[styles.shareSheet, {height: Math.min(Math.round(pageHeight * (landscape ? 0.88 : 0.78)), 36 + ui.icon.touch + (shareKinds(current).length + 1) * 72)}]}>
        <View style={styles.shareHandle}/>
        <View ref={shareTitleRef} accessible accessibilityRole="header" accessibilityLabel={shareDialogTitle(current)}>
          <Text className="py-2 text-title">{shareDialogTitle(current)}</Text>
        </View>
        <ScrollView bounces={false} style={styles.shareScroll}>
          {shareKinds(current).map((kind) => <Pressable key={kind} testID={`album-share-${kind}`} accessibilityRole="button" accessibilityLabel={shareKindLabel[kind]} onPress={() => { setShareOpen(false); void onShare(current.id, kind); }} style={styles.shareOption}>
            <Text numberOfLines={1} className="text-body font-medium">{shareOptionLabel[kind]}</Text>
            <Text numberOfLines={1} className="text-footnote text-muted">{shareOptionHint(kind, current)}</Text>
          </Pressable>)}
          <Pressable accessibilityRole="button" accessibilityLabel="取消" onPress={() => setShareOpen(false)} style={styles.shareOption}>
            <Text numberOfLines={1} className="text-center text-body font-semibold">取消</Text>
          </Pressable>
        </ScrollView>
      </View>
    </View>}
  </View>;

  return <View style={styles.root} onLayout={(event) => { const {width, height} = event.nativeEvent.layout; if (width > 0 && height > 0) setFrame((prev) => prev.width === width && prev.height === height ? prev : {width, height}); }}>
    <View testID="album-screen" accessibilityElementsHidden={!!confirm} importantForAccessibility={confirm ? 'no-hide-descendants' : 'auto'} style={styles.fill}>
      {grid}
      {viewer}
      {undoNotice && <View pointerEvents="box-none" style={styles.undoHost}><NoticeBar notice={undoNotice} onDismiss={() => setUndoNotice(null)}/></View>}
    </View>
    {confirm && <ConfirmDialog visible destructive testID="confirm-dialog" confirmTestID="confirm-accept" title={confirm.title} body={confirm.body} confirmLabel="删除" onCancel={() => setConfirm(null)} onConfirm={confirm.onConfirm}/>}
  </View>;
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: ui.color.background}, fill: {flex: 1},
  ink: {textShadowColor: '#000000B3', textShadowOffset: {width: 0, height: 1}, textShadowRadius: 2},
  header: {position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20},
  bottomFloat: {position: 'absolute', left: 16, right: 16, bottom: 24, zIndex: 20, alignItems: 'center'},
  filterScroll: {flexGrow: 0, maxWidth: '100%'}, filterContent: {flexGrow: 1, justifyContent: 'center'},
  gridList: {flex: 1},
  gridRow: {flexDirection: 'row', gap: 0},
  cell: {padding: 0.75}, thumb: {flex: 1, backgroundColor: ui.color.surface}, thumbEmpty: {borderWidth: StyleSheet.hairlineWidth, borderColor: ui.color.outline},
  selectedFrame: {position: 'absolute', top: 0.75, left: 0.75, right: 0.75, bottom: 0.75, backgroundColor: '#FFFFFF26'},
  cellTop: {position: 'absolute', top: 6, left: 6, right: 6, flexDirection: 'row', alignItems: 'center', gap: 4},
  cellBottom: {position: 'absolute', bottom: 5, left: 6, right: 6, flexDirection: 'row', alignItems: 'center', gap: 5},
  undoHost: {position: 'absolute', left: 16, right: 16, bottom: 88, zIndex: 60},
  viewer: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#000'},
  viewport: {flex: 1, overflow: 'hidden', backgroundColor: '#000'},
  row: {flexDirection: 'row', height: '100%'},
  media: {width: '100%', height: '100%'}, videoLayer: {...StyleSheet.absoluteFillObject},
  liveButton: {position: 'absolute'},
  compareMark: {position: 'absolute', right: 16, backgroundColor: '#00000073', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999},
  topBar: {position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10},
  topRow: {flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingTop: 8},
  topCopy: {flex: 1, minWidth: 0, alignItems: 'center', gap: 1},
  bottomBar: {position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 10, justifyContent: 'flex-end'},
  actions: {flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-evenly', gap: 4, paddingHorizontal: 12, paddingBottom: 6},
  lutFooter: {gap: 10}, lutButtons: {flexDirection: 'row', gap: 10},
  shareWrap: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 40, justifyContent: 'flex-end', padding: 8},
  shareBackdrop: {position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#00000073'},
  shareSheet: {borderRadius: 32, backgroundColor: ui.color.surface, paddingHorizontal: 16, paddingBottom: 12, width: '100%', maxWidth: 680, alignSelf: 'center', elevation: 0},
  shareHandle: {width: 36, height: 5, borderRadius: 3, backgroundColor: '#48484A', alignSelf: 'center', marginTop: 6, marginBottom: 4},
  shareScroll: {flex: 1},
  shareOption: {minHeight: 56, justifyContent: 'center', gap: 2, paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: ui.color.outline},
});
