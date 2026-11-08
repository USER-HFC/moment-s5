import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {jest, expect, it} from '@jest/globals';
import {Animated, AppState, Modal, StyleSheet, View} from 'react-native';
import {ui} from '../src/theme';

jest.mock('react-native-video', () => {
  const React = require('react');
  const {View} = require('react-native');
  const seek = jest.fn();
  const Component = React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({seek}));
    return <View {...props} testID="motion-video" />;
  });
  Component.seekMock = seek;
  return Component;
});

import MotionAlbum from '../src/MotionAlbum';
import Video from 'react-native-video';
import * as GestureHandler from 'react-native-gesture-handler';

const moments = [{
  id: 'M1', source: 'S5.JPG', createdAt: 1700000000000, complete: true,
  imageUri: 'content://moment/image', originalUri: 'content://moment/original', videoUri: 'content://moment/video',
}] as any;
const exportMock = async (_id: string) => {};
const gestures = () => (GestureHandler as any).__gestures as {kind: string; numberOfTaps?: number; onBegin?: () => void; onStart?: () => void; onUpdate?: (event: any) => void; onEnd?: (event: any, success?: boolean) => void}[];
const latest = (kind: string) => [...gestures()].reverse().find((gesture) => gesture.kind === kind);
const dismissGesture = () => {
  const pans = gestures().filter((gesture) => gesture.kind === 'pan');
  return pans[pans.length - 2];
};
const singleTap = () => [...gestures()].reverse().find((gesture) => gesture.kind === 'tap' && !gesture.numberOfTaps)!;

function open(tree: renderer.ReactTestRenderer, id = 'M1') {
  act(() => tree.root.findByProps({testID: `album-cell-${id}`}).props.onPress());
}

it('keeps Wi-Fi capture provenance visible in the album after disconnection', () => {
  const tree = renderer.create(<MotionAlbum moments={[{...moments[0], experimentalWifi: true}]} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock}/>);
  expect(tree.root.findByProps({testID: 'experimental-wifi-badge'})).toBeTruthy();
  expect(tree.root.findAllByProps({testID: 'motion-viewer'})).toHaveLength(0);
  act(() => tree.update(<MotionAlbum moments={moments} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock}/>));
  expect(tree.root.findAllByProps({testID: 'experimental-wifi-badge'})).toHaveLength(0);
  act(() => tree.unmount());
});

it('opens the viewer on the requested photo once that photo is loaded', () => {
  const photos = [moments[0], {...moments[0], id: 'M2', source: 'T2.JPG', imageUri: 'content://moment/image2', captureMode: 'photo' as const, videoUri: undefined}];
  const onHandled = jest.fn();
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<MotionAlbum moments={[]} initialMomentId="M2" onInitialMomentHandled={onHandled} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock}/>); });
  expect(tree!.root.findAllByProps({testID: 'motion-viewer'})).toHaveLength(0);
  expect(onHandled).not.toHaveBeenCalled();
  act(() => tree!.update(<MotionAlbum moments={photos} initialMomentId="M2" onInitialMomentHandled={onHandled} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock}/>));
  expect(tree!.root.findByProps({testID: 'album-photo'}).props.source.uri).toBe('content://moment/image2');
  expect(onHandled).toHaveBeenCalledTimes(1);
  act(() => tree!.unmount());
});

it('opens a photo from the grid and swipes to the next one', () => {
  const photos = [moments[0], {...moments[0], id: 'M2', source: 'T2.JPG', imageUri: 'content://moment/image2', captureMode: 'photo', videoUri: undefined}];
  const tree = renderer.create(<MotionAlbum moments={photos} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock}/>);
  expect(tree.root.findByProps({testID: 'album-grid'})).toBeTruthy();
  expect(tree.root.findAllByProps({testID: 'motion-viewer'})).toHaveLength(0);
  open(tree);
  expect(tree.root.findByProps({testID: 'album-index'}).props.children).toBe('1 / 2');
  const pan = latest('pan')!;
  act(() => { pan.onBegin?.(); pan.onUpdate?.({translationX: -30, translationY: 0}); pan.onEnd?.({translationX: -30, translationY: 0}); });
  expect(tree.root.findByProps({testID: 'album-index'}).props.children).toBe('1 / 2');
  act(() => { pan.onBegin?.(); pan.onUpdate?.({translationX: -220, translationY: 0}); pan.onEnd?.({translationX: -220, translationY: 0}); });
  expect(tree.root.findByProps({testID: 'album-index'}).props.children).toBe('2 / 2');
  expect(tree.root.findByProps({testID: 'album-photo'}).props.source.uri).toBe('content://moment/image2');
  act(() => tree.unmount());
});

it('toggles the immersive chrome with a single tap', () => {
  const tree = renderer.create(<MotionAlbum moments={moments} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock}/>);
  open(tree);
  const top = () => tree.root.findByProps({testID: 'album-top-bar'});
  expect(top().props.accessibilityElementsHidden).toBe(false);
  act(() => singleTap().onEnd?.({}, true));
  expect(top().props.accessibilityElementsHidden).toBe(true);
  expect(tree.root.findByProps({testID: 'album-bottom-bar'}).props.pointerEvents).toBe('none');
  act(() => singleTap().onEnd?.({}, true));
  expect(top().props.accessibilityElementsHidden).toBe(false);
  act(() => tree.unmount());
});

it('zooms and restores on a double tap', () => {
  const tree = renderer.create(<MotionAlbum moments={moments} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock}/>);
  open(tree);
  const double = [...gestures()].reverse().find((gesture) => gesture.kind === 'tap' && gesture.numberOfTaps === 2)!;
  expect(tree.root.findByProps({testID: 'album-pager'}).props.accessibilityState.selected).toBe(false);
  act(() => double.onEnd?.({}, true));
  expect(tree.root.findByProps({testID: 'album-pager'}).props.accessibilityState.selected).toBe(true);
  act(() => double.onEnd?.({}, true));
  expect(tree.root.findByProps({testID: 'album-pager'}).props.accessibilityState.selected).toBe(false);
  act(() => tree.unmount());
});

it('titles the viewer with the capture time and a deduplicated summary', () => {
  const now = new Date(2026, 9, 25, 18, 0).getTime();
  const spy = jest.spyOn(Date, 'now').mockReturnValue(now);
  try {
    const photo = {...moments[0], demo: true, transport: 'demo', lut: 'Velvia', createdAt: new Date(2026, 9, 25, 16, 22).getTime()};
    const tree = renderer.create(<MotionAlbum moments={[photo]} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock}/>);
    open(tree);
    expect(tree.root.findByProps({testID: 'album-title'}).props.children).toBe('今天 16:22');
    expect(tree.root.findByProps({testID: 'album-subtitle'}).props.children).toBe('演示 · Velvia');
    expect(JSON.stringify(tree.toJSON())).not.toContain('演示 · 演示');
    act(() => tree.unmount());
  } finally {
    spy.mockRestore();
  }
});

it('does not change photos while the current one is zoomed', () => {
  const photos = [moments[0], {...moments[0], id: 'M2', source: 'T2.JPG'}];
  const tree = renderer.create(<MotionAlbum moments={photos} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock}/>);
  open(tree);
  const pinch = latest('pinch')!;
  act(() => { pinch.onBegin?.(); pinch.onUpdate?.({scale: 2}); });
  expect(tree.root.findByProps({testID: 'album-pager'}).props.accessibilityState.selected).toBe(true);
  const pan = latest('pan')!;
  act(() => { pan.onBegin?.(); pan.onUpdate?.({translationX: -220, translationY: 0}); pan.onEnd?.({translationX: -220, translationY: 0}); });
  expect(tree.root.findByProps({testID: 'album-index'}).props.children).toBe('1 / 2');
  const release = latest('pinch')!;
  act(() => { release.onBegin?.(); release.onUpdate?.({scale: 0.2}); release.onEnd?.({}); });
  const swipe = latest('pan')!;
  act(() => { swipe.onEnd?.({translationX: -220, translationY: 0}); });
  expect(tree.root.findByProps({testID: 'album-index'}).props.children).toBe('2 / 2');
  act(() => tree.unmount());
});

it('never puts raw text in native View children', () => {
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<MotionAlbum moments={moments} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock}/>); });
  const raw = () => tree.root.findAllByType(View).flatMap((node) => React.Children.toArray(node.props.children)).filter((child) => typeof child === 'string');
  expect(raw()).toEqual([]);
  open(tree!);
  expect(raw()).toEqual([]);
  act(() => tree!.unmount());
});

it('plays a motion photo from the button and waits for the first frame before fading', () => {
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<MotionAlbum moments={moments} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock}/>); });
  open(tree!);
  const timing = jest.spyOn(Animated, 'timing');
  act(() => tree!.root.findByProps({accessibilityLabel: '播放动态照片'}).props.onPress());
  act(() => tree!.root.findByProps({testID: 'motion-video'}).props.onLoad());
  expect(timing).not.toHaveBeenCalled();
  expect(tree!.root.findByProps({testID: 'motion-video'}).props.paused).toBe(false);
  act(() => tree!.root.findByProps({testID: 'motion-video'}).props.onReadyForDisplay());
  expect(timing).toHaveBeenCalledTimes(2);
  act(() => tree!.root.findByProps({accessibilityLabel: '停止播放'}).props.onPress());
  expect(tree!.root.findByProps({testID: 'motion-video'}).props.paused).toBe(true);
  act(() => tree!.unmount()); timing.mockRestore();
});

it('plays a motion photo from the LIVE badge', () => {
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<MotionAlbum moments={moments} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock}/>); });
  open(tree!);
  const timing = jest.spyOn(Animated, 'timing');
  act(() => tree!.root.findByProps({testID: 'album-live-badge'}).props.onPress());
  act(() => tree!.root.findByProps({testID: 'motion-video'}).props.onReadyForDisplay());
  expect(timing).toHaveBeenCalledTimes(2);
  expect(tree!.root.findByProps({accessibilityLabel: '停止播放'})).toBeTruthy();
  act(() => tree!.unmount()); timing.mockRestore();
});

it('resets playback after leaving the viewer', () => {
  const seek = (Video as any).seekMock;
  seek.mockClear();
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<MotionAlbum moments={moments} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock}/>); });
  open(tree!);
  act(() => tree!.root.findByProps({testID: 'motion-video'}).props.onLoad());
  act(() => tree!.root.findByProps({testID: 'motion-video'}).props.onReadyForDisplay());
  act(() => tree!.root.findByProps({accessibilityLabel: '播放动态照片'}).props.onPress());
  expect(seek).toHaveBeenCalledTimes(1);
  act(() => tree!.root.findByProps({accessibilityLabel: '返回网格'}).props.onPress());
  expect(tree!.root.findAllByProps({testID: 'motion-video'})).toHaveLength(0);
  open(tree!);
  expect(tree!.root.findByProps({testID: 'motion-video'}).props.paused).toBe(true);
  act(() => tree!.root.findByProps({accessibilityLabel: '播放动态照片'}).props.onPress());
  expect(seek).toHaveBeenCalledTimes(1);
  act(() => tree!.root.findByProps({testID: 'motion-video'}).props.onLoad());
  expect(seek).toHaveBeenCalledTimes(2);
  act(() => tree!.unmount());
});

it('can delete a failed app-private record while export stays unavailable', () => {
  const failed = [{...moments[0], complete: false, error: '接收失败'}];
  const remove = jest.fn(async (_id: string) => {});
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<MotionAlbum moments={failed} onBack={jest.fn()} onExport={exportMock} onDelete={remove}/>); });
  open(tree!);
  expect(tree!.root.findAllByProps({accessibilityLabel: '导出到系统相册'})).toHaveLength(0);
  expect(tree!.root.findAllByProps({accessibilityLabel: '导出原片到系统相册'})).toHaveLength(0);
  act(() => tree!.root.findByProps({accessibilityLabel: '删除照片'}).props.onPress());
  const dialog = tree!.root.findAllByProps({testID: 'confirm-dialog'}).find(node => node.props.accessibilityViewIsModal);
  expect(dialog).toBeTruthy();
  expect(tree!.root.findByProps({accessibilityRole: 'header', accessibilityLabel: '删除这张照片？'})).toBeTruthy();
  expect(tree!.root.findByProps({testID: 'album-screen'}).props.importantForAccessibility).toBe('no-hide-descendants');
  expect(tree!.root.findByProps({testID: 'album-screen'}).props.accessibilityElementsHidden).toBe(true);
  expect(StyleSheet.flatten(tree!.root.findByProps({testID: 'confirm-accept'}).props.style({pressed: false})).backgroundColor).toBe(ui.color.destructive);
  act(() => tree!.root.findByType(Modal).props.onRequestClose());
  expect(tree!.root.findAllByProps({testID: 'confirm-dialog'})).toHaveLength(0);
  expect(remove).not.toHaveBeenCalled();
  act(() => tree!.root.findByProps({accessibilityLabel: '删除照片'}).props.onPress());
  act(() => tree!.root.findByProps({testID: 'confirm-accept'}).props.onPress());
  expect(remove).not.toHaveBeenCalled();
  expect(JSON.stringify(tree!.toJSON())).toContain('已删除 1 张');
  act(() => tree!.unmount());
  expect(remove).toHaveBeenCalledWith('M1', true);
});

it.each([null, 'Classic Chrome'])('shows and exports a static photo without LIVE or a video: %s', async (lut) => {
  const onExport = jest.fn(async (_id: string) => {});
  const photo = {...moments[0], captureMode: 'photo' as const, lut, videoUri: undefined};
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<MotionAlbum moments={[photo]} onBack={jest.fn()} onExport={onExport} onDelete={exportMock}/>); });
  expect(JSON.stringify(tree!.toJSON())).not.toContain('LIVE');
  open(tree!);
  expect(tree!.root.findAllByProps({testID: 'motion-video'})).toHaveLength(0);
  expect(JSON.stringify(tree!.toJSON())).not.toContain('LIVE');
  expect(JSON.stringify(tree!.toJSON())).not.toContain('长按播放');
  expect(JSON.stringify(tree!.toJSON())).not.toContain('已合成');
  await act(async () => { await tree!.root.findByProps({accessibilityLabel: '导出到系统相册'}).props.onPress(); });
  expect(onExport).toHaveBeenCalledWith('M1');
  act(() => tree!.unmount());
});

it('shows LUT failure honestly and offers the preserved original for a failed static photo', () => {
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<MotionAlbum moments={[{...moments[0], captureMode: 'photo', complete: false, error: 'LUT 处理失败，原片已保留', videoUri: undefined}]} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock}/>); });
  expect(JSON.stringify(tree!.toJSON())).toContain('LUT 处理失败，原片已保留');
  open(tree!);
  expect(tree!.root.findByProps({accessibilityLabel: '导出原片到系统相册'})).toBeTruthy();
  expect(tree!.root.findAllByProps({testID: 'motion-video'})).toHaveLength(0);
  act(() => tree!.unmount());
});

it('previews a LUT from the original and saves that choice', async () => {
  const luts = [{id: 'builtin:classic-chrome', name: 'Classic Chrome', size: 12, builtIn: true}];
  const onPreview = jest.fn(async (_id: string, lutId: string) => `file://preview-${lutId}`);
  const onRender = jest.fn(async () => {});
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<MotionAlbum moments={moments} luts={luts as any} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock} onPreview={onPreview} onRender={onRender}/>); });
  open(tree!);
  act(() => tree!.root.findByProps({accessibilityLabel: '更换 LUT'}).props.onPress());
  await act(async () => { await tree!.root.findByProps({accessibilityLabel: '选择 LUT Classic Chrome'}).props.onPress(); });
  expect(onPreview).toHaveBeenCalledWith('M1', 'builtin:classic-chrome');
  expect(tree!.root.findByProps({testID: 'album-photo'}).props.source.uri).toBe('file://preview-builtin:classic-chrome');
  await act(async () => { await tree!.root.findByProps({accessibilityLabel: '保存 LUT'}).props.onPress(); });
  expect(onRender).toHaveBeenCalledWith('M1', 'builtin:classic-chrome');
  act(() => tree!.unmount());
});

it('fills the LUT filmstrip with photo thumbnails from the background cache', async () => {
  const luts = [{id: 'builtin:classic-chrome', name: 'Classic Chrome', size: 12, builtIn: true}];
  const onThumbnail = jest.fn(async (_id: string, lutId: string) => `file://thumb-${lutId}`);
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<MotionAlbum moments={moments} luts={luts as any} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock} onThumbnail={onThumbnail}/>); });
  open(tree!);
  act(() => tree!.root.findByProps({accessibilityLabel: '更换 LUT'}).props.onPress());
  await act(async () => {});
  expect(onThumbnail).toHaveBeenCalledWith('M1', 'builtin:classic-chrome');
  expect(tree!.root.findByProps({testID: 'lut-thumb-builtin:classic-chrome'}).props.source.uri).toBe('file://thumb-builtin:classic-chrome');
  act(() => tree!.unmount());
});

it('cancels the LUT filmstrip without saving', async () => {
  const luts = [{id: 'builtin:classic-chrome', name: 'Classic Chrome', size: 12, builtIn: true}];
  const onPreview = jest.fn(async (_id: string, lutId: string) => `file://preview-${lutId}`);
  const onRender = jest.fn(async () => {});
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<MotionAlbum moments={moments} luts={luts as any} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock} onPreview={onPreview} onRender={onRender}/>); });
  open(tree!);
  act(() => tree!.root.findByProps({accessibilityLabel: '更换 LUT'}).props.onPress());
  await act(async () => { await tree!.root.findByProps({accessibilityLabel: '选择 LUT Classic Chrome'}).props.onPress(); });
  expect(tree!.root.findByProps({testID: 'album-photo'}).props.source.uri).toBe('file://preview-builtin:classic-chrome');
  act(() => tree!.root.findByProps({accessibilityLabel: '取消更换 LUT'}).props.onPress());
  expect(onRender).not.toHaveBeenCalled();
  expect(tree!.root.findAllByProps({testID: 'album-lut-sheet'})).toHaveLength(0);
  expect(tree!.root.findByProps({testID: 'album-photo'}).props.source.uri).toBe('content://moment/image');
  act(() => tree!.unmount());
});

it('ignores a stale LUT preview', async () => {
  const luts = [
    {id: 'builtin:classic-chrome', name: 'Classic Chrome', size: 12, builtIn: true},
    {id: 'builtin:eterna', name: 'Eterna', size: 12, builtIn: true},
  ];
  let finishFirst: (uri: string) => void = () => {};
  const onPreview = jest.fn()
    .mockImplementationOnce(() => new Promise<string>((resolve) => { finishFirst = resolve; }))
    .mockImplementationOnce(async () => 'file://second');
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<MotionAlbum moments={moments} luts={luts as any} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock} onPreview={onPreview as (id: string, lutId: string) => Promise<string | null>} onRender={async () => {}}/>); });
  open(tree!);
  act(() => tree!.root.findByProps({accessibilityLabel: '更换 LUT'}).props.onPress());
  act(() => { void tree!.root.findByProps({accessibilityLabel: '选择 LUT Classic Chrome'}).props.onPress(); });
  await act(async () => { await tree!.root.findByProps({accessibilityLabel: '选择 LUT Eterna'}).props.onPress(); });
  await act(async () => { finishFirst('file://first'); });
  expect(tree!.root.findByProps({testID: 'album-photo'}).props.source.uri).toBe('file://second');
  act(() => tree!.unmount());
});

it('shows where the photo lives and how it was captured', async () => {
  const onDetails = jest.fn(async () => ({
    origin: '机身快门同步', transport: 'USB', cameraFile: 'P1000123.JPG', capturedAt: new Date(2024, 0, 2, 3, 4, 5).getTime(),
    camera: 'Panasonic DC-S5', lens: 'LUMIX S 50/1.8', iso: 'ISO 400', shutter: '1/125', aperture: 'f/1.8', focalLength: '50 mm',
    width: 6000, height: 4000, lut: 'Classic Chrome', lutApplied: true, directory: '/data/user/0/cn.moment.lumix/files/moments/M1',
    files: [{name: 'original.jpg', bytes: 2048}, {name: 'rendered.jpg', bytes: 4096}],
    exportKnown: true, exported: true, exportPath: 'DCIM/MomentS5/M1.jpg',
  }));
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<MotionAlbum moments={[{...moments[0], cameraTriggered: true, transport: 'usb'}]} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock} onDetails={onDetails}/>); });
  open(tree!);
  await act(async () => { tree!.root.findByProps({accessibilityLabel: '照片信息'}).props.onPress(); });
  expect(onDetails).toHaveBeenCalledWith('M1');
  const text = JSON.stringify(tree!.toJSON());
  for (const part of ['DC-S5 · LUMIX S 50/1.8', 'ISO', '400', '1/125', 'f/1.8', '50 mm', '6000 × 4000', '6.0 KB', 'Classic Chrome', '…/moments/M1', '已导出', 'DCIM/MomentS5/M1.jpg', 'P1000123.JPG', '复制路径']) {
    expect(text).toContain(part);
  }
  expect(tree!.root.findByProps({testID: 'info-params'})).toBeTruthy();
  act(() => tree!.unmount());
});

it('shows a single no-EXIF line instead of a column of dashes', async () => {
  const onDetails = jest.fn(async () => ({
    origin: '演示', transport: '演示', cameraFile: null, capturedAt: 1700000000000,
    camera: null, lens: null, iso: null, shutter: null, aperture: null, focalLength: null,
    width: 2400, height: 1600, lut: null, lutApplied: false, directory: '/data/user/0/cn.moment.lumix/files/moments/M1',
    files: [{name: 'original.jpg', bytes: 2048}],
    exportKnown: false, exported: false, exportPath: null,
  }));
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<MotionAlbum moments={[{...moments[0], demo: true, transport: 'demo'}]} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock} onDetails={onDetails}/>); });
  open(tree!);
  await act(async () => { tree!.root.findByProps({accessibilityLabel: '照片信息'}).props.onPress(); });
  const text = JSON.stringify(tree!.toJSON());
  expect(text).toContain('这张照片没有拍摄参数（EXIF）');
  expect(text.indexOf('拍摄参数')).toBeLessThan(text.indexOf('这张照片没有拍摄参数（EXIF）'));
  expect(StyleSheet.flatten(tree!.root.findByProps({testID: 'info-no-exif'}).props.style).color).toBe(ui.color.muted);
  expect(text).not.toContain('—');
  expect(tree!.root.findAllByProps({testID: 'info-params'})).toHaveLength(0);
  expect(text).not.toContain('焦距');
  act(() => tree!.unmount());
});

it('shows the original while the photo is held in the LUT sheet', async () => {
  const luts = [{id: 'builtin:classic-chrome', name: 'Classic Chrome', size: 12, builtIn: true}];
  const onPreview = jest.fn(async (_id: string, lutId: string) => `file://preview-${lutId}`);
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<MotionAlbum moments={moments} luts={luts as any} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock} onPreview={onPreview} onRender={async () => {}}/>); });
  open(tree!);
  act(() => tree!.root.findByProps({accessibilityLabel: '更换 LUT'}).props.onPress());
  expect(JSON.stringify(tree!.toJSON())).toContain('按住照片可对比原片。动态照片的封面也会换成新风格');
  expect(JSON.stringify(tree!.toJSON())).not.toContain('实况');
  await act(async () => { await tree!.root.findByProps({accessibilityLabel: '选择 LUT Classic Chrome'}).props.onPress(); });
  expect(tree!.root.findByProps({testID: 'album-photo'}).props.source.uri).toBe('file://preview-builtin:classic-chrome');
  const hold = latest('longPress')!;
  act(() => hold.onStart?.());
  expect(tree!.root.findByProps({testID: 'album-photo'}).props.source.uri).toBe('content://moment/original');
  act(() => hold.onEnd?.({}));
  expect(tree!.root.findByProps({testID: 'album-photo'}).props.source.uri).toBe('file://preview-builtin:classic-chrome');
  act(() => tree!.unmount());
});

it('shares from an in-app sheet that lists every file, including the motion photo', () => {
  const onShare = jest.fn(async () => {});
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<MotionAlbum moments={moments} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock} onShare={onShare}/>); });
  open(tree!);
  act(() => tree!.root.findByProps({accessibilityLabel: '分享动态照片'}).props.onPress());
  const sheet = JSON.stringify(tree!.toJSON());
  for (const label of ['动态照片', '动态视频', '原片', '当前画面', '取消']) expect(sheet).toContain(label);
  expect(tree!.root.findByProps({testID: 'album-share-motion'})).toBeTruthy();
  expect(tree!.root.findByProps({testID: 'album-share-video'})).toBeTruthy();
  expect(tree!.root.findByProps({testID: 'album-share-original'})).toBeTruthy();
  expect(tree!.root.findByProps({testID: 'album-share-display'})).toBeTruthy();
  act(() => tree!.root.findByProps({testID: 'album-share-original'}).props.onPress());
  expect(onShare).toHaveBeenCalledWith('M1', 'original');
  expect(tree!.root.findAllByProps({testID: 'album-share-sheet'})).toHaveLength(0);
  act(() => tree!.unmount());
});

it('hides share rows whose files are missing', () => {
  const still = {...moments[0], source: 'STILL.JPG', captureMode: 'photo' as const, videoUri: undefined, lut: 'Velvia'};
  const bare = {...moments[0], id: 'BARE', source: 'BARE.JPG', captureMode: 'photo' as const, videoUri: undefined, originalUri: undefined, lut: undefined};
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<MotionAlbum moments={[still, bare]} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock} onShare={async () => {}}/>); });
  open(tree!, 'M1');
  act(() => tree!.root.findByProps({accessibilityLabel: '分享照片'}).props.onPress());
  expect(tree!.root.findAllByProps({testID: 'album-share-motion'})).toHaveLength(0);
  expect(tree!.root.findAllByProps({testID: 'album-share-video'})).toHaveLength(0);
  expect(JSON.stringify(tree!.toJSON())).toContain('带 LUT 的画面');
  act(() => tree!.root.findByProps({accessibilityLabel: '取消'}).props.onPress());
  act(() => tree!.root.findByProps({testID: 'album-cell-BARE'}).props.onPress());
  act(() => tree!.root.findByProps({accessibilityLabel: '分享照片'}).props.onPress());
  expect(tree!.root.findAllByProps({testID: 'album-share-original'})).toHaveLength(0);
  expect(tree!.root.findByProps({testID: 'album-share-display'})).toBeTruthy();
  expect(JSON.stringify(tree!.toJSON())).toContain('正在查看的画面');
  act(() => tree!.unmount());
});

it('filters the grid and shows an empty state for the active filter', () => {
  const photos = [
    moments[0],
    {...moments[0], id: 'STILL', source: 'STILL.JPG', captureMode: 'photo' as const, videoUri: undefined},
    {...moments[0], id: 'BODY', source: 'BODY.JPG', captureMode: 'photo' as const, videoUri: undefined, cameraTriggered: true, demo: false},
  ];
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<MotionAlbum moments={photos} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock}/>); });
  expect(tree!.root.findByProps({testID: 'album-filter-all'}).props.accessibilityLabel).toBe('全部 3');
  expect(tree!.root.findByProps({testID: 'album-filter-photo'}).props.accessibilityLabel).toBe('照片 2');
  expect(tree!.root.findByProps({testID: 'album-filter-motion'}).props.accessibilityLabel).toBe('动态 1');
  expect(tree!.root.findByProps({testID: 'album-filter-camera'}).props.accessibilityLabel).toBe('机身同步 1');
  act(() => tree!.root.findByProps({testID: 'album-filter-photo'}).props.onPress());
  expect(tree!.root.findAllByProps({testID: 'album-cell-M1'})).toHaveLength(0);
  expect(tree!.root.findByProps({testID: 'album-cell-STILL'})).toBeTruthy();
  expect(tree!.root.findByProps({testID: 'album-cell-BODY'})).toBeTruthy();
  act(() => tree!.root.findByProps({testID: 'album-filter-motion'}).props.onPress());
  expect(tree!.root.findByProps({testID: 'album-cell-M1'})).toBeTruthy();
  expect(tree!.root.findAllByProps({testID: 'album-cell-STILL'})).toHaveLength(0);
  act(() => tree!.root.findByProps({testID: 'album-filter-camera'}).props.onPress());
  expect(tree!.root.findByProps({testID: 'album-cell-BODY'})).toBeTruthy();
  expect(tree!.root.findAllByProps({testID: 'album-cell-STILL'})).toHaveLength(0);
  act(() => tree!.root.findByProps({testID: 'album-filter-photo'}).props.onPress());
  act(() => tree!.update(<MotionAlbum moments={[moments[0]]} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock}/>));
  expect(tree!.root.findByProps({testID: 'album-empty'})).toBeTruthy();
  expect(JSON.stringify(tree!.toJSON())).toContain('没有照片');
  expect(tree!.root.findAllByProps({testID: 'album-grid'})).toHaveLength(0);
  act(() => tree!.unmount());
});

it('selects photos from a long press and reports batch export and delete', async () => {
  const photos = [moments[0], {...moments[0], id: 'M2', source: 'T2.JPG', imageUri: 'content://moment/image2'}];
  const onExport = jest.fn(async (id: string) => { if (id === 'M2') throw new Error('导出失败'); });
  const onDelete = jest.fn(async () => {});
  const onNotice = jest.fn();
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<MotionAlbum moments={photos} onBack={jest.fn()} onExport={onExport} onDelete={onDelete} onNotice={onNotice}/>); });
  expect(tree!.root.findAllByProps({testID: 'album-select-bar'})).toHaveLength(0);
  act(() => tree!.root.findByProps({testID: 'album-cell-M1'}).props.onLongPress());
  expect(tree!.root.findByProps({testID: 'album-selected-count'}).props.children).toBe('已选 1');
  expect(tree!.root.findByProps({testID: 'album-cell-M1'}).props.accessibilityState.selected).toBe(true);
  expect(tree!.root.findByProps({testID: 'album-cell-M1'}).props.accessibilityLabel.startsWith('选择')).toBe(true);
  act(() => tree!.root.findByProps({testID: 'album-cell-M2'}).props.onPress());
  expect(tree!.root.findByProps({testID: 'album-selected-count'}).props.children).toBe('已选 2');
  expect(tree!.root.findByProps({accessibilityLabel: '取消全选'})).toBeTruthy();
  await act(async () => { await tree!.root.findByProps({accessibilityLabel: '批量导出'}).props.onPress(); });
  expect(onExport).toHaveBeenCalledWith('M1', true);
  expect(onExport).toHaveBeenCalledWith('M2', true);
  expect(onNotice).toHaveBeenCalledWith('已导出 1 张，1 张失败');
  expect(tree!.root.findAllByProps({testID: 'album-select-bar'})).toHaveLength(0);
  act(() => tree!.root.findByProps({testID: 'album-cell-M1'}).props.onLongPress());
  act(() => tree!.root.findByProps({accessibilityLabel: '全选'}).props.onPress());
  act(() => tree!.root.findByProps({accessibilityLabel: '批量删除'}).props.onPress());
  expect(JSON.stringify(tree!.toJSON())).toContain('删除 2 张照片？');
  expect(JSON.stringify(tree!.toJSON())).toContain('只删除 App 内副本，机身 SD 卡和系统相册里的照片不受影响。');
  act(() => tree!.root.findByProps({testID: 'confirm-accept'}).props.onPress());
  expect(onDelete).not.toHaveBeenCalled();
  expect(tree!.root.findAllByProps({testID: 'album-cell-M1'})).toHaveLength(0);
  expect(tree!.root.findAllByProps({testID: 'album-cell-M2'})).toHaveLength(0);
  expect(JSON.stringify(tree!.toJSON())).toContain('已删除 2 张');
  act(() => tree!.root.findByProps({accessibilityLabel: '撤销'}).props.onPress());
  expect(cellOrder(tree!)).toEqual(['album-cell-M1', 'album-cell-M2']);
  expect(onDelete).not.toHaveBeenCalled();
  act(() => tree!.unmount());
});

it('follows a downward drag and closes the viewer unless the photo is zoomed', () => {
  const photos = [moments[0], {...moments[0], id: 'M2', source: 'T2.JPG'}];
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<MotionAlbum moments={photos} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock}/>); });
  open(tree!);
  const moved = () => tree!.root.findByProps({testID: 'album-dismiss-layer'}).props.style[1].transform[0].translateY.__getValue();
  act(() => { dismissGesture().onUpdate?.({translationX: 0, translationY: 70, velocityY: 0}); });
  expect(moved()).toBe(70);
  act(() => { dismissGesture().onEnd?.({translationX: 0, translationY: 70, velocityY: 0}); });
  expect(tree!.root.findByProps({testID: 'album-index'}).props.children).toBe('1 / 2');
  const double = [...gestures()].reverse().find((gesture) => gesture.kind === 'tap' && gesture.numberOfTaps === 2)!;
  act(() => double.onEnd?.({}, true));
  act(() => { dismissGesture().onUpdate?.({translationX: 0, translationY: 240, velocityY: 0}); dismissGesture().onEnd?.({translationX: 0, translationY: 240, velocityY: 0}); });
  expect(tree!.root.findByProps({testID: 'motion-viewer'})).toBeTruthy();
  expect(moved()).not.toBe(240);
  act(() => double.onEnd?.({}, true));
  const parallel = jest.spyOn(Animated, 'parallel').mockImplementation(() => ({start: (callback?: (result: {finished: boolean}) => void) => { callback?.({finished: true}); }, stop: () => {}, reset: () => {}} as any));
  act(() => { dismissGesture().onUpdate?.({translationX: 0, translationY: 220, velocityY: 0}); dismissGesture().onEnd?.({translationX: 0, translationY: 220, velocityY: 0}); });
  expect(tree!.root.findAllByProps({testID: 'motion-viewer'})).toHaveLength(0);
  parallel.mockRestore();
  act(() => tree!.unmount());
});

it('names each thumbnail by kind and capture time, and hides the grid while the viewer is open', () => {
  const now = new Date(2026, 9, 25, 21, 0).getTime();
  // A frozen clock also freezes the sheet spring (it never sees time pass), so restore before opening one.
  const spy = jest.spyOn(Date, 'now').mockReturnValue(now);
  const photos = [
    {...moments[0], createdAt: new Date(2026, 9, 25, 20, 56).getTime()},
    {...moments[0], id: 'BODY', source: 'BODY.JPG', captureMode: 'photo' as const, videoUri: undefined, cameraTriggered: true, createdAt: new Date(2026, 9, 24, 18, 2).getTime()},
  ];
  const tree = renderer.create(<MotionAlbum moments={photos} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock}/>);
  expect(tree.root.findByProps({testID: 'album-grid-layer'}).props.importantForAccessibility).toBe('auto');
  expect(tree.root.findByProps({testID: 'album-cell-M1'}).props.accessibilityLabel).toBe('动态照片，今天 20:56');
  expect(tree.root.findByProps({testID: 'album-cell-BODY'}).props.accessibilityLabel).toBe('机身同步照片，昨天 18:02');
  spy.mockRestore();
  open(tree);
  expect(tree.root.findByProps({testID: 'motion-viewer'}).props.accessibilityViewIsModal).toBe(true);
  expect(tree.root.findByProps({testID: 'album-grid-layer'}).props.importantForAccessibility).toBe('no-hide-descendants');
  expect(tree.root.findByProps({testID: 'album-grid-layer'}).props.accessibilityElementsHidden).toBe(true);
  act(() => tree.root.findByProps({accessibilityLabel: '更换 LUT'}).props.onPress());
  expect(tree.root.findAllByProps({testID: 'album-lut-sheet'}).some(node => node.props.accessibilityViewIsModal === true)).toBe(true);
  expect(tree.root.findByProps({testID: 'album-viewer-body'}).props.importantForAccessibility).toBe('no-hide-descendants');
  act(() => tree.unmount());
});

it('disables LUT save until the choice differs from the saved one', async () => {
  const luts = [
    {id: 'builtin:classic-chrome', name: 'Classic Chrome', size: 12, builtIn: true},
    {id: 'builtin:eterna', name: 'Eterna', size: 12, builtIn: true},
  ];
  const onPreview = jest.fn(async () => 'file://preview');
  const onRender = jest.fn(async () => {});
  const photo = {...moments[0], lut: 'Classic Chrome', lutId: 'builtin:classic-chrome'};
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<MotionAlbum moments={[photo]} luts={luts as any} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock} onPreview={onPreview} onRender={onRender}/>); });
  open(tree!);
  act(() => tree!.root.findByProps({accessibilityLabel: '更换 LUT'}).props.onPress());
  const save = () => tree!.root.findByProps({testID: 'album-lut-save'});
  expect(save().props.disabled).toBe(true);
  expect(JSON.stringify(tree!.toJSON())).toContain('按住照片可对比原片。动态照片的封面也会换成新风格');
  expect(JSON.stringify(tree!.toJSON())).not.toContain('重新封装');
  await act(async () => { await tree!.root.findByProps({accessibilityLabel: '选择 LUT Classic Chrome'}).props.onPress(); });
  expect(save().props.disabled).toBe(true);
  await act(async () => { await save().props.onPress(); });
  expect(onRender).not.toHaveBeenCalled();
  await act(async () => { await tree!.root.findByProps({accessibilityLabel: '选择 LUT Eterna'}).props.onPress(); });
  expect(save().props.disabled).toBe(false);
  await act(async () => { await tree!.root.findByProps({accessibilityLabel: '选择 LUT Classic Chrome'}).props.onPress(); });
  expect(save().props.disabled).toBe(true);
  act(() => tree!.unmount());
});

const cellOrder = (tree: renderer.ReactTestRenderer) => {
  const seen = new Set<string>();
  const order: string[] = [];
  for (const node of tree.root.findAll(item => typeof item.props.testID === 'string' && String(item.props.testID).startsWith('album-cell-'))) {
    const id = String(node.props.testID);
    if (seen.has(id)) continue;
    seen.add(id);
    order.push(id);
  }
  return order;
};

it('restores a deleted photo to its place and only then deletes it', () => {
  jest.useFakeTimers();
  const photos = [moments[0], {...moments[0], id: 'M2', source: 'T2.JPG'}, {...moments[0], id: 'M3', source: 'T3.JPG'}];
  const onDelete = jest.fn(async () => {});
  let tree: renderer.ReactTestRenderer | undefined;
  try {
    act(() => { tree = renderer.create(<MotionAlbum moments={photos} onBack={jest.fn()} onExport={exportMock} onDelete={onDelete}/>); });
    act(() => tree!.root.findByProps({testID: 'album-cell-M2'}).props.onLongPress());
    act(() => tree!.root.findByProps({accessibilityLabel: '批量删除'}).props.onPress());
    act(() => tree!.root.findByProps({testID: 'confirm-accept'}).props.onPress());
    expect(cellOrder(tree!)).toEqual(['album-cell-M1', 'album-cell-M3']);
    act(() => tree!.root.findByProps({accessibilityLabel: '撤销'}).props.onPress());
    expect(cellOrder(tree!)).toEqual(['album-cell-M1', 'album-cell-M2', 'album-cell-M3']);
    act(() => { jest.advanceTimersByTime(5000); });
    expect(onDelete).not.toHaveBeenCalled();
    act(() => tree!.root.findByProps({testID: 'album-cell-M2'}).props.onLongPress());
    act(() => tree!.root.findByProps({accessibilityLabel: '批量删除'}).props.onPress());
    act(() => tree!.root.findByProps({testID: 'confirm-accept'}).props.onPress());
    act(() => { jest.advanceTimersByTime(4999); });
    expect(onDelete).not.toHaveBeenCalled();
    act(() => { jest.advanceTimersByTime(1); });
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledWith('M2', true);
  } finally {
    if (tree) act(() => tree!.unmount());
    jest.clearAllTimers();
    jest.useRealTimers();
  }
});

it('commits a pending delete as soon as the app leaves the foreground', () => {
  jest.useFakeTimers();
  let changed: (next: string) => void = () => {};
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, handler) => {
    changed = handler as (next: string) => void;
    return {remove: jest.fn()};
  });
  const photos = [moments[0], {...moments[0], id: 'M2', source: 'T2.JPG'}];
  const onDelete = jest.fn(async () => {});
  let tree: renderer.ReactTestRenderer | undefined;
  try {
    act(() => { tree = renderer.create(<MotionAlbum moments={photos} onBack={jest.fn()} onExport={exportMock} onDelete={onDelete}/>); });
    act(() => tree!.root.findByProps({testID: 'album-cell-M1'}).props.onLongPress());
    act(() => tree!.root.findByProps({testID: 'album-cell-M2'}).props.onPress());
    act(() => tree!.root.findByProps({accessibilityLabel: '批量删除'}).props.onPress());
    act(() => tree!.root.findByProps({testID: 'confirm-accept'}).props.onPress());
    expect(onDelete).not.toHaveBeenCalled();
    act(() => { changed('background'); });
    expect(onDelete).toHaveBeenCalledWith('M1', true);
    expect(onDelete).toHaveBeenCalledWith('M2', true);
    act(() => { jest.advanceTimersByTime(5000); });
    expect(onDelete).toHaveBeenCalledTimes(2);
  } finally {
    if (tree) act(() => tree!.unmount());
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
  }
});

it('shares every selected photo in one action', async () => {
  const onShareMany = jest.fn(async () => {});
  const photos = [moments[0], {...moments[0], id: 'M2', source: 'STILL.JPG', captureMode: 'photo' as const, videoUri: undefined}];
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<MotionAlbum moments={photos} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock} onShareMany={onShareMany}/>); });
  act(() => tree!.root.findByProps({testID: 'album-cell-M1'}).props.onLongPress());
  act(() => tree!.root.findByProps({testID: 'album-cell-M2'}).props.onPress());
  expect(tree!.root.findByProps({testID: 'album-batch-bar'})).toBeTruthy();
  await act(async () => { await tree!.root.findByProps({accessibilityLabel: '分享'}).props.onPress(); });
  expect(onShareMany).toHaveBeenCalledWith(['M1', 'M2']);
  expect(tree!.root.findAllByProps({testID: 'album-select-bar'})).toHaveLength(0);
  act(() => tree!.unmount());
});

it('shows an exported badge from the photo exported field', () => {
  const photos = [{...moments[0], exported: true}, {...moments[0], id: 'M2', source: 'T2.JPG', exported: false}];
  const tree = renderer.create(<MotionAlbum moments={photos} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock}/>);
  expect(tree.root.findByProps({testID: 'album-exported-M1'}).props.children).toBe('已导出');
  expect(tree.root.findByProps({testID: 'album-cell-M1'}).props.accessibilityLabel).toContain('已导出');
  expect(tree.root.findAllByProps({testID: 'album-exported-M2'})).toHaveLength(0);
  act(() => tree.unmount());
});

it('tells a still photo that saving only replaces the in-app copy', () => {
  const still = {...moments[0], captureMode: 'photo' as const, videoUri: undefined};
  const tree = renderer.create(<MotionAlbum moments={[still]} luts={[{id: 'builtin:eterna', name: 'Eterna', size: 12, builtIn: true}] as any} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock} onRender={async () => {}}/>);
  open(tree);
  act(() => tree.root.findByProps({accessibilityLabel: '更换 LUT'}).props.onPress());
  expect(tree.root.findByProps({testID: 'album-lut-save'}).props.disabled).toBe(true);
  expect(JSON.stringify(tree.toJSON())).toContain('按住照片可对比原片。保存只改 App 内副本');
  expect(JSON.stringify(tree.toJSON())).not.toContain('动态照片的封面也会换成新风格');
  act(() => tree.unmount());
});
