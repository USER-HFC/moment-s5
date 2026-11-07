import {expect, it} from '@jest/globals';
import {captureView, formatBytes, normalizeCapture, normalizePreferences} from '../src/preferences';

it('keeps only known capture settings and treats a closed timer as the 10 second default', () => {
  expect(normalizeCapture(null)).toEqual({motion: false, grid: true, guide: 'off', timerSeconds: 0});
  expect(normalizeCapture({motion: true, grid: false, guide: '4:5', timerSeconds: 2})).toEqual({motion: true, grid: false, guide: '4:5', timerSeconds: 2});
  expect(normalizeCapture({guide: '3:2' as 'off', timerSeconds: 7, grid: false})).toEqual({motion: false, grid: false, guide: 'off', timerSeconds: 0});
  expect(captureView({motion: true, grid: false, guide: '1:1', timerSeconds: 5})).toEqual({motionEnabled: true, grid: false, guide: '1:1', timerEnabled: true, delay: 5});
  expect(captureView({motion: false, grid: true, guide: 'off', timerSeconds: 0}).delay).toBe(10);
  expect(normalizePreferences({syncBodyPhotos: false, autoExport: true}).syncBodyPhotos).toBe(false);
  expect(normalizePreferences(undefined).syncBodyPhotos).toBe(true);
  expect(normalizePreferences(undefined).autoExport).toBe(false);
});

it('formats storage sizes for the settings page', () => {
  expect(formatBytes(0)).toBe('0 B');
  expect(formatBytes(512)).toBe('512 B');
  expect(formatBytes(1536)).toBe('1.5 KB');
  expect(formatBytes(10 * 1024)).toBe('10 KB');
  expect(formatBytes(2.5 * 1024 * 1024)).toBe('2.5 MB');
  expect(formatBytes(Number.NaN)).toBe('未知');
});
