import React from 'react';
import {SvgXml} from 'react-native-svg';
import {ui} from './theme';

const paths: Record<string, string> = require('./cameraIcons');
// One semantic table, one optical box, one stroke. State variants keep the same footprint.
export const CAMERA_ICONS = {
  back: 'back', grid: 'grid', album: 'album', lut: 'lut', motion: 'motion', photo: 'photo',
  timer: 'timer', focus: 'focus-auto', far: 'focus-far', near: 'focus-near',
  usb: 'usb', wifi: 'wifi', disconnected: 'usb-off', demo: 'demo', mic: 'mic', muted: 'mic-off',
  ratio: 'ratio', check: 'check', chevron: 'chevron', copy: 'copy', external: 'external', close: 'close', list: 'list', save: 'save',
  delete: 'delete', import: 'import', refresh: 'rotate', settings: 'settings', scopes: 'scopes',
  enlarge: 'enlarge', shrink: 'shrink', move: 'move',
} as const;
export type CameraIconName = keyof typeof CAMERA_ICONS;
export const CAMERA_ACCENT = ui.color.accent;
export const CAMERA_ICON_SIZE = ui.icon.size;

export default React.memo(function CameraIcon({name, active = false, destructive = false, contrast = false}: {
  name: CameraIconName; active?: boolean; destructive?: boolean; contrast?: boolean;
}) {
  const color = destructive ? ui.color.destructive : active ? ui.color.accent : ui.color.text;
  return <SvgXml accessible={false} pointerEvents="none" testID={`camera-icon-${name}`}
    width={ui.icon.size} height={ui.icon.size}
    xml={`<svg viewBox="${ui.icon.viewBox}" fill="none" stroke="${color}" stroke-width="${ui.icon.stroke}" stroke-linecap="round" stroke-linejoin="round">${contrast ? `<g stroke="#000B" stroke-width="3.6">${paths[CAMERA_ICONS[name]]}</g>` : ''}${paths[CAMERA_ICONS[name]]}</svg>`}/>;
});
