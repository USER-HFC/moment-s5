import {expect, it} from '@jest/globals';
import {albumFilterCounts, albumFilterEmpty, batchResultMessage, fileLabel, formatBytes, formatCaptureTitle, formatDayHeading, formatDimensions, formatMomentDate, formatMomentDateTime, groupMomentsByDay, matchesAlbumFilter, momentAccessibilityName, momentKindLabel, momentOrigin, momentSummary, momentTransport, shareDialogTitle, shareKinds, shareOptionHint, shareOptionLabel, shortPath, viewerDismissPastThreshold} from '../src/albumFormat';

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
  expect(fileLabel('MOMENT_MP.jpg')).toBe('动态照片');
  const files = {imageUri: 'file://image', originalUri: 'file://original'};
  expect(shareKinds({...files, videoUri: 'file://v', complete: true})).toEqual(['motion', 'video', 'original', 'display']);
  expect(shareKinds({...files, captureMode: 'photo', complete: true})).toEqual(['original', 'display']);
  expect(shareKinds({...files, videoUri: 'file://v', complete: false})).toEqual(['video', 'original', 'display']);
  expect(shareKinds({videoUri: 'file://v', complete: true})).toEqual(['motion', 'video']);
  expect(shareKinds({captureMode: 'photo', complete: true, imageUri: 'file://image'})).toEqual(['display']);
  expect(shareKinds({captureMode: 'photo', complete: true})).toEqual([]);
  expect(shareOptionLabel.motion).toBe('动态照片');
  expect(shareOptionLabel.display).toBe('当前画面');
  expect(shareOptionHint('display', {lut: 'Velvia'})).toBe('带 LUT 的画面');
  expect(shareOptionHint('display', {})).toBe('正在查看的画面');
  expect(shareOptionHint('original', {})).toBe('未套用 LUT');
  expect(shareDialogTitle({...files, videoUri: 'file://v', complete: true})).toBe('分享动态照片');
  expect(shareDialogTitle({...files, captureMode: 'photo', complete: true})).toBe('分享照片');
  expect(shareDialogTitle({videoUri: 'file://v', complete: false})).toBe('分享照片');
});

it('counts album filters and names an empty filter', () => {
  const moments = [
    {captureMode: 'photo' as const, cameraTriggered: true},
    {captureMode: 'photo' as const, demo: true, cameraTriggered: true},
    {captureMode: 'pre-only' as const, cameraTriggered: true},
    {},
  ];
  expect(albumFilterCounts(moments)).toEqual({all: 4, photo: 2, motion: 2, camera: 2});
  expect(moments.filter((moment) => matchesAlbumFilter(moment, 'photo')).length).toBe(2);
  expect(moments.filter((moment) => matchesAlbumFilter(moment, 'camera')).map((moment) => moment.demo)).toEqual([undefined, undefined]);
  expect(albumFilterEmpty('all').title).toBe('还没有照片');
  expect(albumFilterEmpty('photo').title).toBe('没有照片');
  expect(albumFilterEmpty('motion').title).toBe('没有动态照片');
  expect(albumFilterEmpty('camera').body).toContain('机身快门');
});

it('summarizes a batch and decides when a downward drag closes the viewer', () => {
  expect(batchResultMessage('导出', 5, 0)).toBe('已导出 5 张');
  expect(batchResultMessage('导出', 0, 2)).toBe('2 张失败');
  expect(batchResultMessage('导出', 3, 2)).toBe('已导出 3 张，2 张失败');
  expect(batchResultMessage('删除', 4, 0)).toBe('已删除 4 张');
  expect(viewerDismissPastThreshold(40, 0, 800)).toBe(false);
  expect(viewerDismissPastThreshold(160, 0, 800)).toBe(true);
  expect(viewerDismissPastThreshold(20, 900, 800)).toBe(true);
  expect(viewerDismissPastThreshold(95, 0, 400)).toBe(false);
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

it('names a thumbnail with its kind and the same day clock as the album groups', () => {
  const now = new Date(2026, 9, 25, 21, 0).getTime();
  const at = (year: number, month: number, day: number, hour: number, minute: number) => new Date(year, month, day, hour, minute).getTime();
  expect(momentKindLabel({captureMode: 'pre-only'})).toBe('动态照片');
  expect(momentKindLabel({})).toBe('动态照片');
  expect(momentKindLabel({captureMode: 'photo'})).toBe('照片');
  expect(momentKindLabel({captureMode: 'photo', cameraTriggered: true})).toBe('机身同步照片');
  expect(momentKindLabel({cameraTriggered: true})).toBe('机身同步动态照片');
  expect(momentKindLabel({demo: true, cameraTriggered: true})).toBe('演示动态照片');
  expect(momentKindLabel({captureMode: 'photo', demo: true, cameraTriggered: true})).toBe('演示照片');
  expect(momentAccessibilityName({createdAt: at(2026, 9, 25, 20, 56)}, now)).toBe('动态照片，今天 20:56');
  expect(momentAccessibilityName({captureMode: 'photo', cameraTriggered: true, createdAt: at(2026, 9, 24, 18, 2)}, now)).toBe('机身同步照片，昨天 18:02');
  expect(momentAccessibilityName({captureMode: 'photo', createdAt: at(2026, 8, 2, 8, 5)}, now)).toBe('照片，9月2日 08:05');
  expect(momentAccessibilityName({createdAt: at(2025, 9, 25, 7, 4)}, now)).toBe('动态照片，2025年10月25日 07:04');
  expect(formatDayHeading(at(2026, 9, 25, 20, 56), now)).toBe('今天');
  expect(formatDayHeading(at(2026, 9, 24, 18, 2), now)).toBe('昨天');
  expect(formatDayHeading(at(2026, 8, 2, 8, 5), now)).toBe('9月2日');
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
