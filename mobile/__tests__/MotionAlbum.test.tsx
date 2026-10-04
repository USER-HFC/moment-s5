import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {jest, expect, it} from '@jest/globals';

jest.mock('react-native-video', () => {
  const React = require('react');
  const {View} = require('react-native');
  return React.forwardRef((props: any, ref: any) => <View {...props} ref={ref} testID="motion-video" />);
});

import MotionAlbum from '../src/MotionAlbum';

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
  const tree = renderer.create(<MotionAlbum moments={moments} onBack={jest.fn()} onExport={exportMock} />);
  expect(tree.root.findByProps({testID: 'motion-viewer'})).toBeTruthy();
  expect(tree.root.findByProps({accessibilityLabel: '查看相册列表'})).toBeTruthy();
  expect(tree.root.findByProps({accessibilityLabel: '轻点缩放，长按播放动态照片'})).toBeTruthy();
  act(() => tree.unmount());
});

it('reveals the full list through the explicit list action', () => {
  const tree = renderer.create(<MotionAlbum moments={moments} onBack={jest.fn()} onExport={exportMock} />);
  act(() => tree.root.findByProps({accessibilityLabel: '查看相册列表'}).props.onPress());
  expect(tree.root.findByProps({accessibilityLabel: '动态照片列表'})).toBeTruthy();
  expect(tree.root.findByProps({accessibilityLabel: '返回最近照片预览'})).toBeTruthy();
  act(() => tree.unmount());
});
