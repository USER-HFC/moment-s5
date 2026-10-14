import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {AppState} from 'react-native';
import {afterEach, beforeEach, expect, it, jest} from '@jest/globals';

jest.mock('react-native-safe-area-context', () => ({SafeAreaView: ({children}: any) => children}));
jest.mock('../src/native', () => ({camera: {capture: jest.fn(), remoteShutter: jest.fn(), focus: jest.fn(), setAudio: jest.fn()}}));
jest.mock('../src/microphonePermission', () => ({requestMicrophonePermission: jest.fn(async () => true)}));

import CameraWorkspace from '../src/CameraWorkspace';
import {camera, CameraState} from '../src/native';
import {requestMicrophonePermission} from '../src/microphonePermission';

const state: CameraState = {active: true, busy: false, ready: true, demo: false, lut: null};
const props = {state, buffered: 3, luts: [], onAlbum: jest.fn(), onLut: async () => {}, onImportLut: async () => {}, onRefresh: async () => {}, onConnect: async () => {}};
let tree: renderer.ReactTestRenderer;

beforeEach(() => {
  jest.useFakeTimers(); jest.clearAllMocks(); AppState.currentState = 'active';
  jest.mocked(requestMicrophonePermission).mockResolvedValue(true);
  act(() => { tree = renderer.create(<CameraWorkspace {...props}/>); });
});
afterEach(() => { act(() => tree.unmount()); jest.clearAllTimers(); jest.useRealTimers(); jest.restoreAllMocks(); });
const press = (label: string) => act(() => tree.root.findByProps({accessibilityLabel: label}).props.onPress());
const tick = (ms: number) => act(() => jest.advanceTimersByTime(ms));

it('sends matching near and far native focus directions', () => {
  press('近对焦'); expect(camera!.focus).toHaveBeenLastCalledWith(-1);
  press('远对焦'); expect(camera!.focus).toHaveBeenLastCalledWith(1);
});

it('uses the current motion setting when the countdown completes exactly once', () => {
  press('定时'); press('开始倒计时'); tick(1000); press('动态照片'); tick(9000);
  expect(camera!.capture).toHaveBeenCalledTimes(1);
  expect(camera!.remoteShutter).not.toHaveBeenCalled();
  tick(1000); expect(camera!.capture).toHaveBeenCalledTimes(1);
});

it('does not move the countdown when the wall clock changes', () => {
  press('定时'); press('开始倒计时');
  jest.setSystemTime(Date.now() + 60_000); tick(9900);
  expect(camera!.remoteShutter).not.toHaveBeenCalled();
  tick(100); expect(camera!.remoteShutter).toHaveBeenCalledTimes(1);
});

it('still cancels immediately when the timer control is pressed during a countdown', () => {
  press('定时'); press('开始倒计时'); tick(5000); press('定时'); tick(6000);
  expect(camera!.remoteShutter).not.toHaveBeenCalled();
  expect(camera!.capture).not.toHaveBeenCalled();
  expect(tree.root.findByProps({accessibilityLabel: '拍照到相机'})).toBeTruthy();
});

it.each([{busy: true}, {active: false}])('cancels the countdown when capture becomes unavailable: %j', update => {
  press('定时'); press('开始倒计时'); tick(5000);
  act(() => tree.update(<CameraWorkspace {...props} state={{...state, ...update}}/>)); tick(6000);
  expect(camera!.capture).not.toHaveBeenCalled(); expect(camera!.remoteShutter).not.toHaveBeenCalled();
});

it('checks current prebuffer readiness at the countdown boundary', () => {
  press('动态照片'); press('定时'); press('拍摄动态照片');
  act(() => tree.update(<CameraWorkspace {...props} state={{...state, ready: false}}/>)); tick(10_000);
  expect(camera!.capture).not.toHaveBeenCalled(); expect(camera!.remoteShutter).not.toHaveBeenCalled();
});

it('cancels before entering the album or unmounting', () => {
  press('定时'); press('开始倒计时'); press('打开相册'); tick(10_000);
  expect(props.onAlbum).toHaveBeenCalledTimes(1); expect(camera!.remoteShutter).not.toHaveBeenCalled();
  press('开始倒计时'); act(() => tree.unmount()); tick(10_000);
  expect(camera!.remoteShutter).not.toHaveBeenCalled();
});

it('cancels in background even before a queued tick runs', () => {
  press('定时'); press('开始倒计时'); AppState.currentState = 'background'; tick(10_000);
  expect(camera!.remoteShutter).not.toHaveBeenCalled();
});

it('keeps audio off when microphone permission is denied', async () => {
  jest.mocked(requestMicrophonePermission).mockResolvedValue(false);
  await act(async () => tree.root.findByProps({accessibilityLabel: '环境声'}).props.onPress());
  expect(requestMicrophonePermission).toHaveBeenCalledTimes(1); expect(camera!.setAudio).not.toHaveBeenCalled();
});

it('restores the native audio preference and switches it off without another permission request', async () => {
  act(() => tree.update(<CameraWorkspace {...props} state={{...state, audio: true}}/>));
  await act(async () => tree.root.findByProps({accessibilityLabel: '环境声'}).props.onPress());
  expect(requestMicrophonePermission).not.toHaveBeenCalled(); expect(camera!.setAudio).toHaveBeenCalledWith(false);
});

it('hides the AF reticle until a feed is available and separates capture modes', () => {
  expect(tree.root.findAllByProps({accessibilityLabel: '中央自动对焦'})).toHaveLength(0);
  act(() => tree.update(<CameraWorkspace {...props} preview="data:image/jpeg;base64,frame"/>));
  expect(tree.root.findByProps({accessibilityLabel: '中央自动对焦'})).toBeTruthy();
  press('动态照片'); press('机身照片'); press('拍照到相机');
  expect(camera!.remoteShutter).toHaveBeenCalledTimes(1);
  expect(camera!.capture).not.toHaveBeenCalled();
});
