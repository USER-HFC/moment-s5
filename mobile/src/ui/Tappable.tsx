import React, {forwardRef, useState} from 'react';
import {GestureResponderEvent, Pressable, PressableProps, View} from 'react-native';

/**
 * NativeWind wraps Pressable to turn className into style and drops a style *function* on the way,
 * so rows styled with ({pressed}) => […] lost all their padding. This keeps the pressed state
 * itself and hands Pressable a plain style. Use it wherever a component styles by pressed state.
 */
export const Tappable = forwardRef<View, PressableProps>(function Tappable({style, onPressIn, onPressOut, ...props}, ref) {
  const [pressed, setPressed] = useState(false);
  const resolved = typeof style === 'function' ? style({pressed}) : style;
  return <Pressable ref={ref} {...props} style={resolved}
    onPressIn={(event: GestureResponderEvent) => { setPressed(true); onPressIn?.(event); }}
    onPressOut={(event: GestureResponderEvent) => { setPressed(false); onPressOut?.(event); }}/>;
});
