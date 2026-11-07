import {bufferWaitLabel} from './hud/bufferStatus';

export function shutterBlockedReason(input: {active: boolean; busy: boolean; motion: boolean; ready: boolean; buffered: number}) {
  if (!input.active) return '请先连接相机';
  if (input.busy) return '正在保存上一张';
  if (input.motion && !input.ready) return bufferWaitLabel(input.buffered);
  return null;
}
