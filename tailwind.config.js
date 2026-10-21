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
        // MetaMask actual brand colors
        brand: {
          blue: '#3B82F6',        // Primary vivid blue
          blueHover: '#2563EB',   // Hover
          blueLight: '#60A5FA',   // Light
          blueGlow: '#3B82F6',    // For glows
          blueSoft: '#1E3A5F',    // Soft backgrounds
        },
        surface: {
          0: '#FFFFFF',
          50: '#FAFAFA',
          100: '#F4F4F5',
          200: '#E4E4E7',
          300: '#D4D4D8',
          400: '#A1A1AA',
          500: '#71717A',
          600: '#52525B',
          700: '#3F3F46',
          800: '#27272A',
          900: '#18181B',
          950: '#09090B',
        },
        dark: {
          bg: '#0D0D0D',        // MetaMask dark bg
          surface: '#1A1A1A',   // Card surface
          elevated: '#262626',  // Elevated
          border: '#333333',    // Borders
          borderHover: '#3F3F3F',
        },
        text: {
          primary: '#FFFFFF',
          secondary: '#A0A0A0',
          muted: '#737373',
          inverse: '#0D0D0D',
          link: '#3B82F6',
        },
      },
      boxShadow: {
        'elevation-1': '0 1px 3px rgba(0, 0, 0, 0.3), 0 1px 2px rgba(0, 0, 0, 0.2)',
        'elevation-2': '0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -2px rgba(0, 0, 0, 0.2)',
        'elevation-3': '0 10px 15px -3px rgba(0, 0, 0, 0.3), 0 4px 6px -4px rgba(0, 0, 0, 0.2)',
        'elevation-4': '0 20px 25px -5px rgba(0, 0, 0, 0.4), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
        'glow-blue': '0 0 20px rgba(59, 130, 246, 0.3), 0 0 40px rgba(59, 130, 246, 0.1)',
        'inner-glow': 'inset 0 1px 0 rgba(255, 255, 255, 0.05)',
      },
      borderRadius: {
        'xl': '16px',
        '2xl': '20px',
        '3xl': '28px',
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
        'lg': ['1.125rem', { lineHeight: '1.4', letterSpacing: '-0.01em' }],
        'xl': ['1.25rem', { lineHeight: '1.3', letterSpacing: '-0.02em' }],
        '2xl': ['1.5rem', { lineHeight: '1.2', letterSpacing: '-0.02em' }],
        '3xl': ['1.875rem', { lineHeight: '1.1', letterSpacing: '-0.03em' }],
      },
    },
  },
  plugins: [],
}