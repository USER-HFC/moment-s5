import {expect, it} from '@jest/globals';
import {captureView, clearableSummary, formatBytes, normalizeCapture, normalizePreferences} from '../src/preferences';

it('keeps only known capture settings and treats a closed timer as the 10 second default', () => {
  expect(normalizeCapture(null)).toEqual({motion: false, grid: true, guide: 'off', timerSeconds: 0});
  expect(normalizeCapture({motion: true, grid: false, guide: '4:5', timerSeconds: 2})).toEqual({motion: true, grid: false, guide: '4:5', timerSeconds: 2});
  expect(normalizeCapture({guide: '3:2', timerSeconds: 10, grid: true})).toEqual({motion: false, grid: true, guide: '3:2', timerSeconds: 10});
  expect(normalizeCapture({guide: '16:9', timerSeconds: 0}).guide).toBe('16:9');
  expect(normalizeCapture({guide: '1:1', timerSeconds: 30}).guide).toBe('1:1');
  expect(normalizeCapture({guide: '9:16' as 'off', timerSeconds: 7, grid: false})).toEqual({motion: false, grid: false, guide: 'off', timerSeconds: 0});
  expect(captureView({motion: true, grid: false, guide: '1:1', timerSeconds: 5})).toEqual({motionEnabled: true, grid: false, guide: '1:1', timerEnabled: true, delay: 5});
  expect(captureView({motion: false, grid: true, guide: '3:2', timerSeconds: 0}).guide).toBe('3:2');
  expect(captureView({motion: false, grid: true, guide: 'off', timerSeconds: 0}).delay).toBe(10);
  expect(normalizePreferences({syncBodyPhotos: false, autoExport: true}).syncBodyPhotos).toBe(false);
  expect(normalizePreferences(undefined).syncBodyPhotos).toBe(true);
  expect(normalizePreferences(undefined).autoExport).toBe(false);
  expect(normalizePreferences(undefined).volumeShutter).toBe(true);
  expect(normalizePreferences(undefined).shutterVibration).toBe(true);
  expect(normalizePreferences(undefined).reverseFocus).toBe(false);
  expect(normalizePreferences({volumeShutter: false, reverseFocus: true, shutterVibration: false})).toMatchObject({volumeShutter: false, reverseFocus: true, shutterVibration: false});
});

it('formats storage sizes for the settings page', () => {
  expect(formatBytes(0)).toBe('0 B');
  expect(formatBytes(512)).toBe('512 B');
  expect(formatBytes(1536)).toBe('1.5 KB');
  expect(formatBytes(10 * 1024)).toBe('10 KB');
  expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB');
  expect(formatBytes(Number.NaN)).toBe('未知');
  expect(clearableSummary(0, 0)).toBe('没有可清理的照片');
  expect(clearableSummary(2, 2.5 * 1024 * 1024)).toBe('可清理 2 张，约 2.5 MB');
});
