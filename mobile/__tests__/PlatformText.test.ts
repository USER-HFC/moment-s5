import {expect, it} from '@jest/globals';
import {cannotConnectHelp, clearExportedFootnote, connectSteps, exportedNotice, hasBackKey, hasScopes, shootingControls, hasVolumeShutter, minSystemLabel, minSystemTitle, usbSteps} from '../src/platformText';

it('never tells an iPhone user about OTG, the back key or the volume-key shutter', () => {
  const ios = [...connectSteps('ios'), ...usbSteps('ios'), ...usbSteps('ios', true), cannotConnectHelp('ios')].join('\n');
  expect(ios).not.toMatch(/OTG|OPPO|ColorOS|返回键/);
  expect(hasBackKey('ios')).toBe(false);
  expect(hasVolumeShutter('ios')).toBe(false);
  expect(usbSteps('ios')).toContain('iPhone 需要 USB-C 接口（iPhone 15 及更新）');
});

it('keeps the Android wording as it was', () => {
  expect(connectSteps('android')).toEqual(['相机 USB 模式选 PC(Tether)', '用支持数据的 USB-C 线连接', '手机打开 OTG']);
  expect(usbSteps('android')[2]).toBe('OPPO / ColorOS 手机在系统设置里开启 OTG');
  expect(usbSteps('android', true)[2]).toBe('OPPO/ColorOS 在设置里开启 OTG');
  expect(hasBackKey('android')).toBe(true);
  expect(hasVolumeShutter('android')).toBe(true);
  expect(cannotConnectHelp('android')).toContain('手机有没有打开 OTG');
});

it('names the minimum system by platform', () => {
  expect(minSystemTitle('ios')).toBe('最低 iOS 版本');
  expect(minSystemLabel('15.1', 'ios')).toBe('iOS 15.1');
  expect(minSystemTitle('android')).toBe('最低 Android 版本');
  expect(minSystemLabel('33', 'android')).toBe('Android 13（API 33）');
  expect(minSystemLabel('未知', 'ios')).toBe('未知');
});

it('says where an export went', () => {
  expect(exportedNotice('ios')).toBe('已存入「照片」');
  expect(exportedNotice('android')).toBe('已导出到 DCIM/MomentS5');
});

it('explains on iOS why an unverified export is not cleared', () => {
  expect(clearExportedFootnote('ios')).toContain('无法核对');
  expect(clearExportedFootnote('android')).toBe('只删除已经导出到系统相册的 App 内副本。未导出的照片会保留。');
});

it('leaves the scopes out of the iOS guide until iOS has them', () => {
  expect(hasScopes('ios')).toBe(false);
  expect(shootingControls('ios')).toBe('网格、参考、定时和收音');
  expect(shootingControls('android')).toBe('网格、参考、定时、收音和示波器');
});
