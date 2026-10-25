import {expect, it} from '@jest/globals';
import {fileLabel, formatBytes, formatDimensions, formatMomentDate, formatMomentDateTime, momentOrigin, momentTransport, shareKinds} from '../src/albumFormat';

it('formats capture time, size and pixel dimensions', () => {
  const stamp = new Date(2024, 0, 2, 3, 4, 5).getTime();
  expect(formatMomentDate(stamp)).toBe('2024年1月2日 03:04');
  expect(formatMomentDateTime(stamp)).toBe('2024年1月2日 03:04:05');
  expect(formatBytes(512)).toBe('512 B');
  expect(formatBytes(1536)).toBe('1.5 KB');
  expect(formatBytes(1024 * 1024)).toBe('1.0 MB');
  expect(formatBytes(Number.NaN)).toBe('—');
  expect(formatDimensions(6000, 4000)).toBe('6000 × 4000');
  expect(formatDimensions(0, 4000)).toBe('—');
});

it('names the shutter origin, transport and shareable files', () => {
  expect(momentOrigin({demo: true, cameraTriggered: true})).toBe('演示');
  expect(momentOrigin({cameraTriggered: true})).toBe('机身快门同步');
  expect(momentOrigin({})).toBe('App 快门');
  expect(momentTransport('usb')).toBe('USB');
  expect(momentTransport('wifi')).toBe('Wi-Fi（实验）');
  expect(momentTransport('demo')).toBe('演示');
  expect(momentTransport('', true)).toBe('演示');
  expect(momentTransport('')).toBe('未知');
  expect(fileLabel('original.jpg')).toBe('原片');
  expect(fileLabel('rendered.jpg')).toBe('LUT 成片');
  expect(fileLabel('motion.mp4')).toBe('动态视频');
  expect(fileLabel('MOMENT_MP.jpg')).toBe('实况文件');
  expect(shareKinds({videoUri: 'file://v', complete: true})).toEqual(['display', 'original', 'video', 'motion']);
  expect(shareKinds({captureMode: 'photo', complete: true})).toEqual(['display', 'original']);
  expect(shareKinds({videoUri: 'file://v', complete: false})).toEqual(['display', 'original', 'video']);
});
