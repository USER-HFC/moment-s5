import {Platform} from 'react-native';

/**
 * Wording that differs between Android and iOS. OTG, the back key and the volume-key shutter are
 * Android things; an iPhone user must not be told to look for them.
 */
export type OS = 'ios' | 'android';
export const currentOS = (): OS => (Platform.OS === 'ios' ? 'ios' : 'android');

/** The empty capture screen's three steps. */
export function connectSteps(os: OS = currentOS()) {
  return os === 'ios'
    ? ['相机 USB 模式选 PC(Tether)', '用支持数据的 USB-C 线连接', 'iPhone 提示时允许连接配件']
    : ['相机 USB 模式选 PC(Tether)', '用支持数据的 USB-C 线连接', '手机打开 OTG'];
}

/** USB steps. The connection sheet uses the compact wording; the guide spells it out. */
export function usbSteps(os: OS = currentOS(), compact = false) {
  const last = os === 'ios'
    ? (compact ? 'iPhone 需要 USB-C 接口' : 'iPhone 需要 USB-C 接口（iPhone 15 及更新）')
    : (compact ? 'OPPO/ColorOS 在设置里开启 OTG' : 'OPPO / ColorOS 手机在系统设置里开启 OTG');
  return ['相机：设置 → USB → PC(Tether)', '用支持数据的 USB-C 线', last];
}

/** iOS has no system back key and no volume-key shutter yet. */
export const hasBackKey = (os: OS = currentOS()) => os === 'android';
export const hasVolumeShutter = (os: OS = currentOS()) => os === 'android';

export function cannotConnectHelp(os: OS = currentOS()) {
  return os === 'ios'
    ? '先看相机是不是 PC(Tether)、线能不能传数据。换一条线后再试。还是不行，打开连接诊断看记录。'
    : '先看相机是不是 PC(Tether)、线能不能传数据、手机有没有打开 OTG。换一条线或另一个接口后再试。还是不行，打开连接诊断看记录。';
}

/** About and the copied build block: the oldest system this build installs on. */
export function minSystemTitle(os: OS = currentOS()) { return os === 'ios' ? '最低 iOS 版本' : '最低 Android 版本'; }
export function minSystemLabel(value: string, os: OS = currentOS()) {
  if (value === '未知') return value;
  if (os === 'ios') return `iOS ${value}`;
  return value === '33' ? 'Android 13（API 33）' : `API ${value}`;
}
