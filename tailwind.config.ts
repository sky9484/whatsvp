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
        bg: withVar('--bg'),
        paper: withVar('--paper'),
        surface: withVar('--surface'),
        ink: withVar('--ink'),
        sub: withVar('--sub'),
        muted: withVar('--muted'),
        // Surface layers — 1 = page/paper, 2 = raised card/inset.
        'surface-1': withVar('--paper'),
        'surface-2': withVar('--surface-2'),
        info: withVar('--info'),
        hairline: withVar('--hairline'),
        // WhatsVP identity accents (v4 redesign) — the neon/social language.
        brand: withVar('--brand'),
        'brand-2': withVar('--brand-2'),
        aqua: withVar('--aqua'),
        lime: withVar('--lime'),
        violet: withVar('--violet'),
        creator: withVar('--creator'),
        gold: withVar('--gold'),
        money: withVar('--money'),
        success: withVar('--success'),
        'map-night': withVar('--map-night'),
        'bubble-me': withVar('--bubble-me'),
        'bubble-other': withVar('--bubble-other'),
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
        // live now = the new signal coral (#FF5A7A family). DEFAULT is
        // var-driven so it flips light/dark; the ramp gives fixed accent steps.
        live: {
          DEFAULT: withVar('--live'),
          50: '#FFE9EE',
          100: '#FFC9D5',
          200: '#FF9DB2',
          300: '#FF7291',
          400: '#FF5A7A',
          500: '#FF3D63',
          600: '#E22450',
          700: '#B81A40',
          800: '#8E1533',
          900: '#5E0E22',
        },
        coral: {
          DEFAULT: withVar('--coral'),
          50: '#FFE9EE',
          100: '#FFC9D5',
          200: '#FF9DB2',
          300: '#FF7291',
          400: '#FF5A7A',
          500: '#FF3D63',
          600: '#E22450',
          700: '#B81A40',
          800: '#8E1533',
          900: '#5E0E22',
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
      // WhatsVP type scale (v4) — display → micro. Headings tighten tracking
      // for a premium feel; body stays comfortable.
      fontSize: {
        micro: ['12px', { lineHeight: '1.45' }],
        caption: ['13.5px', { lineHeight: '1.45' }],
        body: ['15px', { lineHeight: '1.5' }],
        callout: ['17px', { lineHeight: '1.4' }],
        h3: ['20px', { lineHeight: '1.3', letterSpacing: '-0.01em' }],
        h2: ['26px', { lineHeight: '1.22', letterSpacing: '-0.015em' }],
        h1: ['32px', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
        display: ['44px', { lineHeight: '1.02', letterSpacing: '-0.03em' }],
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
