import {expect, it} from '@jest/globals';
import {FrameRect, GuideId, guideRect, shadeOutside} from '../src/referenceFrame';

function area(rect: FrameRect) {
  return rect.width * rect.height;
}

function overlap(a: FrameRect, b: FrameRect) {
  const width = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
  return width * height;
}

function expectCovered(frameWidth: number, frameHeight: number, guide: GuideId) {
  const rect = guideRect(frameWidth, frameHeight, guide);
  const bands = shadeOutside(frameWidth, frameHeight, rect);
  const covered = bands.reduce((sum, band) => sum + area(band), 0) + area(rect);
  expect(covered).toBeCloseTo(frameWidth * frameHeight, 4);
  for (const band of bands) expect(overlap(band, rect)).toBeCloseTo(0, 4);
  expect(rect.left).toBeGreaterThanOrEqual(-0.001);
  expect(rect.top).toBeGreaterThanOrEqual(-0.001);
  expect(rect.left + rect.width).toBeLessThanOrEqual(frameWidth + 0.001);
  expect(rect.top + rect.height).toBeLessThanOrEqual(frameHeight + 0.001);
  return {rect, bands};
}

it('keeps wide ratios wide in portrait and shades only the bands outside them', () => {
  const wide = expectCovered(360, 540, '16:9');
  expect(wide.rect.width).toBeGreaterThan(wide.rect.height);
  expect(wide.bands).toHaveLength(2);
  expect(wide.bands.every(band => band.width > band.height)).toBe(true);
  const photo = expectCovered(360, 540, '3:2');
  expect(photo.rect.width).toBeGreaterThan(photo.rect.height);
  expect(photo.rect.left).toBe(0);
  expect(photo.bands).toHaveLength(2);
  expect(photo.bands[0].top).toBe(0);
  expect(photo.bands[1].top).toBeCloseTo(photo.rect.top + photo.rect.height, 4);
  const square = expectCovered(360, 540, '1:1');
  expect(square.rect.width).toBeCloseTo(square.rect.height, 4);
  const tall = expectCovered(360, 540, '4:5');
  expect(tall.rect.height).toBeGreaterThan(tall.rect.width);
});

it('shades the short sides in landscape and leaves a 3:2 guide unshaded on the 3:2 feed', () => {
  const photo = expectCovered(540, 360, '3:2');
  expect(photo.rect.width).toBeCloseTo(540, 4);
  expect(photo.rect.height).toBeCloseTo(360, 4);
  expect(photo.bands).toHaveLength(0);
  const wide = expectCovered(540, 360, '16:9');
  expect(wide.rect.width).toBeGreaterThan(wide.rect.height);
  expect(wide.bands).toHaveLength(2);
  expect(wide.bands.every(band => band.width > band.height)).toBe(true);
  const tall = expectCovered(540, 360, '4:5');
  expect(tall.rect.height).toBeGreaterThan(tall.rect.width);
  expect(tall.bands).toHaveLength(2);
  expect(tall.bands[0].left).toBe(0);
  expect(tall.bands[1].left).toBeCloseTo(tall.rect.left + tall.rect.width, 4);
  const square = expectCovered(540, 360, '1:1');
  expect(square.rect.width).toBeCloseTo(square.rect.height, 4);
  expect(square.bands).toHaveLength(2);
});
