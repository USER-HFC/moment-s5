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
  icon: {size: 24, viewBox: '0 0 24 24', stroke: 1.8, touch: 48},
  color: {
    background: '#101210', surface: '#1B201B', raised: '#2C332B',
    text: '#EDF0E7', muted: '#B0B9AB', outline: '#5D685B',
    accent: '#D6F58B', selected: '#344329', destructive: '#FF8C88',
    overlay: '#101210B8', scrim: '#00000099', badge: '#101210D9', pressed: '#EDF0E720',
  },
};

export const theme = {...MD3DarkTheme, colors: {...MD3DarkTheme.colors,
  primary: ui.color.accent, onPrimary: ui.color.background,
  primaryContainer: ui.color.selected, onPrimaryContainer: ui.color.text,
  secondary: ui.color.accent, onSecondary: ui.color.background,
  secondaryContainer: ui.color.selected, onSecondaryContainer: ui.color.accent,
  background: ui.color.background, surface: ui.color.surface, surfaceVariant: ui.color.raised,
  onSurface: ui.color.text, onSurfaceVariant: ui.color.muted, outline: ui.color.outline,
  error: ui.color.destructive,
}};
