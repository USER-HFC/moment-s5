import {expect, it} from '@jest/globals';
import {cameraBatteryLow, LOW_CAMERA_BATTERY_PERCENT, noteLowCameraBattery} from '../src/lowBattery';
import {LOW_STORAGE_REASON, shutterBlockedReason} from '../src/shutterReason';

it('treats only a real 0–15 percent camera reading as low', () => {
  expect(LOW_CAMERA_BATTERY_PERCENT).toBe(15);
  for (const percent of [0, 1, 8, 15]) expect(cameraBatteryLow(percent)).toBe(true);
  for (const percent of [16, 100, -1, 101, NaN, Infinity, null, undefined]) expect(cameraBatteryLow(percent)).toBe(false);
});

it('warns once per connection and lets a missing reading use the warning later', () => {
  let session = {connection: false, warned: false};
  let next = noteLowCameraBattery(session, true, null);
  session = next;
  expect(next.notify).toBe(false);

  next = noteLowCameraBattery(session, true, 8);
  session = next;
  expect(next.notify).toBe(true);

  next = noteLowCameraBattery(session, true, 5);
  session = next;
  expect(next.notify).toBe(false);

  next = noteLowCameraBattery(session, false, 5);
  session = next;
  expect(next).toMatchObject({connection: false, warned: false, notify: false});

  next = noteLowCameraBattery(session, true, 5);
  expect(next.notify).toBe(true);
});

it('does not warn for a healthy or unavailable reading', () => {
  expect(noteLowCameraBattery({connection: true, warned: false}, true, 45).notify).toBe(false);
  expect(noteLowCameraBattery({connection: true, warned: false}, true, null).notify).toBe(false);
});

it('names low storage before the buffer or save state, but still asks to connect first', () => {
  const base = {active: true, busy: false, motion: true, ready: true, buffered: 3};
  expect(shutterBlockedReason({...base, storageLow: true})).toBe(LOW_STORAGE_REASON);
  expect(shutterBlockedReason({...base, busy: true, storageLow: true})).toBe(LOW_STORAGE_REASON);
  expect(shutterBlockedReason({...base, active: false, storageLow: true})).toBe('请先连接相机');
  expect(shutterBlockedReason({...base, storageLow: false})).toBeNull();
});
