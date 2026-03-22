/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          900: '#0d0f12',
          800: '#161920',
          700: '#1e2330',
          600: '#252c3f',
        },
      },
    },
  },
  plugins: [],
}
