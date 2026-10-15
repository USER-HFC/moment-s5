export const SCOPE_KINDS = ['histogram', 'waveform', 'parade', 'vectorscope'] as const;
export type ScopeKind = typeof SCOPE_KINDS[number];
export type ScopePosition = {x: number; y: number};
export type ScopeSize = 'S' | 'M';
export type ScopePanel = {open: boolean; position: ScopePosition; layer: number; size: ScopeSize; slot: number; moved: boolean};
export type ScopePanelState = Record<ScopeKind, ScopePanel>;
export type ScopePanelAction =
  | {type: 'toggle' | 'close' | 'raise'; kind: ScopeKind}
  | {type: 'move'; kind: ScopeKind; position: ScopePosition; slot?: number}
  | {type: 'resizeAll'; size: ScopeSize}
  | {type: 'closeAll'};
export type ScopeBounds = {width: number; height: number; insets?: {top: number; bottom: number; left: number; right: number}};
export const SCOPE_TITLES: Record<ScopeKind, string> = {
  histogram: 'RGB 直方图', waveform: '亮度波形', parade: 'RGB 分列', vectorscope: '矢量示波器',
};

export function createScopePanelState(): ScopePanelState {
  return Object.fromEntries(SCOPE_KINDS.map((kind, slot) => [kind, {
    open: false, position: {x: slot % 2, y: Math.floor(slot / 2)}, layer: slot + 1, size: 'S', slot, moved: false,
  }])) as ScopePanelState;
}
export const clampPosition = (value: number) => Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;

export function updateScopePanelState(state: ScopePanelState, action: ScopePanelAction): ScopePanelState {
  if (action.type === 'closeAll' || action.type === 'resizeAll') {
    return Object.fromEntries(SCOPE_KINDS.map(kind => [kind, action.type === 'closeAll' ? {...state[kind], open: false} : {...state[kind], size: action.size}])) as ScopePanelState;
  }
  const panel = state[action.kind];
  const front = Math.max(...SCOPE_KINDS.map(kind => state[kind].layer)) + 1;
  const occupied = SCOPE_KINDS.filter(kind => kind !== action.kind && state[kind].open).map(kind => state[kind].slot);
  const slot = occupied.includes(panel.slot) ? [0, 1, 2, 3].find(value => !occupied.includes(value)) ?? panel.slot : panel.slot;
  const next = action.type === 'move' ? {...panel, moved: true, slot: action.slot ?? panel.slot, position: {x: clampPosition(action.position.x), y: clampPosition(action.position.y)}} :
    action.type === 'close' ? {...panel, open: false} :
    action.type === 'raise' ? {...panel, layer: front} : {...panel, open: !panel.open, layer: front, slot};
  return {...state, [action.kind]: next};
}

/** Tile untouched cards, and store dragged positions as fractions of the HUD-safe travel. */
export function scopePanelLayout(bounds: ScopeBounds, position: ScopePosition, size: ScopeSize = 'S', slot?: number, panelCount = 4) {
  const inset = bounds.insets || {top: 8, bottom: 8, left: 8, right: 8};
  const minX = Math.min(bounds.width, inset.left), minY = Math.min(bounds.height, inset.top);
  const freeWidth = Math.max(0, bounds.width - minX - inset.right);
  const freeHeight = Math.max(0, bounds.height - minY - inset.bottom);
  const single = size === 'M' && panelCount === 1;
  const columns = single ? 1 : bounds.width > bounds.height && freeWidth >= 360 && (size === 'S' || freeHeight < 288) ? 4 : 2;
  const rows = single ? 1 : 4 / columns, gap = 8;
  const tile = single && slot !== undefined ? 0 : slot;
  const width = Math.max(0, Math.min(size === 'S' ? 184 : 248, (freeWidth - gap * (columns - 1)) / columns));
  const height = Math.max(0, Math.min(size === 'S' ? 136 : 192, (freeHeight - gap * (rows - 1)) / rows));
  const travelX = Math.max(0, freeWidth - width), travelY = Math.max(0, freeHeight - height);
  const x = tile === undefined ? minX + clampPosition(position.x) * travelX : minX + (tile % columns) * (columns === 1 ? 0 : travelX / (columns - 1));
  const y = tile === undefined ? minY + clampPosition(position.y) * travelY : minY + Math.floor(tile / columns) * (rows === 1 ? 0 : travelY / (rows - 1));
  return {width, height, travelX, travelY, minX, minY, columns, rows, x, y};
}
