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
        // v4 semantic aliases — surface-1 (base) / surface-2 (raised) name the
        // same two layers `paper`/`surface` already are; kept as separate
        // Tailwind keys so v4 components can use the vocabulary the brief
        // specifies without redefining the underlying values.
        'surface-1': withVar('--paper'),
        'surface-2': withVar('--surface'),
        info: withVar('--info'),
        hairline: withVar('--hairline'),
        'bubble-me': withVar('--bubble-me'),
        ok: withVar('--ok'),
        warn: withVar('--warn'),
        danger: withVar('--danger'),
        // teal/live keep their existing DEFAULT (CSS-var, dark-mode-adaptive)
        // for every current bg-teal/text-live/etc. usage, and additionally
        // gain static 50–900 ramps for v4's glass/chip/badge accents. The
        // ramps are NOT CSS-var-driven (unlike DEFAULT) — a deliberate
        // simplification, since these are fine-grained accent steps, not the
        // core adaptive surface language.
        teal: {
          DEFAULT: withVar('--teal'),
          50: '#EAF6F1',
          100: '#CFEDE1',
          200: '#A3DCC7',
          300: '#6FC7A9',
          400: '#3DAE8C',
          500: '#1D9E75',
          600: '#0F6E56',
          700: '#0C5A46',
          800: '#0A4837',
          900: '#073A2C',
        },
        live: {
          DEFAULT: withVar('--live'),
          50: '#FDF1EC',
          100: '#FADDD0',
          200: '#F4B69C',
          300: '#ED8F68',
          400: '#E4713F',
          500: '#D85A30',
          600: '#B84523',
          700: '#96371C',
          800: '#782C16',
          900: '#602311',
        },
        // "coral" is the brief's generic name for the same hue `live` already
        // carries in this codebase (an event being live now) — added as an
        // alias scale for v4 components (dock ring, badges) that want the
        // generic accent name rather than the event-status one.
        coral: {
          50: '#FDF1EC',
          100: '#FADDD0',
          200: '#F4B69C',
          300: '#ED8F68',
          400: '#E4713F',
          500: '#D85A30',
          600: '#B84523',
          700: '#96371C',
          800: '#782C16',
          900: '#602311',
        },
        upcoming: withVar('--upcoming'),
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
