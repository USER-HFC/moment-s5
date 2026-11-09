import React, {useEffect, useRef, useState} from 'react';
import {ActivityIndicator, PermissionsAndroid, Platform, Pressable, StyleSheet, TextInput, TextInputProps, View} from 'react-native';
import {usbSteps} from '../platformText';
import {Button, cn, color, Switch, Text} from '../ui';
import CameraSheet from '../CameraSheet';
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
const USB_STEPS = usbSteps(undefined, true);
const WIFI_STEPS = [
  '相机开启 Wi-Fi 遥控拍摄',
  '手机连上相机热点',
  '确认相机 IP，一般不用改',
];

/** Numbered steps in a grouped card, separators inset past the number like iOS lists. */
function Steps({items, testID}: {items: readonly string[]; testID: string}) {
  return <View testID={testID} className="overflow-hidden rounded-card bg-raised">{items.map((item, index) => <View key={item} className="flex-row items-center gap-3 pl-3.5">
    <View className="h-[22px] w-[22px] items-center justify-center rounded-full bg-[#48484A]">
      <Text className="text-caption font-bold" style={{fontVariant: ['tabular-nums']}}>{index + 1}</Text>
    </View>
    <View className={cn('min-h-[48px] flex-1 justify-center py-2 pr-3.5', index < items.length - 1 && 'border-b border-[#48484A]')}>
      <Text className="text-[15px] leading-[20px]">{item}</Text>
    </View>
  </View>)}</View>;
}

/** Labelled text field: grey well, no outline, label above in small grey type. */
function Field({label, ...props}: TextInputProps & {label: string}) {
  return <View className="gap-1.5">
    <Text className="px-1 text-footnote text-muted">{label}</Text>
    <TextInput placeholderTextColor={color.faint} selectionColor={color.ink} cursorColor={color.ink} accessibilityLabel={props.accessibilityLabel ?? label}
      className="h-12 rounded-xl bg-raised px-3.5 text-body text-ink" style={styles.input} {...props}/>
  </View>;
}

function ToggleRow({label, value, disabled, onValueChange}: {label: string; value: boolean; disabled?: boolean; onValueChange: (value: boolean) => void}) {
  return <Pressable accessibilityRole="switch" accessibilityLabel={label} accessibilityState={{checked: value, disabled: !!disabled}} disabled={disabled}
    onPress={() => onValueChange(!value)} className={cn('min-h-[52px] flex-row items-center gap-3 rounded-card bg-raised px-3.5 py-2 active:opacity-80', disabled && 'opacity-45')}>
    <Text className="flex-1 text-[15px] leading-[20px]">{label}</Text>
    <Switch value={value}/>
  </Pressable>;
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
  return <CameraSheet visible={visible} title="连接相机" onClose={onClose} dismissAccessibilityLabel="关闭">
        <Text className="-mt-1.5 text-footnote text-muted" accessibilityLiveRegion="polite">{`${currentConnection}${state.busy ? ' · 处理中' : ''}`}</Text>
        <View testID="connection-modes" accessibilityRole="tablist" className="h-9 flex-row gap-0.5 rounded-[10px] bg-raised p-0.5">{MODES.map(item => {
          const selected = mode === item.value;
          return <Pressable key={item.value} testID={`connection-mode-${item.value}`} accessibilityRole="tab"
            accessibilityLabel={item.accessibilityLabel} accessibilityState={{selected, disabled: busy}} disabled={busy}
            onPress={() => {setMode(item.value); setError('');}}
            className={cn('flex-1 flex-row items-center justify-center gap-1.5 rounded-lg active:opacity-70', selected && 'bg-faint')}>
            <Text numberOfLines={1} className={cn('text-[14px] leading-[18px]', selected ? 'font-semibold' : 'font-medium text-[#D1D1D6]')}>{item.label}</Text>
            {'badge' in item && <Text numberOfLines={1} className="text-[10px] leading-[13px] font-semibold text-muted">{item.badge}</Text>}
          </Pressable>;
        })}</View>
        {mode === 'usb' && <Steps testID="usb-steps" items={USB_STEPS}/>}
        {mode === 'demo' && <Text className="text-[15px] leading-[20px] text-muted">演示画面，不连接相机。可以先熟悉拍摄、相册和 LUT。</Text>}
        {mode === 'wifi' && <>
          <Steps testID="wifi-steps" items={WIFI_STEPS}/>
          <View className="gap-1.5">
            <ToggleRow label="我已在系统设置里连上相机 Wi-Fi" value={form.manual} disabled={form.debug} onValueChange={value => set('manual', value)}/>
            <Text className="px-1 text-footnote text-muted">打开后直接使用当前网络，不会再弹出连接相机热点的请求。</Text>
          </View>
          {!form.manual && !form.debug && <>
            <Field label="相机 Wi-Fi 名称" autoCapitalize="none" autoCorrect={false} value={form.ssid} onChangeText={value => set('ssid', value)}/>
            <Field label="Wi-Fi 密码（开放网络可留空）" accessibilityLabel="相机 Wi-Fi 密码" secureTextEntry value={form.password} onChangeText={value => set('password', value)}/>
          </>}
          {/* Android decimal-pad is one decimal number, so a second '.' in an IPv4 address never arrives. */}
          {!form.debug && <Field label="相机 IP" autoCapitalize="none" autoCorrect={false} keyboardType="numbers-and-punctuation" value={form.cameraIp} onChangeText={value => set('cameraIp', value)}/>}
          {debugAllowed && <>
            <ToggleRow label="模拟相机调试（仅 debug）" value={form.debug} onValueChange={value => set('debug', value)}/>
            {form.debug && <>
              <Field label="调试主机:端口" autoCapitalize="none" autoCorrect={false} value={form.debugEndpoint} onChangeText={value => set('debugEndpoint', value)}/>
              <Field label="UDP 接收端口" keyboardType="number-pad" value={form.udpPort} onChangeText={value => set('udpPort', value)}/>
              <Text className="px-1 text-footnote text-muted">使用本项目 mock。模拟器须单独配置 UDP 端口转发。</Text>
            </>}
          </>}
        </>}
        {!!(error || status) && <Text accessibilityLiveRegion="polite" testID="connection-status" className={cn('text-footnote', error ? 'text-danger' : 'text-muted')}>{error || userFacingError(status)}</Text>}

        <Button variant="primary" size="lg" accessibilityLabel={submitLabel} disabled={busy} onPress={() => {void submit();}}>
          {pending && <ActivityIndicator color="#000000"/>}
          <Text>{mode === 'usb' ? '连接 USB' : mode === 'wifi' ? '连接 Wi-Fi' : '体验演示'}</Text>
        </Button>
        {state.active && <Button variant="tinted" tone="danger" accessibilityLabel={state.demo ? '结束演示' : '断开相机'} disabled={busy} onPress={onDisconnect}><Text>{state.demo ? '结束演示' : '断开相机'}</Text></Button>}
  </CameraSheet>;
}
const styles = StyleSheet.create({
  // Android adds vertical padding to TextInput; zero it so the 48 dp well centres the text.
  input: {paddingVertical: 0},
});
