import type { Config } from 'tailwindcss';

// Colours are driven by CSS variables (space-separated RGB channels) defined in
// globals.css, so every `bg-paper` / `text-ink` / `border-hairline` utility flips
// automatically in dark mode. Alpha modifiers (e.g. `bg-ink/[0.06]`) still work.
const withVar = (v: string) => `rgb(var(${v}) / <alpha-value>)`;

const config: Config = {
  darkMode: 'class',
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        paper: withVar('--paper'),
        surface: withVar('--surface'),
        ink: withVar('--ink'),
        sub: withVar('--sub'),
        teal: withVar('--teal'),
        live: withVar('--live'),
        upcoming: withVar('--upcoming'),
        info: withVar('--info'),
        hairline: withVar('--hairline'),
      },
      fontFamily: {
        sans: [
          'Inter',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'sans-serif',
        ],
      },
      // v3 design-system type scale — opt in with e.g. text-body / text-h1.
      fontSize: {
        micro: ['12px', { lineHeight: '1.45' }],
        caption: ['13.5px', { lineHeight: '1.45' }],
        body: ['15px', { lineHeight: '1.45' }],
        callout: ['17px', { lineHeight: '1.4' }],
        h3: ['20px', { lineHeight: '1.3' }],
        h2: ['26px', { lineHeight: '1.25' }],
        h1: ['32px', { lineHeight: '1.2' }],
      },
      // v3 radii — controls/cards/sheets. Existing rounded-xl etc. still work;
      // new components should prefer these named scales.
      borderRadius: {
        control: '10px',
        card: '14px',
        sheet: '20px',
      },
    },
  },
  plugins: [],
};

export default config;
