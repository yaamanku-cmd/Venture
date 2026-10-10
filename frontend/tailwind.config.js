/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        dark: {
          950: '#07090e',
          900: '#0b0f19',
          850: '#111726',
          800: '#161f36',
          700: '#1f2b48',
          600: '#2d3d63',
        },
        fraud: {
          light: '#f87171',
          DEFAULT: '#ef4444',
          dark: '#b91c1c',
          glow: 'rgba(239, 68, 68, 0.35)',
        },
        legit: {
          light: '#34d399',
          DEFAULT: '#10b981',
          dark: '#047857',
          glow: 'rgba(16, 185, 129, 0.25)',
        },
        cyber: {
          cyan: '#06b6d4',
          blue: '#3b82f6',
          purple: '#8b5cf6',
          amber: '#f59e0b',
        }
      },
      fontFamily: {
        sans: ['Plus Jakarta Sans', 'Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      keyframes: {
        flashRow: {
          '0%': { backgroundColor: 'rgba(239, 68, 68, 0.55)', transform: 'scale(1.01)' },
          '50%': { backgroundColor: 'rgba(239, 68, 68, 0.25)' },
          '100%': { backgroundColor: 'rgba(239, 68, 68, 0.12)', transform: 'scale(1)' },
        },
        pulseGlow: {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.6', transform: 'scale(1.08)' },
        },
        subtlePulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.4' },
        }
      },
      animation: {
        flashRow: 'flashRow 1.4s ease-out forwards',
        pulseGlow: 'pulseGlow 2.5s infinite ease-in-out',
        subtlePulse: 'subtlePulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
      }
    },
  },
  plugins: [],
}
