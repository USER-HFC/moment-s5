import React, {useEffect, useMemo, useRef} from 'react';
import {Animated, PanResponder, Pressable, StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import {changeScopePanel, useScopeData} from './useScopes';
import {ScopeBounds, ScopeKind, ScopePanel, ScopePanelState, scopePanelLayout, SCOPE_KINDS, SCOPE_TITLES} from './panelState';
import {ScopeFrame} from './protocol';
import ScopePlot from './ScopePlot';

type CardProps = {kind: ScopeKind; panel: ScopePanel; bounds: ScopeBounds; data: ScopeFrame | null; stale: boolean; supported: boolean};

const ScopeCard = React.memo(function ScopeCard({kind, panel, bounds, data, stale, supported}: CardProps) {
  const layout = scopePanelLayout(bounds, panel.position);
  const drag = useRef(new Animated.ValueXY({x: layout.x, y: layout.y})).current;
  const origin = useRef({x: layout.x, y: layout.y});
  const latest = useRef(layout);latest.current = layout;
  useEffect(() => {drag.setValue({x: layout.x, y: layout.y});}, [drag, layout.x, layout.y]);
  const responder = useMemo(() => {
    const move = (dx: number, dy: number) => {
      const current = latest.current;
      return {x: Math.max(6, Math.min(6 + current.travelX, origin.current.x + dx)), y: Math.max(6, Math.min(6 + current.travelY, origin.current.y + dy))};
    };
    const save = (dx: number, dy: number) => {
      const point = move(dx, dy), current = latest.current;
      changeScopePanel({type: 'move', kind, position: {x: current.travelX ? (point.x - 6) / current.travelX : panel.position.x, y: current.travelY ? (point.y - 6) / current.travelY : panel.position.y}});
    };
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) + Math.abs(gesture.dy) > 4,
      onPanResponderGrant: () => {origin.current = {x: latest.current.x, y: latest.current.y};changeScopePanel({type: 'raise', kind});},
      onPanResponderMove: (_, gesture) => drag.setValue(move(gesture.dx, gesture.dy)),
      onPanResponderRelease: (_, gesture) => save(gesture.dx, gesture.dy),
      onPanResponderTerminate: (_, gesture) => save(gesture.dx, gesture.dy),
      onPanResponderTerminationRequest: () => false,
    });
  }, [drag, kind, panel.position.x, panel.position.y]);
  const status = !supported ? '当前平台未接入示波器' : !data ? '等待取景数据' : stale ? '取景暂停' : `${data.demo ? '演示 · ' : ''}LUT 后 · 约10 Hz`;
  const clipping = data ? `RGB 触底 ${(data.clipLow / data.pixels * 100).toFixed(1)}% · 触顶 ${(data.clipHigh / data.pixels * 100).toFixed(1)}%` : '';
  return <Animated.View testID={`scope-panel-${kind}`} style={[styles.card, {width: layout.width, height: layout.height, zIndex: panel.layer, transform: drag.getTranslateTransform()}]}>
    <View style={styles.header}>
      <View {...responder.panHandlers} accessibilityLabel={`拖动${SCOPE_TITLES[kind]}面板`} style={styles.dragHandle}><Text numberOfLines={1} maxFontSizeMultiplier={1.2} style={styles.title}>{SCOPE_TITLES[kind]}</Text><Text style={styles.grip}>⋮⋮</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel={`关闭${SCOPE_TITLES[kind]}`} testID={`scope-close-${kind}`} onPress={() => changeScopePanel({type: 'close', kind})} style={({pressed}) => [styles.close, pressed && styles.pressed]}><Text style={styles.closeText}>×</Text></Pressable>
    </View>
    <View pointerEvents="none" style={styles.plot}>{data ? <ScopePlot kind={kind} data={data}/> : <Text style={styles.waiting}>{status}</Text>}</View>
    <View pointerEvents="none" style={styles.footer}><Text numberOfLines={1} maxFontSizeMultiplier={1.1} style={styles.caption}>{kind === 'histogram' && data && !stale ? clipping : status}</Text></View>
  </Animated.View>;
});

export default function ScopesOverlay({panels, bounds, active, rotateClockwise, sourceAspectRatio}: {panels: ScopePanelState; bounds: ScopeBounds; active: boolean; rotateClockwise: boolean; sourceAspectRatio: number}) {
  const open = SCOPE_KINDS.filter(kind => panels[kind].open);
  const {data, stale, supported} = useScopeData(open.length > 0 && active, rotateClockwise, sourceAspectRatio);
  if (!open.length || !bounds.width || !bounds.height) return null;
  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill} testID="scopes-overlay">
    {open.map(kind => <ScopeCard key={kind} kind={kind} panel={panels[kind]} bounds={bounds} data={data} stale={stale} supported={supported}/>)}
  </View>;
}

const styles = StyleSheet.create({
  card: {position: 'absolute', left: 0, top: 0, borderRadius: 9, backgroundColor: '#101713CC', borderWidth: 1, borderColor: '#B0C09C60', overflow: 'hidden'},
  header: {height: 48, flexDirection: 'row', alignItems: 'center'}, dragHandle: {flex: 1, minWidth: 0, height: 48, paddingLeft: 9, flexDirection: 'row', alignItems: 'center', gap: 3},
  title: {flex: 1, color: '#E8EDDF', fontSize: 11, fontWeight: '600'}, grip: {fontSize: 12, color: '#9EAB96'},
  close: {width: 48, height: 48, alignItems: 'center', justifyContent: 'center'}, closeText: {fontSize: 24, color: '#E8EDDF'}, pressed: {backgroundColor: '#FFFFFF20'},
  plot: {flex: 1, minHeight: 0, paddingHorizontal: 2, alignItems: 'center', justifyContent: 'center'}, waiting: {fontSize: 11, color: '#B0B9AB'},
  footer: {height: 22, justifyContent: 'center', paddingHorizontal: 7}, caption: {fontSize: 9, color: '#B0B9AB', fontVariant: ['tabular-nums']},
});
