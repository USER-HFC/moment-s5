/** Direction B tokens: black, white and grey with a little Leica red. */
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./App.tsx', './src/**/*.{ts,tsx}'],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: {
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
      },
      borderRadius: {card: '14px', sheet: '32px'},
      fontSize: {
        caption: ['12px', {lineHeight: '16px'}],
        footnote: ['13px', {lineHeight: '18px'}],
        body: ['16px', {lineHeight: '21px'}],
        headline: ['17px', {lineHeight: '22px', fontWeight: '600'}],
        title: ['20px', {lineHeight: '25px', fontWeight: '700'}],
        large: ['30px', {lineHeight: '36px', fontWeight: '700'}],
      },
    },
  },
  plugins: [],
};
