import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {AppState} from 'react-native';
import {afterEach, expect, it, jest} from '@jest/globals';
import useCameraReadings from '../src/hud/useCameraReadings';
import {camera, CameraState} from '../src/native';

jest.mock('../src/native', () => ({camera: {getState: jest.fn()}}));
const state: CameraState = {active: true, busy: false, ready: true, demo: false, transport: 'usb', lut: null};
function Harness({visible = true, update}: {visible?: boolean; update: React.Dispatch<React.SetStateAction<CameraState>>}) {
  useCameraReadings(state, update, visible);return null;
}
afterEach(() => {jest.clearAllTimers();jest.useRealTimers();jest.restoreAllMocks();});

it('refreshes cached readings in foreground only and removes the state subscription / timer on unmount', async () => {
  jest.useFakeTimers();AppState.currentState = 'active';
  const getState = jest.mocked(camera!.getState);getState.mockReset().mockResolvedValue({...state, exposureAgeMs: 20_000});
  const remove = jest.fn();let changed: (next: string) => void;
  jest.spyOn(AppState, 'addEventListener').mockImplementation((_, handler: any) => {changed = handler;return {remove};});
  const update = jest.fn();let tree: renderer.ReactTestRenderer;
  act(() => {tree = renderer.create(<Harness update={update}/>);});
  await act(async () => {jest.advanceTimersByTime(1000);});
  expect(getState).toHaveBeenCalledTimes(1);expect(update).toHaveBeenCalledWith({...state, exposureAgeMs: 20_000});
  AppState.currentState = 'background';await act(async () => {jest.advanceTimersByTime(3000);});
  expect(getState).toHaveBeenCalledTimes(1);
  AppState.currentState = 'active';await act(async () => changed!('active'));
  expect(getState).toHaveBeenCalledTimes(2);
  act(() => tree!.update(<Harness visible={false} update={update}/>));
  await act(async () => {jest.advanceTimersByTime(3000);});
  expect(getState).toHaveBeenCalledTimes(2);expect(remove).toHaveBeenCalledTimes(1);
  act(() => tree!.unmount());expect(jest.getTimerCount()).toBe(0);
});

it('does not overlap slow reads or apply late state to a workspace that has closed', async () => {
  jest.useFakeTimers();AppState.currentState = 'active';
  let resolve: (value: CameraState) => void;
  const getState = jest.mocked(camera!.getState);getState.mockReset().mockImplementation(() => new Promise(done => {resolve = done;}));
  const update = jest.fn();let tree: renderer.ReactTestRenderer;
  act(() => {tree = renderer.create(<Harness update={update}/>);});
  await act(async () => {jest.advanceTimersByTime(3000);});expect(getState).toHaveBeenCalledTimes(1);
  act(() => tree!.unmount());await act(async () => resolve!(state));
  expect(update).not.toHaveBeenCalled();expect(jest.getTimerCount()).toBe(0);
});
