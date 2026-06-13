/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg:      '#F7F8F5',
        surface: '#FFFFFF',
        surface2:'#EEF1EA',
        surface3:'#DDE3D8',
        border:  '#D9DED2',
        coral:   '#E93F2E',
        mint:    '#2A7F62',
        amber:   '#B98914',
        blue:    '#2F64B1',
        text1:   '#151914',
        text2:   '#566153',
        text3:   '#879081',
      },
      fontFamily: {
        display: ['var(--font-barlow)', 'sans-serif'],
        body:    ['var(--font-dm-sans)', 'sans-serif'],
        mono:    ['var(--font-dm-mono)', 'monospace'],
      },
      animation: {
        'blink':      'blink 2s ease-in-out infinite',
        'nudge':      'nudge 2.4s ease-in-out infinite',
        'float':      'float 3s ease-in-out infinite',
        'fade-up':    'fadeUp .4s ease forwards',
        'slide-up':   'slideUp .35s cubic-bezier(.77,0,.175,1) forwards',
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
      },
      keyframes: {
        blink:     { '0%,100%': { opacity: '1' }, '50%': { opacity: '0.3' } },
        nudge:     { '0%,100%': { transform: 'translateX(0)' }, '50%': { transform: 'translateX(5px)' } },
        float:     { '0%,100%': { transform: 'translateY(0) rotate(2deg)' }, '50%': { transform: 'translateY(-10px) rotate(4deg)' } },
        fadeUp:    { from: { opacity: '0', transform: 'translateY(16px)' }, to: { opacity: '1', transform: 'translateY(0)' } },
        slideUp:   { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        pulseGlow: { '0%,100%': { boxShadow: '0 0 20px rgba(255,77,0,.3)' }, '50%': { boxShadow: '0 0 40px rgba(255,77,0,.6)' } },
      },
    },
  },
  plugins: [],
};

module.exports = config;
