import React, {useRef, useState} from 'react';
import {Modal, PermissionsAndroid, Platform, ScrollView, StyleSheet, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import {Button, Surface, Switch, Text, TextInput} from 'react-native-paper';
import {CameraState} from '../native';
import {connectionOptions, ConnectionForm, initialConnectionForm, WifiConnectionOptions} from './model';

type Props = {visible: boolean; state: CameraState; status: string; debugAllowed: boolean; onClose: () => void; onUsb: () => Promise<void>; onWifi: (options: WifiConnectionOptions) => Promise<void>; onDisconnect: () => void};
export async function requestWifiPermission(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  const permission = PermissionsAndroid.PERMISSIONS.NEARBY_WIFI_DEVICES;
  if (await PermissionsAndroid.check(permission)) return true;
  return (await PermissionsAndroid.request(permission)) === PermissionsAndroid.RESULTS.GRANTED;
}

export default function ConnectionSheet({visible, state, status, debugAllowed, onClose, onUsb, onWifi, onDisconnect}: Props) {
  const [mode, setMode] = useState<'usb' | 'wifi'>('usb');
  const [form, setForm] = useState<ConnectionForm>(initialConnectionForm);
  const [pending, setPending] = useState(false);
  const pendingRef = useRef(false);
  const [error, setError] = useState('');
  const set = <K extends keyof ConnectionForm>(key: K, value: ConnectionForm[K]) => setForm(current => ({...current, [key]: value}));
  const submit = async () => {
    if (pendingRef.current || state.busy) return;
    pendingRef.current = true;
    setPending(true); setError('');
    try {
      if (mode === 'usb') await onUsb();
      else {
        const options = connectionOptions(form, debugAllowed);
        if (!options.manual && !(await requestWifiPermission())) throw new Error('附近 Wi-Fi 设备权限未授权；可在系统设置手动连接相机 Wi-Fi');
        await onWifi(options);
      }
    } catch (e) { setError(String((e as Error)?.message || e)); }
    finally { pendingRef.current = false; setPending(false); }
  };
  return <Modal visible={visible} transparent animationType="none" supportedOrientations={['portrait', 'landscape']} onRequestClose={onClose}>
    <SafeAreaView style={styles.scrim}><Surface elevation={0} style={styles.sheet} accessibilityViewIsModal>
      <View style={styles.header}><Text variant="titleMedium">连接相机</Text><Button onPress={onClose}>返回取景</Button></View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
        <View style={styles.tabs}>{(['usb', 'wifi'] as const).map(value => <Button key={value} mode={mode === value ? 'contained' : 'outlined'} accessibilityLabel={value === 'usb' ? 'USB 连接方式' : 'Wi-Fi 实验连接方式'} accessibilityState={{selected: mode === value}} onPress={() => {setMode(value); setError('');}}>{value === 'usb' ? 'USB' : 'Wi-Fi（实验）'}</Button>)}</View>
        {mode === 'usb' ? <Text style={styles.detail}>推荐方式。使用数据线与 OTG，机身选择 PC(Tether)。</Text> : <>
          <Text style={styles.experimental}>实验性 · 未经真机验证</Text>
          <Text style={styles.detail}>初代 S5 固件 2.9 的无线协议尚未实机确认。请关闭其他遥控 App，在相机开启 Wi-Fi；推荐继续使用 USB。</Text>
          <View style={styles.row}><Text style={styles.rowLabel}>已手动连接相机 Wi-Fi</Text><Switch accessibilityLabel="已手动连接相机 Wi-Fi" value={form.manual} disabled={form.debug} onValueChange={value => set('manual', value)}/></View>
          {!form.manual && !form.debug && <><TextInput mode="outlined" label="相机 Wi-Fi SSID" accessibilityLabel="相机 Wi-Fi SSID" autoCapitalize="none" autoCorrect={false} value={form.ssid} onChangeText={value => set('ssid', value)}/><TextInput mode="outlined" label="Wi-Fi 密码（开放网络可留空）" accessibilityLabel="相机 Wi-Fi 密码" secureTextEntry value={form.password} onChangeText={value => set('password', value)}/></>}
          {!form.debug && <TextInput mode="outlined" label="相机 IP" accessibilityLabel="相机 IP" autoCapitalize="none" autoCorrect={false} keyboardType="decimal-pad" value={form.cameraIp} onChangeText={value => set('cameraIp', value)}/>}
          {debugAllowed && <><View style={styles.row}><Text style={styles.rowLabel}>模拟相机调试（仅 debug）</Text><Switch accessibilityLabel="模拟相机调试" value={form.debug} onValueChange={value => set('debug', value)}/></View>{form.debug && <><TextInput mode="outlined" label="调试主机:端口" accessibilityLabel="调试主机:端口" autoCapitalize="none" autoCorrect={false} value={form.debugEndpoint} onChangeText={value => set('debugEndpoint', value)}/><TextInput mode="outlined" label="UDP 接收端口" accessibilityLabel="UDP 接收端口" keyboardType="number-pad" value={form.udpPort} onChangeText={value => set('udpPort', value)}/><Text style={styles.detail}>使用本项目 mock。模拟器须单独配置 UDP 端口转发。</Text></>}</>}
        </>}
        {!!(error || status) && <Text accessibilityLiveRegion="polite" testID="connection-status" style={[styles.detail, error && styles.error]}>{error || status}</Text>}
        {state.active && mode === 'wifi' && <Text style={styles.detail}>{state.ready ? '取景预缓存已就绪 · 可拍动态照片' : '等待连续 3 秒取景，最长帧间隔须不超过 500 ms'}</Text>}
        <Button mode="contained" accessibilityLabel={mode === 'usb' ? '连接 USB 相机' : '连接 Wi-Fi 实验相机'} loading={pending} disabled={pending || state.busy} onPress={() => {void submit();}}>{mode === 'usb' ? '连接 USB' : '连接 Wi-Fi（实验）'}</Button>
        {state.active && <Button disabled={state.busy} onPress={onDisconnect}>断开相机</Button>}
      </ScrollView>
    </Surface></SafeAreaView>
  </Modal>;
}
const styles = StyleSheet.create({scrim: {flex: 1, backgroundColor: '#000000a8', alignItems: 'center', justifyContent: 'center', padding: 16}, sheet: {width: '100%', maxWidth: 560, maxHeight: '100%', borderRadius: 14, backgroundColor: '#171b19', overflow: 'hidden'}, header: {flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingTop: 8}, content: {padding: 16, gap: 12}, tabs: {flexDirection: 'row', gap: 12}, row: {flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10}, rowLabel: {flex: 1, fontSize: 13}, detail: {fontSize: 12, lineHeight: 19, color: '#bcc5bf'}, experimental: {color: '#d4eab0', fontSize: 13}, error: {color: '#ffb4ab'}});
