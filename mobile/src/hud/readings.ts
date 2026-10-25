import {BatteryReading, CameraState} from '../native';

/** Three missed ~2 s refreshes. A newer sample clears it; a quiet link still says the last reading expired. */
export const EXPOSURE_STALE_MS = 6_000;
const EMPTY = {aperture: 'f/—', shutter: '快门 —', iso: 'ISO —'};

/** Only split the display forms emitted by USB / Wi-Fi. Encoded Wi-Fi values stay raw. */
export function exposureReading(state: CameraState) {
  if (!state.active) return {...EMPTY, label: '曝光 · 未连接', detail: ''};
  if (state.demo) return {...EMPTY, label: '曝光 · 演示无读数', detail: ''};
  const raw = state.exposure?.trim() || '';
  const values = {...EMPTY};
  const unparsed: string[] = [];
  for (const part of raw.split(/\s{2,}/).filter(Boolean)) {
    // USB produces a decimal f-number. Bare integers / fractions may be Wi-Fi enums.
    const aperture = /^f\/(\d+\.\d+)$/i.exec(part);
    if (/^ISO (?:[1-9]\d*|AUTO)$/i.test(part)) values.iso = part;
    else if (aperture && Number(aperture[1]) > 0 && Number(aperture[1]) <= 128) values.aperture = part;
    else if (/^(?:快门 )?(?:1\/[1-9]\d*(?:\.\d+)?|(?:[1-9]\d*(?:\.\d+)?|0\.\d+)s|BULB|B)$/i.test(part)) values.shutter = part.replace(/^快门 /, '');
    else unparsed.push(part);
  }
  const available = Object.entries(values).some(([key, value]) => value !== EMPTY[key as keyof typeof EMPTY]);
  const knownAge = typeof state.exposureAgeMs === 'number' && Number.isFinite(state.exposureAgeMs) && state.exposureAgeMs >= 0;
  const label = raw && knownAge && state.exposureAgeMs! > EXPOSURE_STALE_MS ? '曝光 · 上次读数已过期' : !available ? '曝光 · 未提供完整读数' : !knownAge ? '曝光 · 最近读数' : '曝光';
  // A successful preview / state refresh is not evidence of a new exposure sample.
  return {...values, label, detail: unparsed.join(' · ') || (!raw ? '机身未提供读数' : '')};
}

export function batteryText(reading?: BatteryReading | null) {
  const value = reading?.percent;
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100 ? `${Math.round(value)}%` : '—';
}
