import {MomentItem} from './native';

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
