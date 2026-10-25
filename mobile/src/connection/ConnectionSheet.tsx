import React, {useEffect, useRef, useState} from 'react';
import {PermissionsAndroid, Platform, StyleSheet, View} from 'react-native';
import {Button, Switch, Text, TextInput} from 'react-native-paper';
import CameraSheet from '../CameraSheet';
import CameraIcon from '../CameraIcon';
import {ui} from '../theme';
import {CameraState} from '../native';
import {connectionOptions, ConnectionForm, initialConnectionForm, WifiConnectionOptions} from './model';

type Props = {visible: boolean; state: CameraState; status: string; debugAllowed: boolean; onClose: () => void; onUsb: () => Promise<void>; onWifi: (options: WifiConnectionOptions) => Promise<void>; onDemo: () => Promise<void>; onDisconnect: () => void};
const MODES = [
  {value: 'usb', label: 'USB', icon: 'usb', accessibilityLabel: 'USB 连接方式'},
  {value: 'wifi', label: 'Wi-Fi（实验）', icon: 'wifi', accessibilityLabel: 'Wi-Fi 实验连接方式'},
  {value: 'demo', label: '演示', icon: 'demo', accessibilityLabel: '合成演示方式'},
] as const;
export async function requestWifiPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const permission = PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES;
  if (await PermissionsAndroid.check(permission)) return true;
  return (await PermissionsAndroid.request(permission)) === PermissionsAndroid.RESULTS.GRANTED;
}

export default function ConnectionSheet({visible, state, status, debugAllowed, onClose, onUsb, onWifi, onDemo, onDisconnect}: Props) {
  const [mode, setMode] = useState<'usb' | 'wifi' | 'demo'>('usb');
  const [form, setForm] = useState<ConnectionForm>(initialConnectionForm);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (visible && state.active) setMode(state.demo ? 'demo' : state.transport === 'wifi' ? 'wifi' : 'usb');
  }, [visible, state.active, state.demo, state.transport]);
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
    } catch (e) { setError(String((e as Error)?.message || e)); }
    finally { pendingRef.current = false; setPending(false); }
  };
  const currentConnection = !state.active ? '未连接' : state.demo ? '合成演示中' : state.transport === 'wifi' ? 'Wi-Fi（实验）已连接' : 'USB 已连接';
  const submitLabel = mode === 'usb' ? '连接 USB 相机' : mode === 'wifi' ? '连接 Wi-Fi 实验相机' : '启动合成演示';
  return <CameraSheet visible={visible} title="连接相机" onClose={onClose}>
        <Text style={styles.connection} accessibilityLiveRegion="polite">{currentConnection}{state.busy ? ' · 处理中' : ''}</Text>
        <View style={styles.tabs}>{MODES.map(item => <Button key={item.value} style={styles.tab} contentStyle={styles.touch}
          mode={mode === item.value ? 'contained-tonal' : 'outlined'} textColor={mode === item.value ? ui.color.accent : ui.color.text}
          icon={() => <CameraIcon name={item.icon} active={mode === item.value}/>}
          disabled={pending || state.busy} accessibilityLabel={item.accessibilityLabel} accessibilityState={{selected: mode === item.value}}
          onPress={() => {setMode(item.value); setError('');}}>{item.label}</Button>)}</View>
        {mode === 'usb' && <Text style={styles.detail}>推荐方式。使用数据线与 OTG，机身选择 PC(Tether)。</Text>}
        {mode === 'demo' && <Text style={styles.detail}>合成演示素材；不连接相机。</Text>}
        {mode === 'wifi' && <>
          <Text style={styles.experimental}>实验性 · 未经真机验证</Text>
          <Text style={styles.detail}>支持使用 LUMIX Sync / Image App 遥控协议的 LUMIX 相机，各机型尚未逐一实机确认。请关闭其他遥控 App，在相机开启 Wi-Fi 遥控拍摄；推荐继续使用 USB。</Text>
          <View style={styles.row}><Text style={styles.rowLabel}>已手动连接相机 Wi-Fi</Text><Switch accessibilityLabel="已手动连接相机 Wi-Fi" value={form.manual} disabled={form.debug} onValueChange={value => set('manual', value)}/></View>
          {!form.manual && !form.debug && <><TextInput mode="outlined" label="相机 Wi-Fi SSID" accessibilityLabel="相机 Wi-Fi SSID" autoCapitalize="none" autoCorrect={false} value={form.ssid} onChangeText={value => set('ssid', value)}/><TextInput mode="outlined" label="Wi-Fi 密码（开放网络可留空）" accessibilityLabel="相机 Wi-Fi 密码" secureTextEntry value={form.password} onChangeText={value => set('password', value)}/></>}
          {!form.debug && <TextInput mode="outlined" label="相机 IP" accessibilityLabel="相机 IP" autoCapitalize="none" autoCorrect={false} keyboardType="decimal-pad" value={form.cameraIp} onChangeText={value => set('cameraIp', value)}/>}
          {debugAllowed && <><View style={styles.row}><Text style={styles.rowLabel}>模拟相机调试（仅 debug）</Text><Switch accessibilityLabel="模拟相机调试" value={form.debug} onValueChange={value => set('debug', value)}/></View>{form.debug && <><TextInput mode="outlined" label="调试主机:端口" accessibilityLabel="调试主机:端口" autoCapitalize="none" autoCorrect={false} value={form.debugEndpoint} onChangeText={value => set('debugEndpoint', value)}/><TextInput mode="outlined" label="UDP 接收端口" accessibilityLabel="UDP 接收端口" keyboardType="number-pad" value={form.udpPort} onChangeText={value => set('udpPort', value)}/><Text style={styles.detail}>使用本项目 mock。模拟器须单独配置 UDP 端口转发。</Text></>}</>}
        </>}
        {!!(error || status) && <Text accessibilityLiveRegion="polite" testID="connection-status" style={[styles.detail, error && styles.error]}>{error || status}</Text>}

        <Button mode="contained" contentStyle={styles.touch} accessibilityLabel={submitLabel} loading={pending} disabled={pending || state.busy} onPress={() => {void submit();}}>{mode === 'usb' ? '连接 USB' : mode === 'wifi' ? '连接 Wi-Fi（实验）' : '体验演示'}</Button>
        {state.active && <Button contentStyle={styles.touch} disabled={pending || state.busy} onPress={onDisconnect}>{state.demo ? '结束演示' : '断开相机'}</Button>}
  </CameraSheet>;
}
const styles = StyleSheet.create({
  tabs: {flexDirection: 'row', flexWrap: 'wrap', gap: ui.space.sm}, tab: {flexGrow: 1}, touch: {minHeight: ui.icon.touch},
  row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: ui.space.sm},
  rowLabel: {...ui.type.body, flex: 1, color: ui.color.text}, connection: {...ui.type.body, color: ui.color.text},
  detail: {...ui.type.body, color: ui.color.muted}, experimental: {...ui.type.caption, color: ui.color.text, padding: ui.space.sm, borderRadius: ui.radius.small, backgroundColor: ui.color.surface},
  error: {color: ui.color.destructive},
});
