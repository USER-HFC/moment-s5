import React, {useEffect, useRef, useState} from 'react';
import {PermissionsAndroid, Platform, Pressable, StyleSheet, View} from 'react-native';
import {Button, Switch, Text, TextInput} from 'react-native-paper';
import CameraSheet from '../CameraSheet';
import {ui} from '../theme';
import {CameraState} from '../native';
import {connectionOptions, ConnectionForm, initialConnectionForm, WifiConnectionOptions} from './model';
import {ConnectionMemory, DEFAULT_CONNECTION} from '../preferences';
import {userFacingError} from '../captureError';

type Props = {visible: boolean; state: CameraState; status: string; debugAllowed: boolean; remembered?: ConnectionMemory; onClose: () => void; onUsb: () => Promise<void>; onWifi: (options: WifiConnectionOptions) => Promise<void>; onDemo: () => Promise<void>; onDisconnect: () => void};
const MODES = [
  {value: 'usb', label: 'USB', accessibilityLabel: 'USB 连接方式'},
  {value: 'wifi', label: 'Wi-Fi', badge: '实验', accessibilityLabel: 'Wi-Fi（实验）'},
  {value: 'demo', label: '演示', accessibilityLabel: '演示连接方式'},
] as const;
const USB_STEPS = [
  '相机：设置 → USB → PC(Tether)',
  '用支持数据的 USB-C 线',
  'OPPO/ColorOS 在设置里开启 OTG',
];
const WIFI_STEPS = [
  '相机开启 Wi-Fi 遥控拍摄',
  '手机连上相机热点',
  '确认相机 IP，一般不用改',
];

function Steps({items, testID}: {items: readonly string[]; testID: string}) {
  return <View testID={testID} style={styles.steps}>{items.map((item, index) => <View key={item} style={styles.step}>
    <Text style={styles.stepIndex}>{index + 1}</Text>
    <Text style={styles.stepText}>{item}</Text>
  </View>)}</View>;
}

export async function requestWifiPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const permission = PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES;
  if (await PermissionsAndroid.check(permission)) return true;
  return (await PermissionsAndroid.request(permission)) === PermissionsAndroid.RESULTS.GRANTED;
}

export default function ConnectionSheet({visible, state, status, debugAllowed, remembered = DEFAULT_CONNECTION, onClose, onUsb, onWifi, onDemo, onDisconnect}: Props) {
  const [mode, setMode] = useState<'usb' | 'wifi' | 'demo'>('usb');
  const [form, setForm] = useState<ConnectionForm>(initialConnectionForm);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!visible) return;
    // An active session wins. Otherwise reopen on the last successful way and IP, never on a failed attempt.
    if (state.active) setMode(state.demo ? 'demo' : state.transport === 'wifi' ? 'wifi' : 'usb');
    else if (remembered.method) setMode(remembered.method);
    setForm(current => current.cameraIp === remembered.cameraIp ? current : {...current, cameraIp: remembered.cameraIp});
  }, [visible, state.active, state.demo, state.transport, remembered.method, remembered.cameraIp]);
  const set = <K extends keyof ConnectionForm>(key: K, value: ConnectionForm[K]) => setForm(current => ({...current, [key]: value}));
  const submit = async () => {
    if (pendingRef.current || state.busy) return;
    pendingRef.current = true;
    setPending(true); setError('');
    try {
      if (mode === 'usb') await onUsb();
      else if (mode === 'demo') await onDemo();
      else {
        const options = connectionOptions(form, debugAllowed);
        if (!options.manual && !(await requestWifiPermission())) throw new Error('附近 Wi-Fi 设备权限未授权；可在系统设置手动连接相机 Wi-Fi');
        await onWifi(options);
      }
    } catch (e) { setError(userFacingError(String((e as Error)?.message || e))); }
    finally { pendingRef.current = false; setPending(false); }
  };
  const currentConnection = !state.active ? '未连接' : state.demo ? '演示中' : state.transport === 'wifi' ? 'Wi-Fi 已连接' : 'USB 已连接';
  const submitLabel = mode === 'usb' ? '连接 USB 相机' : mode === 'wifi' ? '连接 Wi-Fi 相机' : '体验演示';
  const busy = pending || state.busy;
  return <CameraSheet visible={visible} title="连接相机" onClose={onClose} dismissLabel="✕" dismissAccessibilityLabel="关闭">
        <Text style={styles.connection} accessibilityLiveRegion="polite">{`${currentConnection}${state.busy ? ' · 处理中' : ''}`}</Text>
        <View testID="connection-modes" accessibilityRole="tablist" style={styles.modes}>{MODES.map(item => {
          const selected = mode === item.value;
          return <Pressable key={item.value} testID={`connection-mode-${item.value}`} accessibilityRole="tab"
            accessibilityLabel={item.accessibilityLabel} accessibilityState={{selected, disabled: busy}} disabled={busy}
            onPress={() => {setMode(item.value); setError('');}}
            style={({pressed}) => [styles.mode, selected && styles.modeSelected, pressed && styles.modePressed]}>
            <View style={styles.modeContent}>
              <Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={[styles.modeLabel, selected && styles.modeLabelSelected]}>{item.label}</Text>
              {'badge' in item && <View style={styles.modeBadge}><Text numberOfLines={1} maxFontSizeMultiplier={1.3} style={styles.modeBadgeLabel}>{item.badge}</Text></View>}
            </View>
          </Pressable>;
        })}</View>
        {mode === 'usb' && <Steps testID="usb-steps" items={USB_STEPS}/>}
        {mode === 'demo' && <Text style={styles.detail}>演示画面，不连接相机。</Text>}
        {mode === 'wifi' && <>
          <Steps testID="wifi-steps" items={WIFI_STEPS}/>
          <View style={styles.switchBlock}>
            <View style={styles.row}><Text style={styles.rowLabel}>我已在系统设置里连上相机 Wi-Fi</Text><Switch accessibilityLabel="我已在系统设置里连上相机 Wi-Fi" value={form.manual} disabled={form.debug} onValueChange={value => set('manual', value)}/></View>
            <Text style={styles.detail}>打开后直接使用当前网络，不会再弹出连接相机热点的请求。</Text>
          </View>
          {!form.manual && !form.debug && <><TextInput mode="outlined" label="相机 Wi-Fi 名称" accessibilityLabel="相机 Wi-Fi 名称" autoCapitalize="none" autoCorrect={false} value={form.ssid} onChangeText={value => set('ssid', value)}/><TextInput mode="outlined" label="Wi-Fi 密码（开放网络可留空）" accessibilityLabel="相机 Wi-Fi 密码" secureTextEntry value={form.password} onChangeText={value => set('password', value)}/></>}
          {/* Android decimal-pad is one decimal number, so a second '.' in an IPv4 address never arrives. */}
          {!form.debug && <TextInput mode="outlined" label="相机 IP" accessibilityLabel="相机 IP" autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation" value={form.cameraIp} onChangeText={value => set('cameraIp', value)}/>}
          {debugAllowed && <><View style={styles.row}><Text style={styles.rowLabel}>模拟相机调试（仅 debug）</Text><Switch accessibilityLabel="模拟相机调试" value={form.debug} onValueChange={value => set('debug', value)}/></View>{form.debug && <><TextInput mode="outlined" label="调试主机:端口" accessibilityLabel="调试主机:端口" autoCapitalize="none" autoCorrect={false} value={form.debugEndpoint} onChangeText={value => set('debugEndpoint', value)}/><TextInput mode="outlined" label="UDP 接收端口" accessibilityLabel="UDP 接收端口" keyboardType="number-pad" value={form.udpPort} onChangeText={value => set('udpPort', value)}/><Text style={styles.detail}>使用本项目 mock。模拟器须单独配置 UDP 端口转发。</Text></>}</>}
        </>}
        {!!(error || status) && <Text accessibilityLiveRegion="polite" testID="connection-status" style={[styles.detail, error && styles.error]}>{error || userFacingError(status)}</Text>}

        <Button mode="contained" contentStyle={styles.touch} accessibilityLabel={submitLabel} loading={pending} disabled={busy} onPress={() => {void submit();}}>{mode === 'usb' ? '连接 USB' : mode === 'wifi' ? '连接 Wi-Fi' : '体验演示'}</Button>
        {state.active && <Button contentStyle={styles.touch} disabled={busy} onPress={onDisconnect}>{state.demo ? '结束演示' : '断开相机'}</Button>}
  </CameraSheet>;
}
const styles = StyleSheet.create({
  modes: {flexDirection: 'row', flexWrap: 'nowrap', borderWidth: 1, borderColor: ui.color.outline, borderRadius: ui.radius.control, overflow: 'hidden'},
  mode: {flex: 1, minWidth: 0, minHeight: ui.icon.touch, alignItems: 'center', justifyContent: 'center', paddingHorizontal: ui.space.xs, paddingVertical: ui.space.sm},
  modeSelected: {backgroundColor: ui.color.selected}, modePressed: {backgroundColor: ui.color.pressed},
  modeContent: {maxWidth: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: ui.space.xs},
  modeLabel: {...ui.type.body, flexShrink: 0, color: ui.color.muted, textAlign: 'center'}, modeLabelSelected: {color: ui.color.accent},
  modeBadge: {flexShrink: 0, borderWidth: 1, borderColor: ui.color.outline, borderRadius: ui.radius.small, paddingHorizontal: ui.space.xs, paddingVertical: 1},
  modeBadgeLabel: {...ui.type.label, color: ui.color.muted},
  steps: {gap: ui.space.sm}, step: {flexDirection: 'row', alignItems: 'flex-start', gap: ui.space.sm},
  stepIndex: {width: 24, ...ui.type.body, color: ui.color.accent, fontVariant: ['tabular-nums']},
  stepText: {...ui.type.body, flex: 1, color: ui.color.text},
  switchBlock: {gap: ui.space.xs}, touch: {minHeight: ui.icon.touch},
  row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: ui.space.sm, minHeight: ui.icon.touch},
  rowLabel: {...ui.type.body, flex: 1, color: ui.color.text}, connection: {...ui.type.body, color: ui.color.text},
  detail: {...ui.type.body, color: ui.color.muted}, error: {color: ui.color.destructive},
});
