import React from 'react';
import Svg, {Circle} from 'react-native-svg';
import {color as palette, icon} from './tokens';

/** Live/motion mark: a dot, a ring and a dashed outer ring, drawn on the shared 24 box and stroke. */
export function MotionGlyph({size = icon.dock, color = palette.ink, testID}: {size?: number; color?: string; testID?: string}) {
  return <Svg testID={testID} width={size} height={size} viewBox="0 0 24 24" fill="none" accessible={false} pointerEvents="none">
    <Circle cx={12} cy={12} r={2.6} fill={color}/>
    <Circle cx={12} cy={12} r={5.6} stroke={color} strokeWidth={icon.stroke}/>
    <Circle cx={12} cy={12} r={9.2} stroke={color} strokeWidth={icon.stroke} strokeDasharray="1.6 2.4" strokeLinecap="round"/>
  </Svg>;
}
