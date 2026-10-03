import React from 'react';
import {StyleSheet, View} from 'react-native';
import {Text} from 'react-native-paper';
import {SvgXml} from 'react-native-svg';

const paths: Record<string, string> = require('./cameraIcons');
export type CameraIconName = 'back' | 'grid' | 'lut' | 'motion' | 'timer' | 'focus' | 'far' | 'near' | 'usb' | 'mic' | 'album' | 'ratio' | 'delay' | 'check';
export const CAMERA_ACCENT = '#EEE689';
export const CAMERA_ICON_SIZE = 20;

export default React.memo(function CameraIcon({name, active = false, label, size = CAMERA_ICON_SIZE}: {
  name: CameraIconName; active?: boolean; label?: string; size?: number;
}) {
  const color = active ? CAMERA_ACCENT : '#E4E6DF';
  if (name === 'lut' || name === 'ratio') {
    return <Text maxFontSizeMultiplier={1.3} style={[styles.type, {color}, name === 'lut' && styles.lut]}>{label || 'LUT'}</Text>;
  }
  // Back is additional app navigation; every camera glyph is the prototype SVG.
  const key = name === 'far' ? 'focus-far' : name === 'near' ? 'focus-near' : name === 'delay' ? 'timer' : name === 'album' ? 'grid' : name;
  const body = name === 'back' ? '<path d="m14 6-6 6 6 6M8 12h13"/>' : paths[key];
  return <View accessible={false} pointerEvents="none">
    <SvgXml testID={`camera-icon-${name}`} width={size} height={size}
      xml={`<svg viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`}/>
  </View>;
});

const styles = StyleSheet.create({
  type: {fontSize: 10, fontWeight: '600', textAlign: 'center'},
  lut: {borderWidth: 1, borderColor: '#E4E6DF', borderRadius: 3, padding: 2},
});
