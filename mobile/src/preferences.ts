import {camera} from './native';
import {Guide} from './referenceFrame';

export const PREFERENCE_KEYS = ['autoExport', 'syncBodyPhotos', 'rememberCapture', 'onboardingSeen'] as const;
export type PreferenceKey = typeof PREFERENCE_KEYS[number];
export type CaptureMemory = {motion: boolean; grid: boolean; guide: Guide; timerSeconds: number};
export type AppPreferences = {
  autoExport: boolean; syncBodyPhotos: boolean; rememberCapture: boolean; onboardingSeen: boolean;
  capture: CaptureMemory;
};
export type StorageUsage = {count: number; bytes: number};

const GUIDES: readonly Guide[] = ['off', '16:9', '1:1', '4:5'];
const TIMERS = [0, 2, 5, 10, 30];

export const DEFAULT_CAPTURE: CaptureMemory = {motion: false, grid: true, guide: 'off', timerSeconds: 0};
export const DEFAULT_PREFERENCES: AppPreferences = {
  autoExport: false, syncBodyPhotos: true, rememberCapture: false, onboardingSeen: false, capture: DEFAULT_CAPTURE,
};

export function normalizeCapture(value: Partial<CaptureMemory> | null | undefined): CaptureMemory {
  const requested = value?.guide;
  const guide: Guide = requested !== undefined && GUIDES.includes(requested) ? requested : 'off';
  const seconds = Number(value?.timerSeconds);
  return {
    motion: value?.motion === true,
    grid: value?.grid !== false,
    guide,
    timerSeconds: TIMERS.includes(seconds) ? seconds : 0,
  };
}

export function normalizePreferences(value: Partial<AppPreferences> | null | undefined): AppPreferences {
  return {
    autoExport: value?.autoExport === true,
    syncBodyPhotos: value?.syncBodyPhotos !== false,
    rememberCapture: value?.rememberCapture === true,
    onboardingSeen: value?.onboardingSeen === true,
    capture: normalizeCapture(value?.capture),
  };
}

/** Photo/motion, grid, guide and timer as the capture screen stores them. Timer off keeps the 10 second picker default. */
export function captureView(memory: CaptureMemory) {
  const capture = normalizeCapture(memory);
  return {
    motionEnabled: capture.motion,
    grid: capture.grid,
    guide: capture.guide,
    timerEnabled: capture.timerSeconds > 0,
    delay: capture.timerSeconds > 0 ? capture.timerSeconds : 10,
  };
}

export async function loadPreferences(): Promise<AppPreferences | null> {
  if (!camera?.getPreferences) return null;
  try { return normalizePreferences(await camera.getPreferences()); }
  catch { return null; }
}

export async function savePreference(key: PreferenceKey, value: boolean) {
  if (!camera?.setPreference) throw new Error('当前平台没有相机桥');
  await camera.setPreference(key, value);
}

export async function saveCaptureSettings(settings: CaptureMemory) {
  if (!camera?.setCaptureSettings) return;
  await camera.setCaptureSettings(normalizeCapture(settings));
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return '未知';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  const digits = unit === 0 || value >= 10 ? 0 : 1;
  return `${value.toFixed(digits).replace(/\.0$/, '')} ${units[unit]}`;
}
