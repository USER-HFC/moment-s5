import {MD3DarkTheme} from 'react-native-paper';

// Shared camera, sheet and album tokens. Dimensions are dp; type follows system scaling.
export const ui = {
  space: {xs: 4, sm: 8, md: 12, gutter: 16, lg: 24, xl: 32},
  radius: {small: 8, control: 12, sheet: 16, pill: 24},
  type: {
    label: {fontSize: 11, lineHeight: 14, fontWeight: '500' as const},
    caption: {fontSize: 12, lineHeight: 16},
    body: {fontSize: 14, lineHeight: 20},
    title: {fontSize: 18, lineHeight: 24, fontWeight: '600' as const},
  },
  icon: {size: 22, viewBox: '0 0 24 24', stroke: 1.6, touch: 44},
  // Direction B: black, white and grey. Active reads white; Leica red is reserved for status dots.
  color: {
    background: '#000000', surface: '#1C1C1E', raised: '#2C2C2E',
    text: '#FFFFFF', muted: '#8E8E93', outline: '#38383A',
    accent: '#FFFFFF', selected: '#3A3A3C', destructive: '#FF453A', leica: '#E3001B',
    overlay: '#000000B8', scrim: '#0000008C', badge: '#000000D9', pressed: '#FFFFFF1F',
  },

};

export const theme = {...MD3DarkTheme, colors: {...MD3DarkTheme.colors,
  primary: ui.color.accent, onPrimary: '#000000',
  primaryContainer: ui.color.selected, onPrimaryContainer: ui.color.text,
  secondary: ui.color.accent, onSecondary: '#000000',
  secondaryContainer: ui.color.selected, onSecondaryContainer: ui.color.text,
  background: ui.color.background, surface: ui.color.surface, surfaceVariant: ui.color.raised,
  onSurface: ui.color.text, onSurfaceVariant: ui.color.muted, outline: ui.color.outline,
  error: ui.color.destructive,
}};
