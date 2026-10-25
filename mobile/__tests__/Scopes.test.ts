import {describe, expect, it} from '@jest/globals';
import {decodeScopeBytes, decodeScopeFrame, SCOPE_SHAPE} from '../src/scopes/protocol';
import {createScopePanelState, scopePanelLayout, updateScopePanelState, SCOPE_KINDS} from '../src/scopes/panelState';
import {densityPaths} from '../src/scopes/ScopePlot';

const histogramBytes = 4 * SCOPE_SHAPE.histogramBins;
const waveformBytes = SCOPE_SHAPE.waveWidth * SCOPE_SHAPE.levels;
const paradeBytes = 3 * SCOPE_SHAPE.paradeWidth * SCOPE_SHAPE.levels;
const vectorBytes = SCOPE_SHAPE.vectorSize ** 2;
const base64 = (size: number) => Buffer.alloc(size).toString('base64');
const scopeEvent = () => ({
  version: 1, timestampUs: 123456, width: 240, height: 160, rotation: 0, sourceAspectRatio: 1.5,
  demo: true, postLut: true, pixels: 38400, clipLow: 12, clipHigh: 42,
  histogram: base64(histogramBytes), waveform: base64(waveformBytes), parade: base64(paradeBytes), vectorscope: base64(vectorBytes),
});

describe('native scopes protocol', () => {
  it('decodes unsigned bytes, including each base64 padding case', () => {
    for (const bytes of [[0], [0, 255], [0, 128, 255], [0, 1, 64, 128, 254, 255, 127]]) {
      const encoded = Buffer.from(bytes).toString('base64');
      expect(Array.from(decodeScopeBytes(encoded, bytes.length)!)).toEqual(bytes);
    }
    const bytes = Buffer.alloc(paradeBytes);
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
      {histogram: base64(histogramBytes - 1)}, {waveform: 'corrupt'}, {parade: null}, {vectorscope: base64(vectorBytes + 1)}])
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
  it('tiles all compact and medium cards without covering measured HUD safe zones', () => {
    for (const bounds of [
      {width: 360, height: 540, insets: {top: 92, bottom: 112, left: 16, right: 16}},
      {width: 600, height: 360, insets: {top: 76, bottom: 112, left: 16, right: 16}},
      {width: 278, height: 416, insets: {top: 126, bottom: 112, left: 16, right: 16}},
      {width: 472, height: 315, insets: {top: 90, bottom: 114, left: 16, right: 16}},
    ]) for (const size of ['S', 'M'] as const) {
      const layouts = [0, 1, 2, 3].map(slot => scopePanelLayout(bounds, {x: 0, y: 0}, size, slot));
      for (const [index, layout] of layouts.entries()) {
        expect(layout.y).toBeGreaterThanOrEqual(bounds.insets.top);
        expect(layout.y + layout.height).toBeLessThanOrEqual(bounds.height - bounds.insets.bottom);
        for (const other of size === 'S' ? layouts.slice(index + 1) : []) expect(
          layout.x + layout.width <= other.x || other.x + other.width <= layout.x ||
          layout.y + layout.height <= other.y || other.y + other.height <= layout.y,
        ).toBe(true);
      }
      for (const position of [{x: 0, y: 0}, {x: 1, y: 1}]) {
        const layout = scopePanelLayout(bounds, position, size);
        expect(layout.y).toBeGreaterThanOrEqual(bounds.insets.top);
        expect(layout.y + layout.height).toBeLessThanOrEqual(bounds.height - bounds.insets.bottom);
      }
    }
  });
  it('can sit on either edge of a portrait or landscape viewfinder', () => {
    for (const bounds of [
      {width: 360, height: 540, insets: {top: 0, bottom: 0, left: 0, right: 0}},
      {width: 640, height: 360, insets: {top: 0, bottom: 0, left: 0, right: 0}},
    ]) for (const size of ['S', 'M'] as const) {
      const top = scopePanelLayout(bounds, {x: 0, y: 0}, size);
      const bottom = scopePanelLayout(bounds, {x: 1, y: 1}, size);
      expect(top.x).toBe(0); expect(top.y).toBe(0);
      expect(bottom.x + bottom.width).toBe(bounds.width);
      expect(bottom.y + bottom.height).toBe(bounds.height);
    }
  });
  it('places a newly opened panel in a free tile', () => {
    let state = createScopePanelState();
    state = updateScopePanelState(state, {type: 'toggle', kind: 'waveform'});
    state = {...state, waveform: {...state.waveform, slot: 0}};
    state = updateScopePanelState(state, {type: 'toggle', kind: 'histogram'});
    expect(state.histogram.slot).not.toBe(state.waveform.slot);
  });
  it('expands a lone medium panel on a small preview without covering either HUD row', () => {
    const bounds = {width: 278, height: 416, insets: {top: 126, bottom: 112, left: 16, right: 16}};
    const small = scopePanelLayout(bounds, {x: 1, y: 1}, 'S', 3, 1);
    const medium = scopePanelLayout(bounds, {x: 1, y: 1}, 'M', 3, 1);
    expect(medium.width).toBeGreaterThan(small.width);
    expect(medium.height).toBeGreaterThan(small.height);
    expect(medium.y).toBeGreaterThanOrEqual(bounds.insets.top);
    expect(medium.y + medium.height).toBeLessThanOrEqual(bounds.height - bounds.insets.bottom);
  });
  it('raises a dragged panel without closing or moving it', () => {
    const before = createScopePanelState();
    const after = updateScopePanelState(before, {type: 'raise', kind: 'histogram'});
    expect(after.histogram.layer).toBeGreaterThan(after.vectorscope.layer);
    expect(after.histogram.position).toEqual(before.histogram.position);
    expect(after.histogram.open).toBe(before.histogram.open);
  });
});

it('resizes one chart without moving or resizing the others, then restores its compact size', () => {
  const before = createScopePanelState();
  let after = updateScopePanelState(before, {type: 'resize', kind: 'waveform', size: 'M'});
  expect(after.waveform.size).toBe('M');
  for (const kind of SCOPE_KINDS.filter(kind => kind !== 'waveform')) expect(after[kind]).toBe(before[kind]);
  const bounds = {width: 360, height: 540, insets: {top: 72, bottom: 40, left: 16, right: 16}};
  const small = scopePanelLayout(bounds, before.waveform.position, 'S', 1, 4);
  const large = scopePanelLayout(bounds, after.waveform.position, 'M', 1, 4);
  expect(large.width).toBeGreaterThan(small.width);
  expect(large.height).toBeGreaterThan(small.height);
  after = updateScopePanelState(after, {type: 'resize', kind: 'waveform', size: 'S'});
  expect(after.waveform.size).toBe('S');
});

describe('scope density paths', () => {
  it('merges adjacent cells of the same brightness band in one row', () => {
    const grid = new Uint8Array([255, 255, 0, 20, 40, 200]);
    const paths = densityPaths(grid, 3);
    expect(paths[5]).toBe('M0 0h2v1h-2z');
    expect(paths[0]).toBe('M0 1h2v1h-2z');
    expect(paths[4]).toBe('M2 1h1v1h-1z');
    expect(paths.filter(Boolean)).toHaveLength(3);
    expect(densityPaths(new Uint8Array([255, 0, 255]), 3)[5]).toBe('M0 0h1v1h-1zM2 0h1v1h-1z');
    expect(densityPaths(new Uint8Array(4), 2).every(path => path === '')).toBe(true);
  });
});
