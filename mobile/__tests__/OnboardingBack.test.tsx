import React from 'react';
import renderer, {act} from 'react-test-renderer';
import {BackHandler} from 'react-native';
import {afterEach, beforeEach, expect, it, jest} from '@jest/globals';
import OnboardingCards from '../src/OnboardingCards';

const handlers: Array<() => boolean | null | undefined> = [];

beforeEach(() => {
  handlers.length = 0;
  jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_event, handler) => {
    const wrapped = handler as () => boolean | null | undefined;
    handlers.push(wrapped);
    return {remove: () => { const index = handlers.lastIndexOf(wrapped); if (index >= 0) handlers.splice(index, 1); }};
  });
  jest.spyOn(BackHandler, 'exitApp').mockImplementation(() => undefined);
});
afterEach(() => { jest.restoreAllMocks(); });

function pressBack() {
  act(() => {
    let handled = false;
    for (const handler of [...handlers].reverse()) if (handler()) { handled = true; break; }
    if (!handled) BackHandler.exitApp();
  });
}

it('returns to the previous intro card and skips from the first', () => {
  const done = jest.fn();
  let tree: renderer.ReactTestRenderer;
  act(() => { tree = renderer.create(<OnboardingCards onDone={done}/>); });
  expect(JSON.stringify(tree!.toJSON())).toContain('连接相机');
  act(() => tree!.root.findByProps({testID: 'onboarding-next'}).props.onPress());
  expect(JSON.stringify(tree!.toJSON())).toContain('拍动态照片');
  pressBack();
  expect(JSON.stringify(tree!.toJSON())).toContain('连接相机');
  expect(done).not.toHaveBeenCalled();
  expect(BackHandler.exitApp).not.toHaveBeenCalled();
  pressBack();
  expect(done).toHaveBeenCalledTimes(1);
  expect(BackHandler.exitApp).not.toHaveBeenCalled();
  act(() => tree!.root.findByProps({testID: 'onboarding-next'}).props.onPress());
  act(() => tree!.root.findByProps({testID: 'onboarding-next'}).props.onPress());
  expect(JSON.stringify(tree!.toJSON())).toContain('套用 LUT');
  pressBack();
  expect(JSON.stringify(tree!.toJSON())).toContain('拍动态照片');
  expect(done).toHaveBeenCalledTimes(1);
  act(() => tree!.unmount());
  pressBack();
  expect(BackHandler.exitApp).toHaveBeenCalledTimes(1);
});
