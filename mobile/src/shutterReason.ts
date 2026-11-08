import {bufferWaitLabel} from './hud/bufferStatus';

export const LOW_STORAGE_REASON = '手机存储空间不足，请先清理';

export function shutterBlockedReason(input: {active: boolean; busy: boolean; motion: boolean; ready: boolean; buffered: number; storageLow?: boolean}) {
  if (!input.active) return '请先连接相机';
  // A full disk fails the save even when the buffer is ready, so say that before the other blocks.
  if (input.storageLow) return LOW_STORAGE_REASON;
  if (input.busy) return '正在保存上一张';
  if (input.motion && !input.ready) return bufferWaitLabel(input.buffered);
  return null;
}
