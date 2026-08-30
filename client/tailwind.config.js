/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{vue,js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        wallt: {
          bg: '#0A0A0F',
          card: '#1C1C28',
          accent: '#00D4AA',
          'accent-hover': '#00B894',
        },
      },
    },
  },
  plugins: [],
}
