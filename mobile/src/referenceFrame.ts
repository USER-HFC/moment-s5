export const GUIDE_ORDER = ['off', '16:9', '1:1', '4:5'] as const;
export type Guide = typeof GUIDE_ORDER[number];
export type GuideId = Exclude<Guide, 'off'>;

const ASPECT: Record<GuideId, number> = {'16:9': 16 / 9, '1:1': 1, '4:5': 4 / 5};

export function nextGuide(guide: Guide): Guide {
  return GUIDE_ORDER[(GUIDE_ORDER.indexOf(guide) + 1) % GUIDE_ORDER.length];
}

/** Fit a landscape-or-portrait guide inside the preview. 16:9 stays wider than tall. */
export function guideRect(frameWidth: number, frameHeight: number, guide: GuideId) {
  const ratio = ASPECT[guide];
  let width = frameWidth;
  let height = width / ratio;
  if (height > frameHeight) { height = frameHeight; width = height * ratio; }
  return {width, height, left: (frameWidth - width) / 2, top: (frameHeight - height) / 2};
}
