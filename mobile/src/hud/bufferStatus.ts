export const MOTION_BUFFER_SECONDS = 3;

export function bufferReadout(buffered: number, ready: boolean) {
  const elapsed = Number.isFinite(buffered) && buffered > 0 ? Math.min(MOTION_BUFFER_SECONDS, buffered) : 0;
  const progress = Math.max(0, Math.min(1, elapsed / MOTION_BUFFER_SECONDS));
  if (ready) return {label: '已缓存 3 秒 · 可拍', progress: 1};
  return {label: `缓存中 ${(Math.round(elapsed * 10) / 10).toFixed(1)} 秒`, progress};
}

export function bufferWaitLabel(buffered: number) {
  const elapsed = Number.isFinite(buffered) && buffered > 0 ? Math.min(MOTION_BUFFER_SECONDS, buffered) : 0;
  const remain = Math.max(1, Math.ceil(MOTION_BUFFER_SECONDS - elapsed));
  return `动态照片还在缓存，还需约 ${remain} 秒`;
}
