import {expect, it} from '@jest/globals';
import {focusDirection} from '../src/focusDirection';

it('keeps near as +1 and far as -1 until the user reverses them', () => {
  expect(focusDirection(1, false)).toBe(1);
  expect(focusDirection(-1, false)).toBe(-1);
  expect(focusDirection(1, true)).toBe(-1);
  expect(focusDirection(-1, true)).toBe(1);
});
