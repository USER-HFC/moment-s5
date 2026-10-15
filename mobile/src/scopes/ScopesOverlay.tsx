import React, {useEffect, useMemo, useRef} from 'react';
import {Animated, PanResponder, StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import CameraControl from '../CameraControl';
import {ui} from '../theme';
import {changeScopePanel, useScopeData} from './useScopes';
import {ScopeBounds, ScopeKind, ScopePanel, ScopePanelState, scopePanelLayout, SCOPE_KINDS, SCOPE_TITLES} from './panelState';
import {ScopeFrame} from './protocol';
import ScopePlot from './ScopePlot';

type CardProps = {kind: ScopeKind; panel: ScopePanel; bounds: ScopeBounds; data: ScopeFrame | null; stale: boolean; supported: boolean; count: number};

const ScopeCard = React.memo(function ScopeCard({kind, panel, bounds, data, stale, supported, count}: CardProps) {
  const layout = scopePanelLayout(bounds, panel.position, panel.size, panel.moved ? undefined : panel.slot, count);
  const title = layout.width < 136 ? {histogram: '直方图', waveform: '波形', parade: 'RGB', vectorscope: '矢量'}[kind] : SCOPE_TITLES[kind];
  const drag = useRef(new Animated.ValueXY({x: layout.x, y: layout.y})).current;
  const origin = useRef({x: layout.x, y: layout.y});
  const latest = useRef(layout);latest.current = layout;
  useEffect(() => {drag.setValue({x: layout.x, y: layout.y});}, [drag, layout.x, layout.y]);
  const responder = useMemo(() => {
    const move = (dx: number, dy: number) => {
      const current = latest.current;
      return {x: Math.max(current.minX, Math.min(current.minX + current.travelX, origin.current.x + dx)), y: Math.max(current.minY, Math.min(current.minY + current.travelY, origin.current.y + dy))};
    };
    const save = (dx: number, dy: number) => {
      const point = move(dx, dy), current = latest.current;
      const position = {x: current.travelX ? (point.x - current.minX) / current.travelX : panel.position.x, y: current.travelY ? (point.y - current.minY) / current.travelY : panel.position.y};
      const slot = current.columns === 1 ? panel.slot : Math.round(position.x * (current.columns - 1)) + Math.round(position.y * (current.rows - 1)) * current.columns;
      changeScopePanel({type: 'move', kind, position, slot});
    };
    return PanResponder.create({
      onMoveShouldSetPanResponder: (_, gesture) => Math.abs(gesture.dx) + Math.abs(gesture.dy) > 4,
      onPanResponderGrant: () => {origin.current = {x: latest.current.x, y: latest.current.y};changeScopePanel({type: 'raise', kind});},
      onPanResponderMove: (_, gesture) => drag.setValue(move(gesture.dx, gesture.dy)),
      onPanResponderRelease: (_, gesture) => save(gesture.dx, gesture.dy),
      onPanResponderTerminate: (_, gesture) => save(gesture.dx, gesture.dy),
      onPanResponderTerminationRequest: () => false,
    });
  }, [drag, kind, panel.position.x, panel.position.y, panel.slot]);
  const status = !supported ? '当前平台未接入示波器' : !data ? '等待取景数据' : stale ? '取景暂停' : '';
  return <Animated.View testID={`scope-panel-${kind}`} style={[styles.card, {width: layout.width, height: layout.height, zIndex: panel.layer, transform: drag.getTranslateTransform()}]}>
    <View style={styles.header}>
      <View {...responder.panHandlers} accessibilityLabel={`拖动${SCOPE_TITLES[kind]}面板`} style={styles.dragHandle}><Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.title}>{title}</Text></View>
      <CameraControl icon="close" accessibilityLabel={`关闭${SCOPE_TITLES[kind]}`} testID={`scope-close-${kind}`} onPress={() => changeScopePanel({type: 'close', kind})}/>
    </View>
    <View pointerEvents="none" style={styles.plot}>{data ? <ScopePlot kind={kind} data={data}/> : <Text style={styles.waiting}>{status}</Text>}</View>
    {kind === 'histogram' && data && <View pointerEvents="none" style={styles.histogramFooter} testID="histogram-clipping">
      <Text style={styles.clipping}>RGB 触底 {(data.clipLow / data.pixels * 100).toFixed(1)}%</Text>
      <Text style={styles.clipping}>触顶 {(data.clipHigh / data.pixels * 100).toFixed(1)}%</Text>
    </View>}
    <View pointerEvents="none" style={styles.status}>{data && stale && <Text style={[styles.waiting, styles.paused]}>取景暂停</Text>}</View>
  </Animated.View>;
});

export default function ScopesOverlay({panels, bounds, active, rotateClockwise, sourceAspectRatio}: {panels: ScopePanelState; bounds: ScopeBounds; active: boolean; rotateClockwise: boolean; sourceAspectRatio: number}) {
  const open = SCOPE_KINDS.filter(kind => panels[kind].open);
  const {data, stale, supported} = useScopeData(open.length > 0 && active, rotateClockwise, sourceAspectRatio);
  if (!open.length || !bounds.width || !bounds.height) return null;
  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill} testID="scopes-overlay">
    {open.map(kind => <ScopeCard key={kind} kind={kind} panel={panels[kind]} bounds={bounds} data={data} stale={stale} supported={supported} count={open.length}/>)}
  </View>;
}

const styles = StyleSheet.create({
  card: {position: 'absolute', left: 0, top: 0, borderRadius: ui.radius.control, backgroundColor: ui.color.overlay, borderWidth: 1, borderColor: '#B0C09C60', overflow: 'hidden'},
  header: {height: ui.icon.touch, flexDirection: 'row', alignItems: 'center'},
  dragHandle: {flex: 1, minWidth: 0, height: ui.icon.touch, paddingLeft: ui.space.sm, justifyContent: 'center'},
  title: {...ui.type.label, color: ui.color.text},
  plot: {flex: 1, minHeight: 0, padding: ui.space.xs, alignItems: 'center', justifyContent: 'center'}, waiting: {...ui.type.label, color: ui.color.muted},
  histogramFooter: {flexShrink: 0, paddingHorizontal: ui.space.sm, paddingBottom: ui.space.xs},
  clipping: {...ui.type.caption, color: ui.color.text, fontVariant: ['tabular-nums']},
  status: {position: 'absolute', left: 0, right: 0, top: ui.icon.touch, bottom: 0, alignItems: 'center', justifyContent: 'center'},
  paused: {padding: ui.space.xs, borderRadius: ui.radius.small, backgroundColor: ui.color.background},
});
