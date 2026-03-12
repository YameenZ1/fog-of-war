/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './src/**/*.{ts,tsx,jsx,js}'],
  theme: {
    extend: {
      colors: {
        phosphor: '#39ff14',
        amber: '#ffb000',
        'terminal-red': '#ff3333',
        'war-bg': '#0a0f05',
      },
      fontFamily: {
        terminal: ['"Share Tech Mono"', 'Courier New', 'monospace'],
      },
      boxShadow: {
        glow: '0 0 10px rgba(57, 255, 20, 0.3)',
        'glow-strong': '0 0 20px rgba(57, 255, 20, 0.4)',
      },
    },
  },
  plugins: [],
};
