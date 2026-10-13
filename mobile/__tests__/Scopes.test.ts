import {describe, expect, it} from '@jest/globals';
import {decodeScopeBytes, decodeScopeFrame, SCOPE_SHAPE} from '../src/scopes/protocol';
import {createScopePanelState, scopePanelLayout, updateScopePanelState, SCOPE_KINDS} from '../src/scopes/panelState';

const base64 = (size: number) => Buffer.alloc(size).toString('base64');
const scopeEvent = () => ({
  version: 1, timestampUs: 123456, width: 240, height: 160, rotation: 0, sourceAspectRatio: 1.5,
  demo: true, postLut: true, pixels: 38400, clipLow: 12, clipHigh: 42,
  histogram: base64(1024), waveform: base64(4096), parade: base64(6144), vectorscope: base64(4096),
});

describe('native scopes protocol', () => {
  it('decodes unsigned bytes, including each base64 padding case', () => {
    for (const bytes of [[0], [0, 255], [0, 128, 255], [0, 1, 64, 128, 254, 255, 127]]) {
      const encoded = Buffer.from(bytes).toString('base64');
      expect(Array.from(decodeScopeBytes(encoded, bytes.length)!)).toEqual(bytes);
    }
    const bytes = Buffer.alloc(6144);
    for (let i = 0; i < bytes.length; i++) bytes[i] = i % 256;
    expect(Array.from(decodeScopeBytes(bytes.toString('base64'), bytes.length)!)).toEqual(Array.from(bytes));
  });
  it('rejects truncated, oversized, noncanonical and invalid base64', () => {
    for (const input of ['A===', 'AB==', 'AAD=', 'AAA!', 'AAAA', 'AA==AA==', 'AA==\n', '\u00ffA=='])
      expect(decodeScopeBytes(input, 1)).toBeNull();
    expect(decodeScopeBytes('AA=A', 2)).toBeNull();
    expect(decodeScopeBytes('AA==', 2)).toBeNull();
    expect(decodeScopeBytes(null, 1)).toBeNull();
  });
  it('validates and decodes all four grids in an event', () => {
    const data = decodeScopeFrame(scopeEvent())!;
    expect(data.demo).toBe(true);
    expect(data.histogram).toBeInstanceOf(Uint8Array);
    expect(data.histogram.length).toBe(4 * SCOPE_SHAPE.histogramBins);
    expect(data.waveform.length).toBe(SCOPE_SHAPE.waveWidth * SCOPE_SHAPE.levels);
    expect(data.parade.length).toBe(3 * SCOPE_SHAPE.paradeWidth * SCOPE_SHAPE.levels);
    expect(data.vectorscope.length).toBe(SCOPE_SHAPE.vectorSize ** 2);
    expect(decodeScopeFrame({...scopeEvent(), rotation: 90})).not.toBeNull();
  });
  it('rejects unsupported schemas, impossible dimensions and corrupt data', () => {
    for (const patch of [{version: 2}, {postLut: false}, {demo: 1}, {rotation: 180}, {timestampUs: Infinity},
      {sourceAspectRatio: NaN}, {sourceAspectRatio: 0}, {sourceAspectRatio: '1.5'},
      {width: 0}, {width: 257}, {height: 1.5}, {pixels: 1}, {clipLow: -1}, {clipHigh: 38401},
      {histogram: base64(1023)}, {waveform: 'corrupt'}, {parade: null}, {vectorscope: base64(4097)}])
      expect(decodeScopeFrame({...scopeEvent(), ...patch})).toBeNull();
    expect(decodeScopeFrame(undefined)).toBeNull();
  });
});

describe('independent scope panel state', () => {
  it('opens every combination and closes one without changing the others', () => {
    for (let mask = 0; mask < 16; mask++) {
      let state = createScopePanelState();
      SCOPE_KINDS.forEach((kind, index) => {if (mask & (1 << index)) state = updateScopePanelState(state, {type: 'toggle', kind});});
      SCOPE_KINDS.forEach((kind, index) => expect(state[kind].open).toBe(!!(mask & (1 << index))));
      const before = state;
      state = updateScopePanelState(state, {type: 'close', kind: 'histogram'});
      expect(state.histogram.open).toBe(false);
      for (const kind of SCOPE_KINDS.slice(1)) expect(state[kind]).toBe(before[kind]);
    }
  });
  it('remembers positions across closing, reopening and closing all panels', () => {
    let state = createScopePanelState();
    state = updateScopePanelState(state, {type: 'move', kind: 'waveform', position: {x: .4, y: .8}});
    state = updateScopePanelState(state, {type: 'toggle', kind: 'waveform'});
    state = updateScopePanelState(state, {type: 'close', kind: 'waveform'});
    state = updateScopePanelState(state, {type: 'toggle', kind: 'waveform'});
    expect(state.waveform.position).toEqual({x: .4, y: .8});
    state = updateScopePanelState(state, {type: 'closeAll'});
    expect(SCOPE_KINDS.every(kind => !state[kind].open)).toBe(true);
    expect(state.waveform.position).toEqual({x: .4, y: .8});
  });
  it('clamps drag positions and keeps cards inside portrait and landscape bounds', () => {
    let state = createScopePanelState();
    state = updateScopePanelState(state, {type: 'move', kind: 'parade', position: {x: -2, y: 8}});
    expect(state.parade.position).toEqual({x: 0, y: 1});
    for (const bounds of [{width: 360, height: 540}, {width: 620, height: 250}, {width: 180, height: 140}]) {
      for (const kind of SCOPE_KINDS) {
        const layout = scopePanelLayout(bounds, state[kind].position);
        expect(layout.x).toBeGreaterThanOrEqual(0);
        expect(layout.y).toBeGreaterThanOrEqual(0);
        expect(layout.x + layout.width).toBeLessThanOrEqual(bounds.width);
        expect(layout.y + layout.height).toBeLessThanOrEqual(bounds.height);
      }
    }
  });
  it('raises a dragged panel without closing or moving it', () => {
    const before = createScopePanelState();
    const after = updateScopePanelState(before, {type: 'raise', kind: 'histogram'});
    expect(after.histogram.layer).toBeGreaterThan(after.vectorscope.layer);
    expect(after.histogram.position).toEqual(before.histogram.position);
    expect(after.histogram.open).toBe(before.histogram.open);
  });
});
