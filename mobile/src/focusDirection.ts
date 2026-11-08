/** Near is +1 and far is -1 until the user reverses them. The native drive values stay put. */
export function focusDirection(direction: -1 | 1, reversed: boolean): -1 | 1 {
  if (!reversed) return direction;
  return direction === 1 ? -1 : 1;
}
