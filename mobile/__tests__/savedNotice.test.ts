import {expect, it} from '@jest/globals';
import {savedNoticeMessage} from '../src/savedNotice';

it('uses the native save line, including the shot type and LUT name', () => {
  expect(savedNoticeMessage('照片已保存')).toBe('照片已保存');
  expect(savedNoticeMessage('  动态照片已保存  ')).toBe('动态照片已保存');
  expect(savedNoticeMessage('动态照片已保存 · Classic Chrome')).toBe('动态照片已保存 · Classic Chrome');
  expect(savedNoticeMessage('照片已保存 · 我的 LUT')).toBe('照片已保存 · 我的 LUT');
});

it('does not invent a notice when the native line is not a save', () => {
  expect(savedNoticeMessage('已保存')).toBeNull();
  expect(savedNoticeMessage('实况已保存')).toBeNull();
  expect(savedNoticeMessage('照片已保存 · ')).toBeNull();
  expect(savedNoticeMessage('已同步机身照片 DEMO.jpg')).toBeNull();
  expect(savedNoticeMessage('正在拍摄照片')).toBeNull();
});
