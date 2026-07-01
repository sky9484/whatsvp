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
        ink: withVar('--ink'),
        teal: withVar('--teal'),
        live: withVar('--live'),
        upcoming: withVar('--upcoming'),
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
    },
  },
  plugins: [],
};

export default config;
