import {expect, it} from '@jest/globals';
import {
  DISCONNECT_BANNER,
  USB_ATTACH_BANNER,
  USER_DISCONNECT_STATUS,
  classifySessionLoss,
  connectionToRemember,
  reconnectPlan,
  sessionLossAction,
} from '../src/connection/sessionNotice';

it('separates a user disconnect, an app pause, and an unexpected drop', () => {
  expect(classifySessionLoss(USER_DISCONNECT_STATUS, true)).toBe('user');
  expect(classifySessionLoss('USB 已拔出 · 照片保留在机身或本机', true)).toBe('unexpected');
  expect(classifySessionLoss('相机 Wi-Fi 网络已丢失 · 请重新连接', true)).toBe('unexpected');
  expect(classifySessionLoss('Wi-Fi 保活失败 · 请重新连接相机', true)).toBe('unexpected');
  expect(classifySessionLoss('相机已断开，未触发快门', true)).toBe('unexpected');
  expect(classifySessionLoss('USB 已拔出 · 照片保留在机身或本机', false)).toBe('app');
  expect(classifySessionLoss('正在接收原尺寸照片', true)).toBeNull();
  expect(classifySessionLoss('', true)).toBeNull();
});

it('raises the banner only for an unexpected drop of a live session', () => {
  expect(sessionLossAction('user', true, false)).toBe('quiet');
  expect(sessionLossAction('app', true, false)).toBe('quiet');
  expect(sessionLossAction('unexpected', true, false)).toBe('banner');
  expect(sessionLossAction('unexpected', false, false)).toBe('show');
  expect(sessionLossAction('unexpected', false, true)).toBe('quiet');
  expect(sessionLossAction(null, true, false)).toBe('show');
  expect(DISCONNECT_BANNER).toBe('相机已断开');
  expect(USB_ATTACH_BANNER).toBe('检测到相机');
});

it('remembers only a session that actually came up and keeps the last Wi-Fi IP on a failed attempt', () => {
  expect(connectionToRemember(false, false, 'wifi', '10.0.0.8', '192.168.54.1')).toBeNull();
  expect(connectionToRemember(true, false, 'wifi', '10.0.0.8', '192.168.54.1')).toEqual({method: 'wifi', cameraIp: '10.0.0.8'});
  expect(connectionToRemember(true, false, 'wifi', null, '192.168.54.1')).toBeNull();
  expect(connectionToRemember(true, false, 'usb', null, '10.0.0.8')).toEqual({method: 'usb', cameraIp: '10.0.0.8'});
  expect(connectionToRemember(true, true, undefined, null, '10.0.0.8')).toEqual({method: 'demo', cameraIp: '10.0.0.8'});
  expect(connectionToRemember(true, false, undefined, null, '10.0.0.8')).toBeNull();
});

it('reconnects in the remembered way and falls back to USB', () => {
  expect(reconnectPlan({method: 'wifi', cameraIp: '10.0.0.8'})).toEqual({method: 'wifi', cameraIp: '10.0.0.8'});
  expect(reconnectPlan({method: 'demo', cameraIp: '192.168.54.1'})).toEqual({method: 'demo', cameraIp: '192.168.54.1'});
  expect(reconnectPlan({method: 'usb', cameraIp: '10.0.0.8'})).toEqual({method: 'usb', cameraIp: '10.0.0.8'});
  expect(reconnectPlan({method: null, cameraIp: '192.168.54.1'})).toEqual({method: 'usb', cameraIp: '192.168.54.1'});
});
