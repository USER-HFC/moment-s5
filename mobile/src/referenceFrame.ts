export const GUIDE_ORDER = ['off', '3:2', '16:9', '1:1', '4:5'] as const;
export type Guide = typeof GUIDE_ORDER[number];
export type GuideId = Exclude<Guide, 'off'>;
export type FrameRect = {left: number; top: number; width: number; height: number};

const ASPECT: Record<GuideId, number> = {'3:2': 3 / 2, '16:9': 16 / 9, '1:1': 1, '4:5': 4 / 5};

/** Fit a guide inside the preview. Ratios wider than 1 stay wider than tall in both orientations. */
export function guideRect(frameWidth: number, frameHeight: number, guide: GuideId): FrameRect {
  const ratio = ASPECT[guide];
  let width = frameWidth;
  let height = width / ratio;
  if (height > frameHeight) { height = frameHeight; width = height * ratio; }
  return {width, height, left: (frameWidth - width) / 2, top: (frameHeight - height) / 2};
}

/**
 * Bands of the preview that sit outside the guide. A guide that already fills the
 * frame (the 3:2 feed with a 3:2 guide) returns none, so nothing is painted twice.
 */
export function shadeOutside(frameWidth: number, frameHeight: number, guide: FrameRect): FrameRect[] {
  const right = frameWidth - guide.left - guide.width;
  const bottom = frameHeight - guide.top - guide.height;
  const bands: FrameRect[] = [];
  if (guide.top >= 0.5) bands.push({left: 0, top: 0, width: frameWidth, height: guide.top});
  if (bottom >= 0.5) bands.push({left: 0, top: guide.top + guide.height, width: frameWidth, height: bottom});
  if (guide.left >= 0.5) bands.push({left: 0, top: guide.top, width: guide.left, height: guide.height});
  if (right >= 0.5) bands.push({left: guide.left + guide.width, top: guide.top, width: right, height: guide.height});
  return bands;
}
