import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {describe, expect, it, jest} from '@jest/globals';
import {StyleSheet} from 'react-native';
import CameraHud from '../src/hud/CameraHud';
import {batteryText, EXPOSURE_STALE_MS, exposureReading, hudSafeBounds} from '../src/hud/readings';
import {CameraState} from '../src/native';
import {scopePanelLayout} from '../src/scopes/panelState';

const connected: CameraState = {active: true, busy: false, ready: true, demo: false, transport: 'usb', lut: null};
function hud(state: CameraState, motion = false, buffered = 3) {
  let tree: renderer.ReactTestRenderer;
  act(() => {tree = renderer.create(<CameraHud state={state} buffered={buffered} motion={motion} waiting={false} onTopLayout={jest.fn()} onBottomLayout={jest.fn()}/>);});
  return tree!;
}
const text = (tree: renderer.ReactTestRenderer, id: string) => tree.root.findByProps({testID: id}).props.children;

describe('truthful four-corner camera HUD', () => {
  it('renders the existing USB exposure, real phone battery, unavailable camera battery and LUT without scopes', () => {
    const tree = hud({...connected, exposure: 'ISO AUTO     f/4.0     1/80', exposureAgeMs: 10, phoneBattery: {percent: 37, charging: true}, lut: 'Fuji 风格 · Classic Chrome'});
    expect(text(tree, 'hud-aperture')).toBe('f/4.0');expect(text(tree, 'hud-shutter')).toBe('1/80');expect(text(tree, 'hud-iso')).toBe('ISO AUTO');
    expect(tree.root.findByProps({accessibilityLabel: '手机电量37%，充电中'})).toBeTruthy();
    expect(tree.root.findByProps({accessibilityLabel: '相机电量不可用，当前连接未提供机身电量'})).toBeTruthy();
    const json = JSON.stringify(tree.toJSON());
    expect(json).toContain('USB · 已连接');expect(json).toContain('Classic Chrome');expect(json).toContain('可拍');expect(json).not.toContain('scopes-overlay');
    for (const id of ['hud-source', 'hud-batteries', 'hud-exposure', 'hud-capture']) expect(tree.root.findByProps({testID: id})).toBeTruthy();
    expect(StyleSheet.flatten(tree.root.findByProps({testID: 'hud-top'}).props.style).zIndex).toBe(1000);
    act(() => tree.unmount());
  });
  it.each([
    ['ISO 800', 'ISO 800', 'f/—', '快门 —'],
    ['f/5.6     快门 1/250', 'ISO —', 'f/5.6', '1/250'],
    ['ISO AUTO     f/2.0     0.8s', 'ISO AUTO', 'f/2.0', '0.8s'],
    ['ISO 100     f/8.0     BULB', 'ISO 100', 'f/8.0', 'BULB'],
  ])('preserves partial / auto / long exposure readings: %s', (exposure, iso, aperture, shutter) => {
    const tree = hud({...connected, exposure});
    expect(text(tree, 'hud-iso')).toBe(iso);expect(text(tree, 'hud-aperture')).toBe(aperture);expect(text(tree, 'hud-shutter')).toBe(shutter);
    act(() => tree.unmount());
  });
  it('preserves unrecognized Wi-Fi encodings and camera messages verbatim, with explicit field placeholders', () => {
    for (const raw of ['ISO 800     f/1024/256     快门 256/65400', 'f/400     快门 256/65400', 'f/28', '曝光参数暂不可读 · 可用机身调整', 'ISO 100 F4 1/60']) {
      const tree = hud({...connected, transport: 'wifi', exposure: raw, exposureAgeMs: 0});
      const json = JSON.stringify(tree.toJSON());
      expect(text(tree, 'hud-aperture')).toBe('f/—');
      expect(text(tree, 'hud-shutter')).toBe('快门 —');
      expect(json).toContain('未经真机验证');
      expect(text(tree, 'hud-exposure-detail')).toBe(raw.split(/\s{2,}/).filter(part => !/^ISO (?:[1-9]\d*|AUTO)$/.test(part)).join(' · '));
      act(() => tree.unmount());
    }
  });
  it('labels aged / unknown-age readings, and discards previous real-camera values in demo or disconnected states', () => {
    const exposure = 'ISO 640     f/2.8     1/125';
    expect(exposureReading({...connected, exposure, exposureAgeMs: EXPOSURE_STALE_MS}).label).not.toContain('已过期');
    expect(exposureReading({...connected, exposure, exposureAgeMs: EXPOSURE_STALE_MS + 1}).label).toContain('已过期');
    expect(exposureReading({...connected, exposure}).label).toContain('最近读数');
    for (const state of [{...connected, exposure, demo: true}, {...connected, exposure, active: false}]) {
      const tree = hud(state, true);
      expect(text(tree, 'hud-aperture')).toBe('f/—');expect(text(tree, 'hud-iso')).toBe('ISO —');
      expect(JSON.stringify(tree.toJSON())).not.toContain('640');
      act(() => tree.unmount());
    }
  });
  it('uses explicit placeholders for unavailable / invalid batteries and keeps a real zero percent', () => {
    for (const percent of [null, -1, 101, NaN, Infinity]) expect(batteryText({percent})).toBe('—');
    expect(batteryText()).toBe('—');expect(batteryText({percent: 0})).toBe('0%');
    const tree = hud({...connected, phoneBattery: {percent: 0}, cameraBattery: {percent: 45}});
    expect(tree.root.findByProps({accessibilityLabel: '手机电量0%'})).toBeTruthy();
    expect(tree.root.findByProps({accessibilityLabel: '相机电量45%'})).toBeTruthy();
    act(() => tree.unmount());
  });
  it('shows capture processing and motion-buffer status without inventing exposure or invalid buffer durations', () => {
    const tree = hud({...connected, busy: true}, true, NaN);
    expect(JSON.stringify(tree.toJSON())).toContain('处理中…');expect(JSON.stringify(tree.toJSON())).not.toContain('NaN');
    act(() => tree.unmount());
    const motion = hud(connected, true, 4.5);
    expect(JSON.stringify(motion.toJSON())).toContain('缓存就绪');expect(JSON.stringify(motion.toJSON())).toContain('3.0');
    act(() => motion.unmount());
  });
  it('keeps compact, enlarged and dragged charts inside measured HUD space in portrait, landscape and font 1.3', () => {
    for (const [width, height, top, bottom] of [[360, 540, 52, 52], [600, 360, 52, 52], [360, 540, 72, 88], [480, 320, 72, 88]]) {
      const bounds = hudSafeBounds({width, height}, top, bottom);
      for (const size of ['S', 'M'] as const) for (const slot of [0, 1, 2, 3, undefined]) {
        const panel = scopePanelLayout(bounds, {x: 1, y: 1}, size, slot);
        expect(panel.x).toBeGreaterThanOrEqual(bounds.insets!.left);expect(panel.x + panel.width).toBeLessThanOrEqual(width - bounds.insets!.right);
        expect(panel.y).toBeGreaterThanOrEqual(bounds.insets!.top);expect(panel.y + panel.height).toBeLessThanOrEqual(height - bounds.insets!.bottom);
      }
    }
  });
});
