import type { Config } from 'tailwindcss';

// Semantic color names backed by the CSS variables defined in src/styles.css.
const token = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Space Grotesk"', 'ui-sans-serif', 'system-ui'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      colors: {
        canvas: token('--c-canvas'),
        surface: {
          DEFAULT: token('--c-surface'),
          raised: token('--c-surface-raised'),
        },
        edge: token('--c-edge'),
        ink: {
          DEFAULT: token('--c-ink'),
          secondary: token('--c-ink-secondary'),
          muted: token('--c-ink-muted'),
        },
        accent: {
          DEFAULT: token('--c-accent'),
          strong: token('--c-accent-strong'),
          contrast: token('--c-accent-contrast'),
        },
        info: token('--c-info'),
        warning: token('--c-warning'),
        danger: token('--c-danger'),
      },
    },
  },
  plugins: [],
} satisfies Config;
