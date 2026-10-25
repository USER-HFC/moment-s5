import {MomentItem} from './native';
import {lutDisplayName} from './lutName';

export type ShareKind = 'display' | 'original' | 'video' | 'motion';

export function formatMomentDate(timestamp: number) {
  const date = new Date(timestamp);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${two(date.getHours())}:${two(date.getMinutes())}`;
}

export function formatMomentDateTime(timestamp: number) {
  const date = new Date(timestamp);
  return `${formatMomentDate(timestamp)}:${String(date.getSeconds()).padStart(2, '0')}`;
}

const two = (n: number) => String(n).padStart(2, '0');
function dayStart(timestamp: number) {
  const date = new Date(timestamp);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}
const DAY = 24 * 60 * 60 * 1000;

/** Viewer heading: today and yesterday stay relative, older photos use the calendar date. */
export function formatCaptureTitle(timestamp: number, now = Date.now()) {
  const date = new Date(timestamp);
  const days = Math.round((dayStart(now) - dayStart(timestamp)) / DAY);
  const time = `${two(date.getHours())}:${two(date.getMinutes())}`;
  if (days === 0) return `今天 ${time}`;
  if (days === 1) return `昨天 ${time}`;
  if (date.getFullYear() === new Date(now).getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
}

/** Grid section heading: no clock, because the photos below already carry the time. */
export function formatDayHeading(timestamp: number, now = Date.now()) {
  const date = new Date(timestamp);
  const days = Math.round((dayStart(now) - dayStart(timestamp)) / DAY);
  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  if (date.getFullYear() === new Date(now).getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日`;
  return `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日`;
}

export function groupMomentsByDay(moments: MomentItem[], now = Date.now()) {
  const groups = new Map<number, {key: string; title: string; timestamp: number; moments: MomentItem[]}>();
  for (const moment of moments) {
    const start = dayStart(moment.createdAt);
    let group = groups.get(start);
    if (!group) {
      group = {key: String(start), title: formatDayHeading(moment.createdAt, now), timestamp: start, moments: []};
      groups.set(start, group);
    }
    group.moments.push(moment);
  }
  return [...groups.values()].sort((a, b) => b.timestamp - a.timestamp);
}

/** Viewer subtitle: source · connection · LUT, without repeating a value twice. */
export function momentSummary(moment: Pick<MomentItem, 'demo' | 'cameraTriggered' | 'transport' | 'lut'>) {
  const values = [momentOrigin(moment)];
  const transport = momentTransport(moment.transport, moment.demo);
  if (transport !== '未知') values.push(transport);
  if (moment.lut) values.push(lutDisplayName(moment.lut));
  return values.filter((value, index) => values.indexOf(value) === index).join(' · ');
}

/** Keeps the useful tail of an app-private path inside the info sheet. */
export function shortPath(path: string) {
  const parts = path.replace(/\\/g, '/').split('/').filter(Boolean);
  if (parts.length <= 2) return path;
  const name = parts[parts.length - 1];
  const tail = name.length > 12 ? `…${name.slice(-8)}` : name;
  return `…/${parts[parts.length - 2]}/${tail}`;
}

export function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return '—';
  if (bytes < 1024) return `${Math.round(bytes)} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 10 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}

export function formatDimensions(width?: number | null, height?: number | null) {
  if (!width || !height || width <= 0 || height <= 0) return '—';
  return `${width} × ${height}`;
}

export function momentOrigin(moment: Pick<MomentItem, 'demo' | 'cameraTriggered'>) {
  if (moment.demo) return '演示';
  if (moment.cameraTriggered) return '机身快门同步';
  return 'App 快门';
}

export function momentTransport(kind?: string, demo?: boolean) {
  if (!kind) return demo ? '演示' : '未知';
  if (kind === 'usb') return 'USB';
  if (kind === 'wifi') return 'Wi-Fi（实验）';
  if (kind === 'demo') return '演示';
  return kind;
}

export function fileLabel(name: string) {
  switch (name) {
    case 'original.jpg': return '原片';
    case 'rendered.jpg': return 'LUT 成片';
    case 'motion.mp4': return '动态视频';
    case 'MOMENT_MP.jpg': return '实况文件';
    default: return name;
  }
}

export const shareKindLabel: Record<ShareKind, string> = {
  display: '分享当前画面',
  original: '分享原片',
  video: '分享动态视频',
  motion: '分享实况文件',
};

export function shareKinds(moment: Pick<MomentItem, 'videoUri' | 'captureMode' | 'complete'>): ShareKind[] {
  const kinds: ShareKind[] = ['display', 'original'];
  if (moment.videoUri) kinds.push('video');
  if (moment.captureMode !== 'photo' && !!moment.videoUri && moment.complete) kinds.push('motion');
  return kinds;
}
