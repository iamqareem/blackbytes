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
        // MetaMask-inspired palette
        brand: {
          blue: '#0052D4',
          blueLight: '#0078FF',
          blueDark: '#003DB3',
          blueHover: '#0066CC',
        },
        surface: {
          0: '#FFFFFF',
          50: '#F8F9FA',
          100: '#F1F3F5',
          200: '#E9ECEF',
          300: '#DEE2E6',
          400: '#CED4DA',
          500: '#ADB5BD',
          600: '#868E96',
          700: '#495057',
          800: '#343A40',
          900: '#212529',
          950: '#1A1D21',
        },
        dark: {
          bg: '#0D1117',
          surface: '#161B22',
          elevated: '#21262D',
          border: '#30363D',
          borderHover: '#484F58',
        },
        text: {
          primary: '#1A1D21',
          secondary: '#495057',
          muted: '#868E96',
          inverse: '#FFFFFF',
          link: '#0052D4',
        },
        darkText: {
          primary: '#F0F6FC',
          secondary: '#8B949E',
          muted: '#6E7681',
          inverse: '#1A1D21',
          link: '#58A6FF',
        },
      },
      boxShadow: {
        'elevation-1': '0 1px 2px rgba(0, 0, 0, 0.05), 0 1px 3px rgba(0, 0, 0, 0.1)',
        'elevation-2': '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'elevation-3': '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        'elevation-4': '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        'inner-glow': 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
        'dark-elevation-1': '0 1px 2px rgba(0, 0, 0, 0.3), 0 1px 3px rgba(0, 0, 0, 0.4)',
        'dark-elevation-2': '0 4px 6px -1px rgba(0, 0, 0, 0.4), 0 2px 4px -1px rgba(0, 0, 0, 0.3)',
        'dark-elevation-3': '0 10px 15px -3px rgba(0, 0, 0, 0.4), 0 4px 6px -2px rgba(0, 0, 0, 0.3)',
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
        '3xl': '24px',
        'full': '9999px',
      },
      transitionDuration: {
        'fast': '120ms',
        'normal': '200ms',
        'slow': '300ms',
      },
      transitionTimingFunction: {
        'spring': 'cubic-bezier(0.34, 1.56, 0.64, 1)',
        'smooth': 'cubic-bezier(0.4, 0, 0.2, 1)',
      },
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', 'sans-serif'],
        mono: ['SF Mono', 'Monaco', 'Inconsolata', 'Fira Mono', 'monospace'],
      },
      fontSize: {
        'xs': ['0.75rem', { lineHeight: '1.5', letterSpacing: '0.01em' }],
        'sm': ['0.875rem', { lineHeight: '1.5', letterSpacing: '0.01em' }],
        'base': ['1rem', { lineHeight: '1.5', letterSpacing: '0.01em' }],
        'lg': ['1.125rem', { lineHeight: '1.5', letterSpacing: '0.01em' }],
        'xl': ['1.25rem', { lineHeight: '1.4', letterSpacing: '-0.01em' }],
        '2xl': ['1.5rem', { lineHeight: '1.3', letterSpacing: '-0.02em' }],
        '3xl': ['1.875rem', { lineHeight: '1.2', letterSpacing: '-0.02em' }],
      },
      spacing: {
        '18': '4.5rem',
        '88': '22rem',
      },
    },
  },
  plugins: [],
}