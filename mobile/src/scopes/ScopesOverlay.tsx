import React, {useEffect, useMemo, useRef} from 'react';
import {Animated, PanResponder, Pressable, StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import CameraIcon from '../CameraIcon';
import {ui} from '../theme';
import {changeScopePanel, useScopeData} from './useScopes';
import {ScopeBounds, ScopeKind, ScopePanel, ScopePanelState, scopePanelLayout, SCOPE_KINDS, SCOPE_TITLES} from './panelState';
import {ScopeFrame} from './protocol';
import ScopePlot from './ScopePlot';

type ChartProps = {kind: ScopeKind; panel: ScopePanel; bounds: ScopeBounds; data: ScopeFrame | null; stale: boolean; supported: boolean; count: number};

const ScopeChart = React.memo(function ScopeChart({kind, panel, bounds, data, stale, supported, count}: ChartProps) {
  const layout = scopePanelLayout(bounds, panel.position, panel.size, panel.moved ? undefined : panel.slot, count);
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
  const resize = () => changeScopePanel({type: 'resize', kind, size: panel.size === 'S' ? 'M' : 'S'});
  return <Animated.View testID={`scope-panel-${kind}`} pointerEvents="box-none" style={[styles.chart, {width: layout.width, height: layout.height, zIndex: panel.layer, transform: drag.getTranslateTransform()}]}>
    <View pointerEvents="none" style={styles.plot}>{data ? <ScopePlot kind={kind} data={data} displayWidth={layout.width} displayHeight={layout.height - 56}/> : <Text style={styles.waiting}>{status}</Text>}</View>
    <View {...responder.panHandlers} testID={`scope-move-${kind}`} accessible accessibilityRole="adjustable" accessibilityLabel={`移动${SCOPE_TITLES[kind]}`}
      accessibilityHint="拖动以移动图表，或使用无障碍方向操作"
      accessibilityActions={[{name: 'left', label: '向左'}, {name: 'right', label: '向右'}, {name: 'up', label: '向上'}, {name: 'down', label: '向下'}]}
      onAccessibilityAction={event => {
        const action = event.nativeEvent.actionName;
        changeScopePanel({type: 'move', kind, position: {
          x: layout.travelX ? (layout.x - layout.minX) / layout.travelX + (action === 'left' ? -.1 : action === 'right' ? .1 : 0) : 0,
          y: layout.travelY ? (layout.y - layout.minY) / layout.travelY + (action === 'up' ? -.1 : action === 'down' ? .1 : 0) : 0,
        }});
      }} style={[styles.control, styles.move]}><CameraIcon contrast name="move"/></View>
    <Pressable testID={`scope-resize-${kind}`} accessibilityRole="button" accessibilityLabel={`${panel.size === 'S' ? '放大' : '缩小'}${SCOPE_TITLES[kind]}`} onPress={resize} style={[styles.control, styles.resize]}><CameraIcon contrast name={panel.size === 'S' ? 'enlarge' : 'shrink'}/></Pressable>
    <Pressable testID={`scope-close-${kind}`} accessibilityRole="button" accessibilityLabel={`关闭${SCOPE_TITLES[kind]}`} onPress={() => changeScopePanel({type: 'close', kind})} style={[styles.control, styles.close]}><CameraIcon contrast name="close"/></Pressable>
    {data && stale && <View pointerEvents="none" style={styles.status}><Text style={styles.waiting}>取景暂停</Text></View>}
  </Animated.View>;
});

export default function ScopesOverlay({panels, bounds, active, rotateClockwise, sourceAspectRatio}: {panels: ScopePanelState; bounds: ScopeBounds; active: boolean; rotateClockwise: boolean; sourceAspectRatio: number}) {
  const open = SCOPE_KINDS.filter(kind => panels[kind].open);
  const {data, stale, supported} = useScopeData(open.length > 0 && active, rotateClockwise, sourceAspectRatio);
  if (!open.length || !bounds.width || !bounds.height) return null;
  return <View pointerEvents="box-none" style={StyleSheet.absoluteFill} testID="scopes-overlay">
    {open.map(kind => <ScopeChart key={kind} kind={kind} panel={panels[kind]} bounds={bounds} data={data} stale={stale} supported={supported} count={open.length}/>)}
  </View>;
}

const styles = StyleSheet.create({
  chart: {position: 'absolute', left: 0, top: 0},
  plot: {...StyleSheet.absoluteFillObject, top: 32, bottom: 24, alignItems: 'center', justifyContent: 'center'},
  control: {position: 'absolute', width: ui.icon.touch, height: ui.icon.touch, alignItems: 'center', justifyContent: 'center'},
  move: {left: 0, top: 0}, close: {right: 0, top: 0}, resize: {right: 0, bottom: 0},
  waiting: {...ui.type.label, color: ui.color.text, textShadowColor: '#000', textShadowRadius: 3},
  status: {...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center'},
});
