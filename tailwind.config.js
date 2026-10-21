/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./public/**/*.html",
    "./src/**/*.js",
    "./admin/**/*.html",
    "./admin/src/**/*.js"
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // Instagram-inspired palette
        ig: {
          // Light mode
          50: '#FAFAFA',
          100: '#EFEFEF',
          200: '#DBDBDB',
          300: '#CCCCCC',
          400: '#8E8E8E',
          500: '#8E8E8E',
          600: '#5E5E5E',
          700: '#3D3D3D',
          800: '#262626',
          900: '#1A1A1A',
          950: '#0D0D0D',
          // Dark mode overrides
          bg: '#121212',
          surface: '#1E1E1E',
          elevated: '#2C2C2C',
          border: '#3A3A3A',
          text: '#FFFFFF',
          muted: '#8E8E8E',
          primary: '#0095F6',
          primaryHover: '#1877F2',
          danger: '#ED4956',
          warning: '#F56040',
          success: '#00C851',
        }
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"Segoe UI"', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
      },
      animation: {
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.4s ease-out',
        'swipe': 'swipe 0.3s ease-out',
      },
      keyframes: {
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        swipe: {
          '0%': { transform: 'translateX(100%)' },
          '100%': { transform: 'translateX(0)' },
        },
      },
    },
  },
  plugins: [],
}