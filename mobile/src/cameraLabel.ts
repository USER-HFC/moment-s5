import {CameraState} from './native';

function linkName(transport?: CameraState['transport']) {
  return transport === 'wifi' ? 'Wi-Fi' : 'USB';
}

/** HUD source. A known body reads「DC-S5 · USB」; demo stays「演示」. */
export function hudSource(state: Pick<CameraState, 'active' | 'demo' | 'transport' | 'cameraModel'>) {
  if (!state.active) return '';
  if (state.demo) return '演示';
  const link = linkName(state.transport);
  const model = state.cameraModel?.trim();
  if (model) return `${model} · ${link}`;
  return state.transport === 'wifi' ? 'Wi-Fi · 实验性' : 'USB · 已连接';
}

/** Connection control. Same model line, shorter fallbacks while the body name is unknown. */
export function connectionControlLabel(state: Pick<CameraState, 'active' | 'demo' | 'transport' | 'cameraModel'>) {
  if (!state.active) return '连接';
  if (state.demo) return '演示';
  const link = linkName(state.transport);
  const model = state.cameraModel?.trim();
  return model ? `${model} · ${link}` : link;
}
