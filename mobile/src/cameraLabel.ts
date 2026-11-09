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

/** Connection control. The body name stays on the HUD; this button only names the link. */
export function connectionControlLabel(state: Pick<CameraState, 'active' | 'demo' | 'transport'>) {
  if (!state.active) return '连接';
  if (state.demo) return '演示';
  return linkName(state.transport);
}

/** Top-bar pill: body name first, link after it, e.g.「DC-S5」「USB」. Wi-Fi keeps its experimental note. */
export function connectionPill(state: Pick<CameraState, 'active' | 'demo' | 'transport' | 'cameraModel'>) {
  if (!state.active) return {title: '未连接', detail: ''};
  if (state.demo) return {title: '演示', detail: ''};
  const model = state.cameraModel?.trim();
  const link = state.transport === 'wifi' ? 'Wi-Fi 实验' : 'USB';
  return model ? {title: model, detail: link} : {title: link, detail: '已连接'};
}
