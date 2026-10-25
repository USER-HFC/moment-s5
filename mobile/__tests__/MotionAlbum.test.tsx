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
const gestures = () => (GestureHandler as any).__gestures as {kind: string; onBegin?: () => void; onUpdate?: (event: any) => void; onEnd?: (event: any) => void}[];
const latest = (kind: string) => [...gestures()].reverse().find((gesture) => gesture.kind === kind);

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
  const photos = [moments[0], {...moments[0], id: 'M2', source: 'T2.JPG', captureMode: 'photo', videoUri: undefined}];
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
  expect(JSON.stringify(tree.toJSON())).toContain('T2.JPG');
  act(() => tree.unmount());
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
  expect(tree!.root.findAllByProps({accessibilityLabel: '保存到系统相册'})).toHaveLength(0);
  expect(tree!.root.findAllByProps({accessibilityLabel: '保存原片到系统相册'})).toHaveLength(0);
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
  await act(async () => { await tree!.root.findByProps({accessibilityLabel: '保存到系统相册'}).props.onPress(); });
  expect(onExport).toHaveBeenCalledWith('M1');
  act(() => tree!.unmount());
});

it('shows LUT failure honestly and offers the preserved original for a failed static photo', () => {
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<MotionAlbum moments={[{...moments[0], captureMode: 'photo', complete: false, error: 'LUT 处理失败，原片已保留', videoUri: undefined}]} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock}/>); });
  expect(JSON.stringify(tree!.toJSON())).toContain('LUT 处理失败，原片已保留');
  open(tree!);
  expect(tree!.root.findByProps({accessibilityLabel: '保存原片到系统相册'})).toBeTruthy();
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
  await act(async () => { await tree!.root.findByProps({accessibilityLabel: '从原片重新套用 LUT'}).props.onPress(); });
  expect(onRender).toHaveBeenCalledWith('M1', 'builtin:classic-chrome');
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
    width: 6000, height: 4000, lut: 'Classic Chrome', lutApplied: true, directory: '/data/moments/M1',
    files: [{name: 'original.jpg', bytes: 2048}, {name: 'rendered.jpg', bytes: 4096}],
    exportKnown: true, exported: true, exportPath: 'DCIM/MomentS5/M1.jpg',
  }));
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<MotionAlbum moments={[{...moments[0], cameraTriggered: true, transport: 'usb'}]} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock} onDetails={onDetails}/>); });
  open(tree!);
  await act(async () => { tree!.root.findByProps({accessibilityLabel: '照片信息'}).props.onPress(); });
  expect(onDetails).toHaveBeenCalledWith('M1');
  const text = JSON.stringify(tree!.toJSON());
  for (const part of ['机身快门同步', 'USB', 'P1000123.JPG', 'Panasonic DC-S5', 'LUMIX S 50/1.8', 'ISO 400', '1/125', 'f/1.8', '50 mm', '6000 × 4000', 'Classic Chrome', '/data/moments/M1', '已导出 · DCIM/MomentS5/M1.jpg', '原片', 'LUT 成片']) {
    expect(text).toContain(part);
  }
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
