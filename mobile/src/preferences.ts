import {camera} from './native';
import {GUIDE_ORDER, Guide} from './referenceFrame';

export const PREFERENCE_KEYS = ['autoExport', 'syncBodyPhotos', 'rememberCapture', 'onboardingSeen', 'volumeShutter', 'reverseFocus', 'shutterVibration'] as const;
export type PreferenceKey = typeof PREFERENCE_KEYS[number];
export type CaptureMemory = {motion: boolean; grid: boolean; guide: Guide; timerSeconds: number};
export type AppPreferences = {
  autoExport: boolean; syncBodyPhotos: boolean; rememberCapture: boolean; onboardingSeen: boolean;
  volumeShutter: boolean; reverseFocus: boolean; shutterVibration: boolean;
  capture: CaptureMemory;
};
export type StorageUsage = {count: number; bytes: number; exportedCount: number; exportedBytes: number; usableBytes?: number};

const GUIDES: readonly Guide[] = GUIDE_ORDER;
const TIMERS = [0, 2, 5, 10, 30];

export const DEFAULT_CAPTURE: CaptureMemory = {motion: false, grid: true, guide: 'off', timerSeconds: 0};
export const DEFAULT_PREFERENCES: AppPreferences = {
  autoExport: false, syncBodyPhotos: true, rememberCapture: false, onboardingSeen: false,
  volumeShutter: true, reverseFocus: false, shutterVibration: true, capture: DEFAULT_CAPTURE,
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
    volumeShutter: value?.volumeShutter !== false,
    reverseFocus: value?.reverseFocus === true,
    shutterVibration: value?.shutterVibration !== false,
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

const preferenceListeners = new Set<() => void>();

export function subscribePreferences(listener: () => void) {
  preferenceListeners.add(listener);
  return () => { preferenceListeners.delete(listener); };
}

export async function loadPreferences(): Promise<AppPreferences | null> {
  if (!camera?.getPreferences) return null;
  try { return normalizePreferences(await camera.getPreferences()); }
  catch { return null; }
}

export async function savePreference(key: PreferenceKey, value: boolean) {
  if (!camera?.setPreference) throw new Error('当前平台没有相机桥');
  await camera.setPreference(key, value);
  preferenceListeners.forEach(listener => listener());
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

/** Line under the storage cleanup button. Zero means there is nothing the button can remove. */
export function clearableSummary(exportedCount: number, exportedBytes: number) {
  if (!Number.isFinite(exportedCount) || exportedCount <= 0) return '没有可清理的照片';
  return `可清理 ${Math.floor(exportedCount)} 张，约 ${formatBytes(exportedBytes)}`;
}
