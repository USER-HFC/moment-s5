import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {jest, expect, it} from '@jest/globals';
import {Alert, Animated, View} from 'react-native';

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
const singleTap = () => [...gestures()].reverse().find((gesture) => gesture.kind === 'tap' && !gesture.numberOfTaps)!;

function open(tree: renderer.ReactTestRenderer, source = 'S5.JPG') {
  act(() => tree.root.findByProps({accessibilityLabel: `打开${source}`}).props.onPress());
}

it('keeps Wi-Fi capture provenance visible in the album after disconnection', () => {
  const tree = renderer.create(<MotionAlbum moments={[{...moments[0], experimentalWifi: true}]} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock}/>);
  expect(tree.root.findByProps({testID: 'experimental-wifi-badge'})).toBeTruthy();
  expect(tree.root.findAllByProps({testID: 'motion-viewer'})).toHaveLength(0);
  act(() => tree.update(<MotionAlbum moments={moments} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock}/>));
  expect(tree.root.findAllByProps({testID: 'experimental-wifi-badge'})).toHaveLength(0);
  act(() => tree.unmount());
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
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<MotionAlbum moments={failed} onBack={jest.fn()} onExport={exportMock} onDelete={remove}/>); });
  open(tree!);
  expect(tree!.root.findAllByProps({accessibilityLabel: '导出到系统相册'})).toHaveLength(0);
  expect(tree!.root.findAllByProps({accessibilityLabel: '导出原片到系统相册'})).toHaveLength(0);
  act(() => tree!.root.findByProps({accessibilityLabel: '删除照片'}).props.onPress());
  const buttons = alert.mock.calls[0][2]!;
  act(() => buttons[1].onPress!());
  expect(remove).toHaveBeenCalledWith('M1');
  act(() => tree!.unmount()); alert.mockRestore();
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
  await act(async () => { await tree!.root.findByProps({accessibilityLabel: '选择 LUT Classic Chrome'}).props.onPress(); });
  expect(tree!.root.findByProps({testID: 'album-photo'}).props.source.uri).toBe('file://preview-builtin:classic-chrome');
  const hold = latest('longPress')!;
  act(() => hold.onStart?.());
  expect(tree!.root.findByProps({testID: 'album-photo'}).props.source.uri).toBe('content://moment/original');
  act(() => hold.onEnd?.({}));
  expect(tree!.root.findByProps({testID: 'album-photo'}).props.source.uri).toBe('file://preview-builtin:classic-chrome');
  act(() => tree!.unmount());
});

it('shares the original when that option is chosen', () => {
  const onShare = jest.fn(async () => {});
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<MotionAlbum moments={moments} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock} onShare={onShare}/>); });
  open(tree!);
  act(() => tree!.root.findByProps({accessibilityLabel: '分享照片'}).props.onPress());
  const buttons = alert.mock.calls[0][2]!;
  expect(buttons.map((button) => button.text)).toEqual(['分享当前画面', '分享原片', '分享动态视频', '分享实况文件', '取消']);
  act(() => buttons[1].onPress!());
  expect(onShare).toHaveBeenCalledWith('M1', 'original');
  act(() => tree!.unmount()); alert.mockRestore();
});
