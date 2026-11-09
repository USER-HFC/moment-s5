import React from 'react';
import type {LucideIcon} from 'lucide-react-native';
import {color as palette, icon} from './tokens';

type Props = {as: LucideIcon; size?: number; color?: string; strokeWidth?: number; testID?: string};

/** Every lucide glyph goes through here so stroke and size stay uniform. */
export function Icon({as: Glyph, size = icon.dock, color = palette.ink, strokeWidth = icon.stroke, testID}: Props) {
  return <Glyph size={size} color={color} strokeWidth={strokeWidth} absoluteStrokeWidth={false} accessible={false} pointerEvents="none" testID={testID}/>;
}
