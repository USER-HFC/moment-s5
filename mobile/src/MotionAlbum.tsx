import React, {useEffect, useRef, useState} from 'react';
import {Alert, Animated, AppState, Image, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Video, {VideoRef} from 'react-native-video';
import {MomentItem} from './native';
import {ui} from './theme';
import CameraControl from './CameraControl';

export function formatMomentDate(timestamp: number) {
  const date = new Date(timestamp);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${two(date.getHours())}:${two(date.getMinutes())}`;
}

type Props = {moments: MomentItem[]; onBack: () => void; onExport: (id: string) => Promise<void>; onDelete: (id: string) => Promise<void>};

export default function MotionAlbum({moments, onBack, onExport, onDelete}: Props) {
  const [selectedId, setSelectedId] = useState(moments[0]?.id);
  const [showList, setShowList] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [playing, setPlaying] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [scale, setScale] = useState(1);
  const pinchStart = useRef(1);
  const videoRef = useRef<VideoRef>(null);
  const imageOpacity = useRef(new Animated.Value(1)).current;
  const videoOpacity = useRef(new Animated.Value(0)).current;
  const selected = moments.find((moment) => moment.id === selectedId) || moments[0];

  useEffect(() => {
    if (!controlsVisible || showList) return;
    const timer = setTimeout(() => setControlsVisible(false), 5000);
    return () => clearTimeout(timer);
  }, [controlsVisible, showList, selected?.id]);
  useEffect(() => { if (!selectedId || !moments.some((moment) => moment.id === selectedId)) setSelectedId(moments[0]?.id); }, [moments, selectedId]);
  useEffect(() => { setPlaying(false); setVideoReady(false); setScale(1); imageOpacity.setValue(1); videoOpacity.setValue(0); }, [selected?.id, imageOpacity, videoOpacity]);
  useEffect(() => {
    if (showList) { setPlaying(false); setVideoReady(false); imageOpacity.setValue(1); videoOpacity.setValue(0); }
  }, [showList, imageOpacity, videoOpacity]);
  useEffect(() => {
    const sub = AppState.addEventListener('change', next => {
      if (next !== 'active') { setPlaying(false); imageOpacity.setValue(1); videoOpacity.setValue(0); }
    });
    return () => { sub.remove(); imageOpacity.stopAnimation(); videoOpacity.stopAnimation(); };
  }, [imageOpacity, videoOpacity]);
  const pinch = Gesture.Pinch().runOnJS(true).onBegin(() => { pinchStart.current = scale; }).onUpdate((event) => { setScale(Math.min(3, Math.max(1, pinchStart.current * event.scale))); }).onEnd(() => { if (scale < 1.05) setScale(1); });

  if (!selected) return <View style={styles.empty}><Text variant="titleLarge">还没有动态照片</Text><Text style={styles.muted}>拍摄一张动态照片后，它会在这里直接预览。</Text><CameraControl icon="back" label="返回" onPress={onBack} accessibilityLabel="返回拍照页面"/></View>;

  const fadeToVideo = () => { imageOpacity.stopAnimation(); videoOpacity.stopAnimation(); Animated.parallel([Animated.timing(imageOpacity, {toValue: 0, duration: 180, useNativeDriver: true}), Animated.timing(videoOpacity, {toValue: 1, duration: 220, useNativeDriver: true})]).start(); };
  const fadeToImage = () => Animated.parallel([Animated.timing(videoOpacity, {toValue: 0, duration: 220, useNativeDriver: true}), Animated.timing(imageOpacity, {toValue: 1, duration: 320, useNativeDriver: true})]).start();
  const startPlayback = () => { if (!selected.videoUri || !selected.complete) return; setScale(1); setPlaying(true); if (videoReady) { videoRef.current?.seek(0); fadeToVideo(); } };
  const finishPlayback = () => { setPlaying(false); fadeToImage(); };
  const askDelete = (id: string) => Alert.alert('删除这张动态照片？', '只删除 App 内副本；相机 SD 卡原片和已导出到系统相册的副本会保留。', [{text: '取消', style: 'cancel'}, {text: '删除', style: 'destructive', onPress: () => { void onDelete(id); }}]);

  if (showList) return <View style={styles.root}>
    <View style={styles.listHeader}><CameraControl icon="back" accessibilityLabel="返回最近照片预览" onPress={() => {setShowList(false); setControlsVisible(true);}}/><Text style={styles.headerTitle}>相册</Text><View style={styles.headerSpacer}/></View>
    <ScrollView contentContainerStyle={styles.list} accessibilityLabel="动态照片列表">
      {moments.map((moment) => <View key={moment.id} style={[styles.listItem, moment.id === selected.id && styles.listItemSelected]}>
        <Pressable onPress={() => { setSelectedId(moment.id); setShowList(false); }} accessibilityRole="button" accessibilityLabel={'打开' + (moment.source || '动态照片')} style={({pressed}) => [styles.listSelect, pressed && styles.listItemPressed]}>
          <View>
            {moment.imageUri ? <Image source={{uri: moment.imageUri}} style={styles.thumb}/> : <View style={[styles.thumb, styles.thumbEmpty]}/>}
            {moment.videoUri && moment.complete && <Text maxFontSizeMultiplier={1.3} style={styles.liveThumb}>LIVE</Text>}
          </View>
          <View style={styles.listCopy}><Text variant="titleMedium" numberOfLines={1}>{moment.source || '动态照片'}</Text><Text style={styles.muted}>{formatMomentDate(moment.createdAt)}</Text><Text style={[styles.muted, moment.error && styles.error]}>{moment.complete ? (moment.lut ? 'LUT · ' + moment.lut : '已合成') : moment.error ? '失败：' + moment.error : '合成中'}</Text></View>
        </Pressable>
        <View style={styles.listActions}>{moment.complete && <CameraControl icon="save" label="保存" accessibilityLabel={`保存到系统相册 ${moment.source || moment.id}`} onPress={() => {void onExport(moment.id);}}/>}<CameraControl icon="delete" label="删除" destructive accessibilityLabel={`删除动态照片 ${moment.source || moment.id}`} onPress={() => askDelete(moment.id)}/></View>
      </View>)}
    </ScrollView>
  </View>;

  const mediaStyle = [styles.media, {opacity: imageOpacity, transform: [{scale}]}];
  return <View style={styles.root} testID="motion-viewer">
    {controlsVisible && <ScrollView style={styles.viewerHeader} contentContainerStyle={styles.viewerHeaderContent}><CameraControl icon="back" accessibilityLabel="返回拍照页面" onPress={onBack}/><View style={styles.viewerTitle}><Text style={styles.headerTitle}>最近照片</Text><Text style={styles.date}>{formatMomentDate(selected.createdAt)}</Text></View><CameraControl icon="list" accessibilityLabel="查看相册列表" onPress={() => setShowList(true)}/></ScrollView>}
    <GestureDetector gesture={pinch}><View style={styles.viewer}>
      <Pressable style={styles.mediaHit} delayLongPress={240} onLongPress={startPlayback} onPressOut={finishPlayback} onPress={() => setControlsVisible((value) => !value)} accessibilityRole="button" accessibilityLabel={selected.videoUri && selected.complete ? '单击显示或隐藏操作，双指缩放，长按播放动态照片' : '单击显示或隐藏操作，双指缩放查看照片'}>
        {selected.imageUri && <Animated.Image source={{uri: selected.imageUri}} style={mediaStyle} resizeMode="contain" />}
        {selected.videoUri && selected.complete && <Animated.View pointerEvents="none" style={[styles.videoLayer, {opacity: videoOpacity, transform: [{scale}]}]}><Video key={selected.id} ref={videoRef} source={{uri: selected.videoUri}} style={styles.media} resizeMode="contain" paused={!playing} repeat={false} muted={false} onLoad={() => { if (playing) videoRef.current?.seek(0); }} onReadyForDisplay={() => { setVideoReady(true); if (playing) fadeToVideo(); }} onEnd={finishPlayback} onError={() => { setPlaying(false); fadeToImage(); }} /></Animated.View>}
      </Pressable>
      {selected.videoUri && selected.complete && <View pointerEvents="none" style={styles.liveBadge}><Text maxFontSizeMultiplier={1.3} style={styles.liveText}>LIVE</Text></View>}
      {controlsVisible && <ScrollView style={styles.viewerControls} contentContainerStyle={styles.controlsContent}>
        {!playing && <View pointerEvents="none"><Text style={styles.viewerHint}>{selected.videoUri && selected.complete ? '长按播放动态 · 双指缩放' : '双指缩放查看'}</Text></View>}
        <View style={styles.actionRow}>{selected.complete && <CameraControl icon="save" label="保存" accessibilityLabel="保存到系统相册" onPress={() => {void onExport(selected.id);}}/>}<CameraControl icon="delete" label="删除" destructive accessibilityLabel="删除动态照片" onPress={() => askDelete(selected.id)}/></View>
      </ScrollView>}
    </View></GestureDetector>
  </View>;
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: ui.color.background}, empty: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: ui.space.md, padding: ui.space.lg, backgroundColor: ui.color.background},
  muted: {...ui.type.caption, color: ui.color.muted}, error: {color: ui.color.muted},
  viewerHeader: {position: 'absolute', top: ui.space.gutter, left: ui.space.gutter, right: ui.space.gutter, zIndex: 2, maxHeight: '35%', flexGrow: 0, borderRadius: ui.radius.sheet, backgroundColor: ui.color.badge},
  viewerHeaderContent: {padding: ui.space.sm, flexDirection: 'row', alignItems: 'center', gap: ui.space.sm},
  viewerTitle: {flex: 1, alignItems: 'center', gap: ui.space.xs}, headerTitle: {...ui.type.title, color: ui.color.text}, date: {...ui.type.caption, color: ui.color.muted, textAlign: 'center'}, headerSpacer: {width: ui.icon.touch},
  viewer: {flex: 1, minHeight: 0, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: '#000'},
  mediaHit: {width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', overflow: 'hidden'}, media: {width: '100%', height: '100%'}, videoLayer: {...StyleSheet.absoluteFillObject},
  viewerControls: {position: 'absolute', left: ui.space.gutter, right: ui.space.gutter, bottom: ui.space.gutter, maxHeight: '35%', flexGrow: 0, borderRadius: ui.radius.sheet, backgroundColor: ui.color.badge},
  controlsContent: {alignItems: 'center', gap: ui.space.sm, padding: ui.space.md},
  viewerHint: {...ui.type.caption, color: ui.color.text, textAlign: 'center'}, actionRow: {flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: ui.space.lg, flexWrap: 'wrap'},
  liveBadge: {position: 'absolute', top: '50%', transform: [{translateY: -ui.space.md}], left: ui.space.gutter, paddingHorizontal: ui.space.sm, paddingVertical: ui.space.xs, borderRadius: ui.radius.small, backgroundColor: ui.color.badge}, liveText: {...ui.type.label, color: ui.color.text},
  listHeader: {minHeight: 64, paddingHorizontal: ui.space.gutter, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}, list: {padding: ui.space.gutter, gap: ui.space.md},
  listItem: {padding: ui.space.md, borderRadius: ui.radius.control, gap: ui.space.sm, backgroundColor: ui.color.surface, borderWidth: 1, borderColor: 'transparent'}, listSelect: {minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: ui.space.md},
  listActions: {flexDirection: 'row', justifyContent: 'flex-end', gap: ui.space.sm}, listItemSelected: {borderColor: ui.color.accent}, listItemPressed: {opacity: .72},
  thumb: {width: 96, height: 64, borderRadius: ui.radius.small, backgroundColor: ui.color.surface}, thumbEmpty: {borderWidth: 1, borderColor: ui.color.outline}, listCopy: {flex: 1, minWidth: 0, gap: ui.space.xs},
  liveThumb: {position: 'absolute', bottom: ui.space.xs, left: ui.space.xs, paddingHorizontal: ui.space.xs, borderRadius: ui.space.xs, backgroundColor: ui.color.badge, color: ui.color.text, ...ui.type.label},
});
