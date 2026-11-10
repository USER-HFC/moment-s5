import {MomentItem} from './native';
import {lutDisplayName} from './lutName';
import {OS, currentOS} from './platformText';

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
    case 'MOMENT_MP.jpg': return '动态照片';
    default: return name;
  }
}

export const shareKindLabel: Record<ShareKind, string> = {
  display: '分享当前画面',
  original: '分享原片',
  video: '分享动态视频',
  motion: '分享动态照片',
};

/** Visible row in the in-app share sheet. The accessibility name stays the longer shareKindLabel. */
export const shareOptionLabel: Record<ShareKind, string> = {
  motion: '动态照片',
  video: '动态视频',
  original: '原片',
  display: '当前画面',
};

/** iOS has no file format that every receiving app turns back into a Live Photo, so it says what is sent. */
export function shareOptionHint(kind: ShareKind, moment: {lut?: string | null}, os: OS = currentOS()) {
  switch (kind) {
    case 'motion': return os === 'ios' ? '照片和视频两个文件' : '可在相册里播放';
    case 'video': return '单独的视频';
    case 'original': return '未套用 LUT';
    case 'display': return moment.lut ? '带 LUT 的画面' : '正在查看的画面';
    default: return '';
  }
}

export function shareDialogTitle(moment: Pick<MomentItem, 'videoUri' | 'captureMode' | 'complete' | 'imageUri' | 'originalUri'>) {
  return shareKinds(moment).includes('motion') ? '分享动态照片' : '分享照片';
}

/**
 * Options that have a file, in sheet order.
 * MOMENT_MP.jpg is packed only after a dynamic photo finishes, so an unfinished one cannot offer it.
 * 当前画面 is the picture on screen (rendered.jpg when a LUT is applied, otherwise the original).
 */
export function shareKinds(moment: Pick<MomentItem, 'videoUri' | 'captureMode' | 'complete' | 'imageUri' | 'originalUri'>): ShareKind[] {
  const kinds: ShareKind[] = [];
  if (moment.captureMode !== 'photo' && !!moment.videoUri && moment.complete) kinds.push('motion');
  if (moment.videoUri) kinds.push('video');
  if (moment.originalUri) kinds.push('original');
  if (moment.imageUri) kinds.push('display');
  return kinds;
}

export type AlbumFilter = 'all' | 'photo' | 'motion' | 'camera';

export const ALBUM_FILTERS: {id: AlbumFilter; label: string}[] = [
  {id: 'all', label: '全部'},
  {id: 'photo', label: '照片'},
  {id: 'motion', label: '动态'},
  {id: 'camera', label: '机身同步'},
];

type FilterableMoment = Pick<MomentItem, 'captureMode' | 'cameraTriggered' | 'demo'>;

/** A demo frame can carry a shutter flag, but it was not synced from a camera body. */
export function isCameraSyncMoment(moment: FilterableMoment) {
  return !!moment.cameraTriggered && !moment.demo;
}

type MomentKind = Pick<MomentItem, 'captureMode' | 'cameraTriggered' | 'demo'>;

/** Screen-reader kind. A demo frame is never described as a body-shutter photo. */
export function momentKindLabel(moment: MomentKind) {
  const motion = moment.captureMode !== 'photo';
  if (isCameraSyncMoment(moment)) return motion ? '机身同步动态照片' : '机身同步照片';
  if (moment.demo) return motion ? '演示动态照片' : '演示照片';
  return motion ? '动态照片' : '照片';
}

/** Grid cell name. The clock matches the viewer title, which uses the same day groups. */
export function momentAccessibilityName(moment: MomentKind & Pick<MomentItem, 'createdAt'>, now = Date.now()) {
  return `${momentKindLabel(moment)}，${formatCaptureTitle(moment.createdAt, now)}`;
}

export function matchesAlbumFilter(moment: FilterableMoment, filter: AlbumFilter) {
  if (filter === 'photo') return moment.captureMode === 'photo';
  if (filter === 'motion') return moment.captureMode !== 'photo';
  if (filter === 'camera') return isCameraSyncMoment(moment);
  return true;
}

export function albumFilterCounts(moments: FilterableMoment[]) {
  const counts: Record<AlbumFilter, number> = {all: moments.length, photo: 0, motion: 0, camera: 0};
  for (const moment of moments) {
    if (moment.captureMode === 'photo') counts.photo += 1;
    else counts.motion += 1;
    if (isCameraSyncMoment(moment)) counts.camera += 1;
  }
  return counts;
}

export function albumFilterEmpty(filter: AlbumFilter) {
  switch (filter) {
    case 'photo': return {title: '没有照片', body: '静态照片会出现在这里。'};
    case 'motion': return {title: '没有动态照片', body: '拍下的动态照片会出现在这里。'};
    case 'camera': return {title: '没有机身同步的照片', body: '用机身快门拍下的照片会出现在这里。'};
    default: return {title: '还没有照片', body: '拍下的照片会按日期出现在这里。'};
  }
}

/** 「已导出 5 张」when everything worked, 「2 张失败」when nothing did, both clauses when mixed. */
export function batchResultMessage(verb: '导出' | '删除', ok: number, failed: number) {
  if (ok > 0 && failed > 0) return `已${verb} ${ok} 张，${failed} 张失败`;
  if (ok > 0) return `已${verb} ${ok} 张`;
  return `${failed} 张失败`;
}

/** Downward travel that closes the viewer. Callers refuse this while the photo is zoomed. */
export function viewerDismissPastThreshold(translationY: number, velocityY: number, pageHeight: number) {
  const height = Math.max(pageHeight, 1);
  return translationY >= Math.max(96, height * 0.18) || velocityY >= 900;
}
