import React, {useEffect, useRef, useState} from 'react';
import {Alert, Animated, Image, Pressable, ScrollView, StyleSheet, View} from 'react-native';
import {Button, Text} from 'react-native-paper';
import {Gesture, GestureDetector} from 'react-native-gesture-handler';
import Video, {VideoRef} from 'react-native-video';
import {MomentItem} from './native';
import {theme} from './theme';

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

  useEffect(() => { if (!selectedId || !moments.some((moment) => moment.id === selectedId)) setSelectedId(moments[0]?.id); }, [moments, selectedId]);
  useEffect(() => { setPlaying(false); setVideoReady(false); setScale(1); imageOpacity.setValue(1); videoOpacity.setValue(0); }, [selected?.id, imageOpacity, videoOpacity]);
  const pinch = Gesture.Pinch().runOnJS(true).onBegin(() => { pinchStart.current = scale; }).onUpdate((event) => { setScale(Math.min(3, Math.max(1, pinchStart.current * event.scale))); }).onEnd(() => { if (scale < 1.05) setScale(1); });

  if (!selected) return <View style={styles.empty}><Text variant="titleLarge">还没有动态照片</Text><Text style={styles.muted}>拍摄一张动态照片后，它会在这里直接预览。</Text><Button mode="outlined" onPress={onBack} accessibilityLabel="返回拍照页面">返回拍照</Button></View>;

  const fadeToVideo = () => { imageOpacity.stopAnimation(); videoOpacity.stopAnimation(); Animated.parallel([Animated.timing(imageOpacity, {toValue: 0, duration: 180, useNativeDriver: true}), Animated.timing(videoOpacity, {toValue: 1, duration: 220, useNativeDriver: true})]).start(); };
  const fadeToImage = () => Animated.parallel([Animated.timing(videoOpacity, {toValue: 0, duration: 220, useNativeDriver: true}), Animated.timing(imageOpacity, {toValue: 1, duration: 320, useNativeDriver: true})]).start();
  const startPlayback = () => { if (!selected.videoUri || !selected.complete) return; setScale(1); setPlaying(true); if (videoReady) { videoRef.current?.seek(0); fadeToVideo(); } };
  const finishPlayback = () => { setPlaying(false); fadeToImage(); };
  const askDelete = (id: string) => Alert.alert('删除这张动态照片？', '只删除 App 内副本；相机 SD 卡原片和已导出到系统相册的副本会保留。', [{text: '取消', style: 'cancel'}, {text: '删除', style: 'destructive', onPress: () => { void onDelete(id); }}]);

  if (showList) return <View style={styles.root}>
    <View style={styles.listHeader}><Button mode="text" compact onPress={() => setShowList(false)} accessibilityLabel="返回最近照片预览">返回预览</Button><Text variant="titleLarge">相册</Text><View style={styles.headerSpacer}/></View>
    <ScrollView contentContainerStyle={styles.list} accessibilityLabel="动态照片列表">
      {moments.map((moment) => <View key={moment.id} style={[styles.listItem, moment.id === selected.id && styles.listItemSelected]}>
        <Pressable onPress={() => { setSelectedId(moment.id); setShowList(false); }} accessibilityRole="button" accessibilityLabel={'打开' + (moment.source || '动态照片')} style={({pressed}) => [styles.listSelect, pressed && styles.listItemPressed]}>
          {moment.imageUri ? <Image source={{uri: moment.imageUri}} style={styles.thumb} /> : <View style={[styles.thumb, styles.thumbEmpty]} />}
          <View style={styles.listCopy}><Text variant="titleMedium" numberOfLines={1}>{moment.source || '动态照片'}</Text><Text style={styles.muted}>{new Date(moment.createdAt).toLocaleString()}</Text><Text style={[styles.muted, moment.error && styles.error]}>{moment.complete ? (moment.lut ? 'LUT · ' + moment.lut : '已合成') : moment.error ? '失败：' + moment.error : '合成中'}</Text></View>
        </Pressable>
        {moment.complete && <View style={styles.listActions}><Button compact mode="outlined" onPress={() => { void onExport(moment.id); }}>导出</Button><Button compact mode="text" textColor={theme.colors.error} onPress={() => askDelete(moment.id)}>删除</Button></View>}
      </View>)}
    </ScrollView>
  </View>;

  const mediaStyle = [styles.media, {opacity: imageOpacity, transform: [{scale}]}];
  return <View style={styles.root} testID="motion-viewer">
    {controlsVisible && <View style={styles.viewerHeader}><Button mode="text" compact onPress={onBack} accessibilityLabel="返回拍照页面">返回</Button><View style={styles.viewerTitle}><Text variant="titleLarge">最近照片</Text><Text variant="labelSmall" style={styles.muted}>{new Date(selected.createdAt).toLocaleString()}</Text></View><Button mode="text" compact onPress={() => setShowList(true)} accessibilityLabel="查看相册列表">列表</Button></View>}
    <GestureDetector gesture={pinch}><View style={styles.viewer}>
      <Pressable style={styles.mediaHit} delayLongPress={240} onLongPress={startPlayback} onPress={() => setControlsVisible((value) => !value)} accessibilityRole="button" accessibilityLabel={selected.videoUri && selected.complete ? '单击显示或隐藏操作，双指缩放，长按播放动态照片' : '单击显示或隐藏操作，双指缩放查看照片'}>
        {selected.imageUri && <Animated.Image source={{uri: selected.imageUri}} style={mediaStyle} resizeMode="contain" />}
        {selected.videoUri && selected.complete && <Animated.View pointerEvents="none" style={[styles.videoLayer, {opacity: videoOpacity, transform: [{scale}]}]}><Video key={selected.id} ref={videoRef} source={{uri: selected.videoUri}} style={styles.media} resizeMode="contain" paused={!playing} repeat={false} muted={false} onLoad={() => { setVideoReady(true); if (playing) { videoRef.current?.seek(0); fadeToVideo(); } }} onEnd={finishPlayback} onError={() => { setPlaying(false); fadeToImage(); }} /></Animated.View>}
      </Pressable>
      {controlsVisible && !playing && <View pointerEvents="none" style={styles.viewerHint}><Text variant="labelMedium">{selected.videoUri && selected.complete ? '长按播放动态 · 双指缩放' : '双指缩放查看'}</Text></View>}
      {controlsVisible && selected.complete && <View style={styles.actionRow}><Button compact mode="outlined" onPress={() => { void onExport(selected.id); }} accessibilityLabel="保存到系统相册">保存到系统相册</Button><Button compact mode="text" textColor={theme.colors.error} onPress={() => askDelete(selected.id)} accessibilityLabel="删除动态照片">删除</Button></View>}
    </View></GestureDetector>
  </View>;
}

const styles = StyleSheet.create({
  root: {flex: 1, backgroundColor: '#080A08'}, empty: {flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24, backgroundColor: theme.colors.background}, muted: {color: theme.colors.onSurfaceVariant}, error: {color: theme.colors.error},
  viewerHeader: {height: 72, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between'}, viewerTitle: {alignItems: 'center', gap: 2}, headerSpacer: {width: 88},
  viewer: {flex: 1, minHeight: 280, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: '#000'}, mediaHit: {width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', overflow: 'hidden'}, media: {width: '100%', height: '100%'}, videoLayer: {...StyleSheet.absoluteFillObject}, viewerHint: {position: 'absolute', left: 0, right: 0, bottom: 22, alignItems: 'center'}, actionRow: {position: 'absolute', right: 16, bottom: 16, flexDirection: 'row', alignItems: 'center', gap: 8},
  listHeader: {height: 72, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: theme.colors.background}, list: {padding: 16, gap: 10}, listItem: {minHeight: 92, padding: 10, borderRadius: 12, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: theme.colors.surface}, listSelect: {flex: 1, minHeight: 70, flexDirection: 'row', alignItems: 'center', gap: 12}, listActions: {alignItems: 'flex-end', gap: 4}, listItemSelected: {borderWidth: 1, borderColor: theme.colors.primary}, listItemPressed: {opacity: 0.72}, thumb: {width: 104, height: 70, borderRadius: 8, backgroundColor: '#1B201B'}, thumbEmpty: {borderWidth: 1, borderColor: theme.colors.outline}, listCopy: {flex: 1, gap: 3},
});
