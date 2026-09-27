export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#0B1F44',
        mustard: { DEFAULT: '#F2C14E', dark: '#E0B03A' },
        cream: '#F6F1E8',
        sand: '#EDE4D3',
        leaf: '#2F7A4F',
        chili: '#D9482B',
        muted: '#6B7280',
      },
      fontFamily: {
        display: ['Fredoka', 'system-ui', 'sans-serif'],
        body: ['Nunito', 'system-ui', 'sans-serif'],
      },
      borderRadius: { card: '1.25rem' },
      boxShadow: { card: '0 6px 24px -8px rgba(11, 31, 68, 0.18)' },
    },
  },
  plugins: [],
};
