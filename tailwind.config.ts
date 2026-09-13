import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        desk: {
          bg: '#0b0f14',
          bg2: '#111821',
          bg3: '#16202b',
          border: '#243041',
          muted: '#8b9bb0',
          text: '#e6edf5',
          green: '#22c55e',
          red: '#ef4444',
          amber: '#f59e0b',
          blue: '#38bdf8',
          purple: '#a78bfa',
          cyan: '#22d3ee',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'ui-monospace', 'SF Mono', 'Menlo', 'Consolas', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 24px -4px rgba(56, 189, 248, 0.35)',
        'glow-green': '0 0 20px -4px rgba(34, 197, 94, 0.45)',
        'glow-red': '0 0 20px -4px rgba(239, 68, 68, 0.4)',
      },
      keyframes: {
        pulseDot: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        },
      },
      animation: {
        pulseDot: 'pulseDot 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
