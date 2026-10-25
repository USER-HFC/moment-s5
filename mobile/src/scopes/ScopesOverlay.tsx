import React, {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Animated, Easing, PanResponder, Pressable, StyleSheet, Vibration, View} from 'react-native';
import {Text} from 'react-native-paper';
import Svg, {Circle} from 'react-native-svg';
import ScopeControlIcon from './ScopeControlIcon';
import {ui} from '../theme';
import {changeScopePanel, takeScopeRevealHint, useScopeData} from './useScopes';
import {ScopeBounds, ScopeKind, ScopePanel, ScopePanelState, scopePanelLayout, SCOPE_KINDS, SCOPE_TITLES} from './panelState';
import {ScopeFrame} from './protocol';
import ScopePlot from './ScopePlot';

type ChartProps = {kind: ScopeKind; panel: ScopePanel; bounds: ScopeBounds; data: ScopeFrame | null; stale: boolean; supported: boolean; count: number; selected: boolean; onAutoHide: () => void};

export const SCOPE_CONTROLS_IDLE_MS = 5000;
export const SCOPE_CONTROLS_REVEAL_MS = 3000;
export const SCOPE_PRESS_FEEDBACK_MS = 300;
export const SCOPE_HINT_MS = 2000;
export const SCOPE_HINT_FADE_MS = 300;
export const SCOPE_REVEAL_HINT = '长按图表 3 秒显示操作';

const RING_RADIUS = 10;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Haptics are a nicety: a failed vibration must never block revealing the controls.
function vibrateConfirmation() {
  try {Vibration.vibrate(12);} catch { /* VIBRATE permission may be missing on forks. */ }
}

const ScopeChart = React.memo(function ScopeChart({kind, panel, bounds, data, stale, supported, count, selected, onAutoHide}: ChartProps) {
  const layout = scopePanelLayout(bounds, panel.position, panel.size, panel.moved ? undefined : panel.slot, count);
  const drag = useRef(new Animated.ValueXY({x: layout.x, y: layout.y})).current;
  const origin = useRef({x: layout.x, y: layout.y});
  const latest = useRef(layout);latest.current = layout;
  const [controlsVisible, setControlsVisible] = useState(true);
  const [pressFeedback, setPressFeedback] = useState(false);
  const controlsRef = useRef(true);
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearIdleRef = useRef(() => {});
  const hideLaterRef = useRef(() => {});
  const autoHideRef = useRef(onAutoHide);autoHideRef.current = onAutoHide;
  const progress = useRef(new Animated.Value(0)).current;
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressAnimation = useRef<Animated.CompositeAnimation | null>(null);
  clearIdleRef.current = () => {if (idle.current) {clearTimeout(idle.current); idle.current = null;}};
  hideLaterRef.current = () => {
    clearIdleRef.current();
    idle.current = setTimeout(() => {controlsRef.current = false; setControlsVisible(false); autoHideRef.current();}, SCOPE_CONTROLS_IDLE_MS);
  };
  const cancelPressFeedback = () => {
    if (pressTimer.current) {clearTimeout(pressTimer.current); pressTimer.current = null;}
    pressAnimation.current?.stop();pressAnimation.current = null;
    progress.stopAnimation();progress.setValue(0);
    setPressFeedback(false);
  };
  const startPressFeedback = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    // The ring appears only once the press is deliberate; before that the chart stays untouched.
    pressTimer.current = setTimeout(() => {
      pressTimer.current = null;
      setPressFeedback(true);
      progress.setValue(0);
      pressAnimation.current = Animated.timing(progress, {
        toValue: 1, duration: SCOPE_CONTROLS_REVEAL_MS - SCOPE_PRESS_FEEDBACK_MS, easing: Easing.linear, useNativeDriver: false,
      });
      pressAnimation.current.start();
    }, SCOPE_PRESS_FEEDBACK_MS);
  };
  const cancelPressRef = useRef(cancelPressFeedback);cancelPressRef.current = cancelPressFeedback;
  const showControls = () => {
    controlsRef.current = true; setControlsVisible(true); hideLaterRef.current();
    changeScopePanel({type: 'raise', kind});
  };
  const revealControls = () => {
    cancelPressFeedback();
    showControls();
    vibrateConfirmation();
  };
  const poke = () => {if (controlsRef.current) hideLaterRef.current();};
  useEffect(() => {drag.setValue({x: layout.x, y: layout.y});}, [drag, layout.x, layout.y]);
  useEffect(() => {hideLaterRef.current(); return () => {
    clearIdleRef.current();
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressAnimation.current?.stop();
  };}, []);
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
      onMoveShouldSetPanResponderCapture: (_, gesture) => Math.abs(gesture.dx) + Math.abs(gesture.dy) > 4,
      onPanResponderGrant: () => {
        cancelPressRef.current();
        origin.current = {x: latest.current.x, y: latest.current.y};
        changeScopePanel({type: 'raise', kind});
        clearIdleRef.current();
      },
      onPanResponderMove: (_, gesture) => drag.setValue(move(gesture.dx, gesture.dy)),
      onPanResponderRelease: (_, gesture) => {save(gesture.dx, gesture.dy); if (controlsRef.current) hideLaterRef.current();},
      onPanResponderTerminate: (_, gesture) => {save(gesture.dx, gesture.dy); if (controlsRef.current) hideLaterRef.current();},
      onPanResponderTerminationRequest: () => false,
    });
  }, [drag, kind, panel.position.x, panel.position.y, panel.slot]);
  const status = !supported ? '当前平台未接入示波器' : !data ? '等待取景数据' : stale ? '取景暂停' : '';
  const resize = () => changeScopePanel({type: 'resize', kind, size: panel.size === 'S' ? 'M' : 'S'});
  const nudge = (action: string) => changeScopePanel({type: 'move', kind, position: {
    x: layout.travelX ? (layout.x - layout.minX) / layout.travelX + (action === 'left' ? -.1 : action === 'right' ? .1 : 0) : 0,
    y: layout.travelY ? (layout.y - layout.minY) / layout.travelY + (action === 'up' ? -.1 : action === 'down' ? .1 : 0) : 0,
  }});
  if (layout.width < 3 * ui.icon.touch || layout.height < ui.icon.touch + 24) return null;
  return <Animated.View testID={`scope-panel-${kind}`} pointerEvents="box-none" style={[styles.chart, {width: layout.width, height: layout.height, zIndex: panel.layer, transform: drag.getTranslateTransform()}]}>
    <View pointerEvents="none" style={styles.plot}>{data ? <ScopePlot kind={kind} data={data} displayWidth={layout.width} displayHeight={layout.height - 44}/> : <Text style={styles.waiting}>{status}</Text>}</View>
    {/* Hidden controls keep chart-body drag. A still 3s press only brings the buttons back. */}
    <View testID={`scope-drag-${kind}`} pointerEvents={controlsVisible ? 'none' : 'auto'} style={styles.surface} {...(controlsVisible ? {} : responder.panHandlers)}>
      {!controlsVisible && <Pressable testID={`scope-reveal-${kind}`} accessibilityRole="adjustable" accessibilityLabel={`${SCOPE_TITLES[kind]}，图表操作已隐藏`}
        delayLongPress={SCOPE_CONTROLS_REVEAL_MS} onLongPress={revealControls} onPressIn={startPressFeedback} onPressOut={cancelPressFeedback} style={styles.surface}
        accessibilityHint="长按三秒显示移动、缩放和关闭。拖动可移动图表。无障碍操作可直接移动、缩放或关闭"
        accessibilityActions={[
          {name: 'activate', label: '显示图表操作'}, {name: 'longpress', label: '显示图表操作'},
          {name: 'resize', label: panel.size === 'S' ? '放大' : '缩小'}, {name: 'close', label: '关闭'},
          {name: 'left', label: '向左'}, {name: 'right', label: '向右'}, {name: 'up', label: '向上'}, {name: 'down', label: '向下'},
        ]}
        onAccessibilityAction={event => {
          const action = event.nativeEvent.actionName;
          if (action === 'activate' || action === 'longpress') {showControls(); return;}
          if (action === 'resize') {resize(); return;}
          if (action === 'close') {changeScopePanel({type: 'close', kind}); return;}
          nudge(action);
        }}/>}
    </View>
    {pressFeedback && <View testID={`scope-press-feedback-${kind}`} pointerEvents="none" style={styles.pressFeedback}>
      <Svg width={32} height={32} viewBox="0 0 32 32">
        <Circle cx={16} cy={16} r={15} fill="#101210D9"/>
        <Circle cx={16} cy={16} r={RING_RADIUS} fill="none" stroke="#FFFFFF66" strokeWidth={2.5}/>
        <AnimatedCircle cx={16} cy={16} r={RING_RADIUS} fill="none" stroke={ui.color.accent} strokeWidth={2.5} strokeLinecap="round"
          strokeDasharray={`${RING_CIRCUMFERENCE} ${RING_CIRCUMFERENCE}`}
          strokeDashoffset={progress.interpolate({inputRange: [0, 1], outputRange: [RING_CIRCUMFERENCE, 0]})}
          transform="rotate(-90 16 16)"/>
      </Svg>
    </View>}
    {controlsVisible && <View pointerEvents="box-none" style={styles.controls}>
    <View {...responder.panHandlers} style={styles.control}>
    <Pressable testID={`scope-move-${kind}`} accessible accessibilityRole="adjustable" accessibilityLabel={`移动${SCOPE_TITLES[kind]}`}
      accessibilityState={{selected}} onPress={() => {poke(); changeScopePanel({type: 'raise', kind});}} onFocus={() => {if (!selected) {poke(); changeScopePanel({type: 'raise', kind});}}}
      accessibilityHint="点按显示缩放和关闭，拖动以移动图表。5 秒无操作后隐藏，长按图表 3 秒再显示，或使用无障碍方向操作"
      accessibilityActions={[{name: 'activate', label: '显示图表操作'}, {name: 'left', label: '向左'}, {name: 'right', label: '向右'}, {name: 'up', label: '向上'}, {name: 'down', label: '向下'}]}
      onAccessibilityAction={event => {
        const action = event.nativeEvent.actionName;
        poke();
        if (action === 'activate') {changeScopePanel({type: 'raise', kind}); return;}
        nudge(action);
      }} style={styles.control}><View pointerEvents="none" style={[styles.icon, selected ? styles.selected : styles.idle]}><ScopeControlIcon name="move" active={selected}/></View></Pressable>
    </View>
    {selected && <>
      <Pressable testID={`scope-resize-${kind}`} accessibilityRole="button" accessibilityLabel={`${panel.size === 'S' ? '放大' : '缩小'}${SCOPE_TITLES[kind]}`} onPress={() => {poke(); resize();}} style={styles.control}>{({pressed}) => <View style={[styles.icon, pressed && styles.pressed]}><ScopeControlIcon name={panel.size === 'S' ? 'enlarge' : 'shrink'}/></View>}</Pressable>
      <Pressable testID={`scope-close-${kind}`} accessibilityRole="button" accessibilityLabel={`关闭${SCOPE_TITLES[kind]}`} onPress={() => {poke(); changeScopePanel({type: 'close', kind});}} style={styles.control}>{({pressed}) => <View style={[styles.icon, pressed && styles.pressed]}><ScopeControlIcon name="close"/></View>}</Pressable>
    </>}
    </View>}
    {data && stale && <View pointerEvents="none" style={styles.status}><Text style={styles.waiting}>取景暂停</Text></View>}
  </Animated.View>;
});

export default function ScopesOverlay({panels, bounds, active, rotateClockwise, sourceAspectRatio}: {panels: ScopePanelState; bounds: ScopeBounds; active: boolean; rotateClockwise: boolean; sourceAspectRatio: number}) {
  const open = SCOPE_KINDS.filter(kind => panels[kind].open);
  const {data, stale, supported} = useScopeData(open.length > 0 && active, rotateClockwise, sourceAspectRatio);
  const [hintVisible, setHintVisible] = useState(false);
  const hintOpacity = useRef(new Animated.Value(0)).current;
  const hintTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const onAutoHide = useCallback(() => {
    if (!takeScopeRevealHint()) return;
    setHintVisible(true);
    hintOpacity.setValue(0);
    Animated.timing(hintOpacity, {toValue: 1, duration: 150, useNativeDriver: false}).start();
    hintTimers.current.push(setTimeout(() => {
      Animated.timing(hintOpacity, {toValue: 0, duration: SCOPE_HINT_FADE_MS, useNativeDriver: false}).start();
    }, SCOPE_HINT_MS));
    hintTimers.current.push(setTimeout(() => setHintVisible(false), SCOPE_HINT_MS + SCOPE_HINT_FADE_MS));
  }, [hintOpacity]);
  useEffect(() => () => {
    hintTimers.current.forEach(clearTimeout);
    hintOpacity.stopAnimation();
  }, [hintOpacity]);
  if (!open.length || !bounds.width || !bounds.height) return null;
  const selected = open.reduce((front, kind) => panels[kind].layer > panels[front].layer ? kind : front);
  return <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, styles.overlay]} testID="scopes-overlay">
    {open.map(kind => <ScopeChart key={kind} kind={kind} panel={panels[kind]} bounds={bounds} data={data} stale={stale} supported={supported} count={open.length} selected={selected === kind} onAutoHide={onAutoHide}/>)}
    {hintVisible && <View pointerEvents="none" style={styles.hintWrap}>
      <Animated.View testID="scope-reveal-hint" style={[styles.hint, {opacity: hintOpacity}]}>
        <Text accessibilityLiveRegion="polite" style={styles.hintText}>{SCOPE_REVEAL_HINT}</Text>
      </Animated.View>
    </View>}
  </View>;
}

const styles = StyleSheet.create({
  // Above the HUD (z 1000) and below the countdown (z 1100). The plot has no fill, so HUD text stays readable underneath.
  overlay: {zIndex: 1050},
  chart: {position: 'absolute', left: 0, top: 0},
  surface: {...StyleSheet.absoluteFillObject},
  plot: {...StyleSheet.absoluteFillObject, top: 40, bottom: 4, alignItems: 'center', justifyContent: 'center'},
  controls: {position: 'absolute', top: 0, left: 0, flexDirection: 'row'},
  control: {width: ui.icon.touch, height: ui.icon.touch, alignItems: 'center', justifyContent: 'center'},
  icon: {width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center'},
  selected: {backgroundColor: '#344329CC'}, idle: {opacity: .8}, pressed: {backgroundColor: ui.color.pressed},
  pressFeedback: {position: 'absolute', top: 44, left: '50%', marginLeft: -16, width: 32, height: 32},
  waiting: {...ui.type.label, color: ui.color.text, textShadowColor: '#000', textShadowRadius: 3},
  status: {...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center'},
  hintWrap: {...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', zIndex: 20},
  hint: {paddingHorizontal: ui.space.md, paddingVertical: ui.space.xs + 2, borderRadius: ui.radius.pill, backgroundColor: ui.color.badge},
  hintText: {...ui.type.caption, color: ui.color.text},
});
