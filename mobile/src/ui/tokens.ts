// Direction B, mirrored from tailwind.config.js for the few places that need a raw value
// (SVG strokes, lucide colors, Animated styles). Keep the two in step.
export const color = {
  canvas: '#000000',
  grouped: '#1C1C1E',
  raised: '#2C2C2E',
  control: '#3A3A3C',
  separator: '#38383A',
  ink: '#FFFFFF',
  muted: '#8E8E93',
  faint: '#636366',
  subtle: '#AEAEB2',
  off: '#39393D',
  leica: '#E3001B',
  danger: '#FF453A',
  glass: 'rgba(0,0,0,0.45)',
  scrim: 'rgba(0,0,0,0.55)',
} as const;

/** One stroke and two sizes for every glyph: 20 over the picture, 22 in docks and lists. */
export const icon = {stroke: 1.6, overlay: 20, dock: 22, touch: 44} as const;
