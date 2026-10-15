export const SCOPE_KINDS = ['histogram', 'waveform', 'parade', 'vectorscope'] as const;
export type ScopeKind = typeof SCOPE_KINDS[number];
export type ScopePosition = {x: number; y: number};
export type ScopeSize = 'S' | 'M';
export type ScopePanel = {open: boolean; position: ScopePosition; layer: number; size: ScopeSize; slot: number; moved: boolean};
export type ScopePanelState = Record<ScopeKind, ScopePanel>;
export type ScopePanelAction =
  | {type: 'toggle' | 'close' | 'raise'; kind: ScopeKind}
  | {type: 'move'; kind: ScopeKind; position: ScopePosition; slot?: number}
  | {type: 'resize'; kind: ScopeKind; size: ScopeSize}
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
    action.type === 'resize' ? {...panel, size: action.size, layer: front} :
    action.type === 'close' ? {...panel, open: false} :
    action.type === 'raise' ? {...panel, layer: front} : {...panel, open: !panel.open, layer: front, slot};
  return {...state, [action.kind]: next};
}

/** Tile compact charts; enlarged charts can overlap, but never leave the HUD-safe area. */
export function scopePanelLayout(bounds: ScopeBounds, position: ScopePosition, size: ScopeSize = 'S', slot?: number, panelCount = 4) {
  const inset = bounds.insets || {top: 8, bottom: 8, left: 8, right: 8};
  const minX = Math.min(bounds.width, inset.left), minY = Math.min(bounds.height, inset.top);
  const freeWidth = Math.max(0, bounds.width - minX - inset.right);
  const freeHeight = Math.max(0, bounds.height - minY - inset.bottom);
  // A selected chart needs three distinct 48dp targets; never compress / overlap them.
  const columns = bounds.width > bounds.height && freeWidth >= 4 * 144 + 3 * 8 ? 4 : freeWidth >= 2 * 144 + 8 ? 2 : 1;
  const rows = columns === 1 && panelCount === 1 ? 1 : 4 / columns, gap = 8;
  const tile = slot === undefined ? undefined : Math.min(slot, columns * rows - 1);
  const width = Math.max(0, size === 'M' ? Math.min(280, freeWidth) : Math.min(184, (freeWidth - gap * (columns - 1)) / columns));
  const height = Math.max(0, size === 'M' ? Math.min(220, freeHeight) : Math.min(160, (freeHeight - gap * (rows - 1)) / rows));
  const travelX = Math.max(0, freeWidth - width), travelY = Math.max(0, freeHeight - height);
  const x = tile === undefined ? minX + clampPosition(position.x) * travelX : minX + (columns === 1 ? 0 : (tile % columns) * (travelX / (columns - 1)));
  const y = tile === undefined ? minY + clampPosition(position.y) * travelY : minY + Math.floor(tile / columns) * (rows === 1 ? 0 : travelY / (rows - 1));
  return {width, height, travelX, travelY, minX, minY, columns, rows, x, y};
}
