import {cameraIpv4} from './model';
import {ConnectionMemory, ConnectionMethod, DEFAULT_CONNECTION} from '../preferences';

/** The user-triggered disconnect uses this status. Leaving the app is handled by the foreground check. */
export const USER_DISCONNECT_STATUS = '相机已断开 · 请重新连接';
export const DISCONNECT_BANNER = '相机已断开';
export const RECONNECT_ACTION = '重新连接';
export const USB_ATTACH_BANNER = '检测到相机';
export const USB_ATTACH_ACTION = '连接';

const UNEXPECTED = /USB 已拔出|USB 已断开|USB 超时或已断开|USB 写入失败或超时|USB 读取失败|相机会话已失效|相机 Wi-Fi 网络已丢失|Wi-Fi 已断开|Wi-Fi 连接已取消|Wi-Fi 保活失败|拍摄期间连接中断|相机已断开[，,]/;

export type LossKind = 'user' | 'app' | 'unexpected';
export type LossAction = 'banner' | 'quiet' | 'show';

/** User tap and leaving the app stay quiet. A drop while the app is in front is unexpected. */
export function classifySessionLoss(message: string, inForeground: boolean): LossKind | null {
  const text = message.trim();
  if (text === USER_DISCONNECT_STATUS) return 'user';
  if (!UNEXPECTED.test(text)) return null;
  return inForeground ? 'unexpected' : 'app';
}

/**
 * Banner only for an unexpected drop of a live session.
 * A later drop keeps that banner. Anything else still uses the normal notice.
 */
export function sessionLossAction(kind: LossKind | null, wasLive: boolean, bannerHeld: boolean): LossAction {
  if (kind === 'user' || kind === 'app') return 'quiet';
  if (kind === 'unexpected') {
    if (wasLive) return 'banner';
    if (bannerHeld) return 'quiet';
  }
  return 'show';
}

/** Remember a way only once that session is up. A failed attempt leaves the previous IP alone. */
export function connectionToRemember(active: boolean, demo: boolean, transport: string | undefined, attemptedWifiIp: string | null, previousIp: string): ConnectionMemory | null {
  if (!active) return null;
  const cameraIp = cameraIpv4(previousIp) ?? DEFAULT_CONNECTION.cameraIp;
  if (demo) return {method: 'demo', cameraIp};
  if (transport === 'wifi') {
    const ip = attemptedWifiIp ? cameraIpv4(attemptedWifiIp) : null;
    if (!ip) return null;
    return {method: 'wifi', cameraIp: ip};
  }
  if (transport === 'usb') return {method: 'usb', cameraIp};
  return null;
}

export function reconnectPlan(memory: ConnectionMemory): {method: ConnectionMethod; cameraIp: string} {
  if (memory.method === 'wifi' || memory.method === 'demo') return {method: memory.method, cameraIp: memory.cameraIp};
  return {method: 'usb', cameraIp: memory.cameraIp};
}
