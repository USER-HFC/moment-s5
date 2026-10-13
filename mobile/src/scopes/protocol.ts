export const SCOPE_SHAPE = {histogramBins: 256, waveWidth: 64, levels: 64, paradeWidth: 32, vectorSize: 64} as const;

export type ScopeFrame = {
  version: 1; timestampUs: number; width: number; height: number; rotation: 0 | 90; sourceAspectRatio: number;
  demo: boolean; postLut: true; pixels: number; clipLow: number; clipHigh: number;
  histogram: Uint8Array; waveform: Uint8Array; parade: Uint8Array; vectorscope: Uint8Array;
};

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const lookup = new Int16Array(128).fill(-1);
for (let i = 0; i < alphabet.length; i++) lookup[alphabet.charCodeAt(i)] = i;

/** Strict, fixed-size decoding without Node Buffer, atob, or an extra RN dependency. */
export function decodeScopeBytes(value: unknown, expectedLength: number): Uint8Array | null {
  if (typeof value !== 'string' || value.length !== 4 * Math.ceil(expectedLength / 3)) return null;
  const out = new Uint8Array(expectedLength);
  let cursor = 0;
  for (let i = 0; i < value.length; i += 4) {
    const last = i + 4 === value.length;
    const remaining = expectedLength - cursor;
    const padding = last ? (3 - remaining) : 0;
    const a = lookup[value.charCodeAt(i)], b = lookup[value.charCodeAt(i + 1)];
    const c = value[i + 2] === '=' ? -1 : lookup[value.charCodeAt(i + 2)];
    const d = value[i + 3] === '=' ? -1 : lookup[value.charCodeAt(i + 3)];
    if (!(a >= 0) || !(b >= 0) || (padding < 2 && !(c >= 0)) || (padding === 0 && !(d >= 0))) return null;
    if ((padding === 2 && (value[i + 2] !== '=' || (b & 15) !== 0)) ||
        (padding >= 1 && value[i + 3] !== '=') || (padding === 1 && (c & 3) !== 0)) return null;
    out[cursor++] = (a << 2) | (b >> 4);
    if (padding < 2) out[cursor++] = (b << 4) | (c >> 2);
    if (padding === 0) out[cursor++] = (c << 6) | d;
  }
  return out;
}

export function decodeScopeFrame(event: unknown): ScopeFrame | null {
  if (!event || typeof event !== 'object') return null;
  const e = event as Record<string, unknown>;
  const integer = (value: unknown, min: number, max: number): value is number =>
    typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max;
  if (e.version !== 1 || e.postLut !== true || typeof e.demo !== 'boolean' ||
      !integer(e.timestampUs, 0, Number.MAX_SAFE_INTEGER) || !integer(e.width, 1, 256) || !integer(e.height, 1, 256) ||
      (e.rotation !== 0 && e.rotation !== 90) || typeof e.sourceAspectRatio !== 'number' ||
      !Number.isFinite(e.sourceAspectRatio) || e.sourceAspectRatio < .25 || e.sourceAspectRatio > 4 || e.pixels !== e.width * e.height ||
      !integer(e.clipLow, 0, e.pixels as number) || !integer(e.clipHigh, 0, e.pixels as number)) return null;
  const {histogramBins, waveWidth, levels, paradeWidth, vectorSize} = SCOPE_SHAPE;
  const histogram = decodeScopeBytes(e.histogram, 4 * histogramBins);
  const waveform = decodeScopeBytes(e.waveform, waveWidth * levels);
  const parade = decodeScopeBytes(e.parade, 3 * paradeWidth * levels);
  const vectorscope = decodeScopeBytes(e.vectorscope, vectorSize * vectorSize);
  if (!histogram || !waveform || !parade || !vectorscope) return null;
  return {...e, histogram, waveform, parade, vectorscope} as ScopeFrame;
}
