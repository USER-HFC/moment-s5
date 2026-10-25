import {expect, it} from '@jest/globals';
import {fileLabel, formatBytes, formatCaptureTitle, formatDayHeading, formatDimensions, formatMomentDate, formatMomentDateTime, groupMomentsByDay, momentOrigin, momentSummary, momentTransport, shareKinds, shortPath} from '../src/albumFormat';

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

it('formats viewer titles as today, yesterday or a calendar date', () => {
  const now = new Date(2026, 9, 25, 18, 0).getTime();
  const at = (year: number, month: number, day: number, hour: number, minute: number) => new Date(year, month, day, hour, minute).getTime();
  expect(formatCaptureTitle(at(2026, 9, 25, 16, 22), now)).toBe('今天 16:22');
  expect(formatCaptureTitle(at(2026, 9, 24, 16, 22), now)).toBe('昨天 16:22');
  expect(formatCaptureTitle(at(2026, 8, 20, 16, 22), now)).toBe('9月20日 16:22');
  expect(formatCaptureTitle(at(2025, 9, 25, 16, 22), now)).toBe('2025年10月25日 16:22');
  expect(formatDayHeading(at(2026, 9, 25, 16, 22), now)).toBe('今天');
  expect(formatDayHeading(at(2026, 9, 24, 16, 22), now)).toBe('昨天');
  expect(formatDayHeading(at(2026, 8, 20, 16, 22), now)).toBe('9月20日');
  expect(formatDayHeading(at(2025, 9, 25, 16, 22), now)).toBe('2025年10月25日');
});

it('builds a deduplicated viewer summary', () => {
  expect(momentSummary({demo: true, transport: 'demo'})).toBe('演示');
  expect(momentSummary({transport: 'usb'})).toBe('App 快门 · USB');
  expect(momentSummary({cameraTriggered: true, transport: 'usb', lut: 'Velvia'})).toBe('机身快门同步 · USB · Velvia');
  expect(momentSummary({transport: 'usb', lut: 'Velvia'})).toBe('App 快门 · USB · Velvia');
  expect(momentSummary({demo: true, transport: 'demo', lut: 'Fuji 风格 · Velvia'})).toBe('演示 · Velvia');
});

it('groups photos by day and keeps a readable storage tail', () => {
  const now = new Date(2026, 9, 25, 18, 0).getTime();
  const today = new Date(2026, 9, 25, 10, 0).getTime();
  const yesterday = new Date(2026, 9, 24, 10, 0).getTime();
  const older = new Date(2026, 8, 2, 10, 0).getTime();
  const groups = groupMomentsByDay([
    {id: 'A', source: 'a.jpg', createdAt: today, complete: true},
    {id: 'B', source: 'b.jpg', createdAt: yesterday, complete: true},
    {id: 'C', source: 'c.jpg', createdAt: older, complete: true},
    {id: 'D', source: 'd.jpg', createdAt: today - 1000, complete: true},
  ], now);
  expect(groups.map((group) => group.title)).toEqual(['今天', '昨天', '9月2日']);
  expect(groups[0].moments.map((moment) => moment.id)).toEqual(['A', 'D']);
  expect(shortPath('/data/user/0/cn.moment.lumix/files/moments/M1')).toBe('…/moments/M1');
  expect(shortPath('/data/user/0/cn.moment.lumix/files/moments/M1792916568901_50cdd12a')).toBe('…/moments/…50cdd12a');
  expect(shortPath('M1')).toBe('M1');
});
