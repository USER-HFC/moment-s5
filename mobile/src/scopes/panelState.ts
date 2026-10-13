export const SCOPE_KINDS = ['histogram', 'waveform', 'parade', 'vectorscope'] as const;
export type ScopeKind = typeof SCOPE_KINDS[number];
export type ScopePosition = {x: number; y: number};
export type ScopePanel = {open: boolean; position: ScopePosition; layer: number};
export type ScopePanelState = Record<ScopeKind, ScopePanel>;
export type ScopePanelAction =
  | {type: 'toggle' | 'close' | 'raise'; kind: ScopeKind}
  | {type: 'move'; kind: ScopeKind; position: ScopePosition}
  | {type: 'closeAll'};
export type ScopeBounds = {width: number; height: number};

export const SCOPE_TITLES: Record<ScopeKind, string> = {
  histogram: 'RGB / 亮度直方图', waveform: '亮度波形', parade: 'RGB 分列', vectorscope: '矢量示波器',
};

export function createScopePanelState(): ScopePanelState {
  return {
    histogram: {open: false, position: {x: 0, y: 0}, layer: 1},
    waveform: {open: false, position: {x: 1, y: 0}, layer: 2},
    parade: {open: false, position: {x: 0, y: 1}, layer: 3},
    vectorscope: {open: false, position: {x: 1, y: 1}, layer: 4},
  };
}

export const clampPosition = (value: number) => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

export function updateScopePanelState(state: ScopePanelState, action: ScopePanelAction): ScopePanelState {
  if (action.type === 'closeAll') {
    const next = {...state};
    SCOPE_KINDS.forEach(kind => {next[kind] = {...state[kind], open: false};});
    return next;
  }
  const panel = state[action.kind];
  const front = Math.max(...SCOPE_KINDS.map(kind => state[kind].layer)) + 1;
  const next = action.type === 'move' ? {...panel, position: {x: clampPosition(action.position.x), y: clampPosition(action.position.y)}} :
    action.type === 'close' ? {...panel, open: false} :
    action.type === 'raise' ? {...panel, layer: front} : {...panel, open: !panel.open, layer: front};
  return {...state, [action.kind]: next};
}

/** Store fractions of the available travel so cards stay reachable after rotation. */
export function scopePanelLayout(bounds: ScopeBounds, position: ScopePosition) {
  const width = Math.max(0, Math.min(224, Math.max(148, (bounds.width - 20) / 2), bounds.width - 12));
  const height = Math.max(0, Math.min(190, Math.max(144, width * .55 + 80), bounds.height - 12));
  const travelX = Math.max(0, bounds.width - width - 12), travelY = Math.max(0, bounds.height - height - 12);
  return {width, height, travelX, travelY, x: 6 + clampPosition(position.x) * travelX, y: 6 + clampPosition(position.y) * travelY};
}
