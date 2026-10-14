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

const moments = [{
  id: 'M1',
  source: 'S5.JPG',
  createdAt: 1700000000000,
  complete: true,
  imageUri: 'content://moment/image',
  videoUri: 'content://moment/video',
}] as any;
const exportMock = async (_id: string) => {};

it('opens the latest photo as the primary album view', () => {
  const tree = renderer.create(<MotionAlbum moments={moments} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock} />);
  expect(tree.root.findByProps({testID: 'motion-viewer'})).toBeTruthy();
  expect(tree.root.findByProps({accessibilityLabel: '查看相册列表'})).toBeTruthy();
  expect(tree.root.findByProps({accessibilityLabel: '单击显示或隐藏操作，双指缩放，长按播放动态照片'})).toBeTruthy();
  act(() => tree.unmount());
});

it('reveals the full list through the explicit list action', () => {
  const tree = renderer.create(<MotionAlbum moments={moments} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock} />);
  act(() => tree.root.findByProps({accessibilityLabel: '查看相册列表'}).props.onPress());
  expect(tree.root.findByProps({accessibilityLabel: '动态照片列表'})).toBeTruthy();
  expect(tree.root.findByProps({accessibilityLabel: '返回最近照片预览'})).toBeTruthy();
  act(() => tree.unmount());
});

it('never puts raw text in native View children when showing the album list', () => {
  let tree: renderer.ReactTestRenderer;
  act(() => {tree = renderer.create(<MotionAlbum moments={moments} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock}/>);});
  act(() => tree!.root.findByProps({accessibilityLabel: '查看相册列表'}).props.onPress());
  const raw = tree!.root.findAllByType(View).flatMap(node => React.Children.toArray(node.props.children)).filter(child => typeof child === 'string');
  expect(raw).toEqual([]);
  act(() => tree!.unmount());
});

it('stops long-press playback when the finger is released', () => {
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<MotionAlbum moments={moments} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock} />); });
  const hold = tree!.root.findByProps({accessibilityLabel: '单击显示或隐藏操作，双指缩放，长按播放动态照片'});
  act(() => hold.props.onLongPress()); expect(tree!.root.findByProps({testID: 'motion-video'}).props.paused).toBe(false);
  act(() => hold.props.onPressOut()); expect(tree!.root.findByProps({testID: 'motion-video'}).props.paused).toBe(true);
  act(() => tree!.unmount());
});

it('resets playback and readiness after returning from the list', () => {
  const seek = (Video as any).seekMock;
  seek.mockClear();
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<MotionAlbum moments={moments} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock} />); });
  act(() => tree!.root.findByProps({testID: 'motion-video'}).props.onLoad());
  act(() => tree!.root.findByProps({testID: 'motion-video'}).props.onReadyForDisplay());
  act(() => tree!.root.findByProps({accessibilityLabel: '单击显示或隐藏操作，双指缩放，长按播放动态照片'}).props.onLongPress());
  expect(seek).toHaveBeenCalledTimes(1);
  act(() => tree!.root.findByProps({accessibilityLabel: '查看相册列表'}).props.onPress());
  act(() => tree!.root.findByProps({accessibilityLabel: '返回最近照片预览'}).props.onPress());
  expect(tree!.root.findByProps({testID: 'motion-video'}).props.paused).toBe(true);
  act(() => tree!.root.findByProps({accessibilityLabel: '单击显示或隐藏操作，双指缩放，长按播放动态照片'}).props.onLongPress());
  expect(seek).toHaveBeenCalledTimes(1);
  act(() => tree!.root.findByProps({testID: 'motion-video'}).props.onLoad());
  expect(seek).toHaveBeenCalledTimes(2);
  act(() => tree!.unmount());
});

it('keeps the photo visible until video has rendered its first frame', () => {
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<MotionAlbum moments={moments} onBack={jest.fn()} onExport={exportMock} onDelete={exportMock} />); });
  const timing = jest.spyOn(Animated, 'timing');
  act(() => tree!.root.findByProps({accessibilityLabel: '单击显示或隐藏操作，双指缩放，长按播放动态照片'}).props.onLongPress());
  act(() => tree!.root.findByProps({testID: 'motion-video'}).props.onLoad());
  expect(timing).not.toHaveBeenCalled();
  act(() => tree!.root.findByProps({testID: 'motion-video'}).props.onReadyForDisplay());
  expect(timing).toHaveBeenCalledTimes(2);
  act(() => tree!.unmount()); timing.mockRestore();
});

it('can delete a failed app-private record while export stays unavailable', () => {
  const failed = [{...moments[0], complete: false, error: '接收失败'}];
  const remove = jest.fn(async (_id: string) => {});
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<MotionAlbum moments={failed} onBack={jest.fn()} onExport={exportMock} onDelete={remove} />); });
  expect(tree!.root.findAllByProps({accessibilityLabel: '保存到系统相册'})).toHaveLength(0);
  act(() => tree!.root.findByProps({accessibilityLabel: '删除动态照片'}).props.onPress());
  const buttons = alert.mock.calls[0][2]!;
  act(() => buttons[1].onPress!()); expect(remove).toHaveBeenCalledWith('M1');
  act(() => tree!.unmount()); alert.mockRestore();
});
