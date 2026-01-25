import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        // =========================================
        // Organic Brutalist Theme
        // Bold and grounded with natural warmth
        // =========================================

        // Primary — Deep river blue-green (main surfaces, nav, map chrome)
        primary: {
          50: '#EBF5F7',
          100: '#D4EAEF',
          200: '#A3D1DB',
          300: '#72B5C4',
          400: '#4A9AAD',
          500: '#2D7889', // Base
          600: '#256574',
          700: '#1D525F',
          800: '#163F4A',
          900: '#0F2D35',
        },

        // Secondary — Sandbar tan (supporting surfaces, cards)
        secondary: {
          50: '#FAF8F4',
          100: '#F4EFE7',
          200: '#E8DFD0',
          300: '#D9C9B0',
          400: '#C9B391',
          500: '#B89D72', // Base
          600: '#99835F',
          700: '#7A684B',
          800: '#5C4E38',
          900: '#3D3425',
        },

        // Accent — Sunset coral (CTAs, highlights, active states)
        accent: {
          50: '#FEF5F3',
          100: '#FDE7E1',
          200: '#FACABD',
          300: '#F7AC9A',
          400: '#F48E76',
          500: '#F07052', // Base
          600: '#E5573F',
          700: '#CC3E2B',
          800: '#A33122',
          900: '#7A2419',
        },

        // Support — Trail green (success, nature callouts, badges)
        support: {
          50: '#EDFAF1',
          100: '#DCF4E2',
          200: '#B8E9C5',
          300: '#95D9A7',
          400: '#71C989',
          500: '#4EB86B', // Base
          600: '#419959',
          700: '#347A47',
          800: '#275C35',
          900: '#1A3D23',
        },

        // Neutrals — Warm stone tones
        neutral: {
          50: '#F7F6F3',
          100: '#EDEBE6',
          200: '#DBD5CA',
          300: '#C2BAAC',
          400: '#A49C8E',
          500: '#857D70',
          600: '#6B6459',
          700: '#524D43',
          800: '#3F3B33',
          900: '#2D2A24',
          950: '#1A1814',
        },

        // Semantic shorthand colors
        background: '#F7F6F3', // neutral-50
        surface: '#FFFFFF',
        success: '#4EB86B', // support-500
        warning: '#E5A000',
        error: '#DC2626',
        info: '#2D7889', // primary-500
      },
      fontFamily: {
        heading: ['var(--font-heading)', 'system-ui', 'sans-serif'],
        body: ['var(--font-body)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'monospace'],
        // Fallback for legacy code
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Type Scale
        'xs': ['0.75rem', { lineHeight: '1.4' }],      // 12px
        'sm': ['0.875rem', { lineHeight: '1.5' }],    // 14px
        'base': ['1rem', { lineHeight: '1.5' }],      // 16px
        'lg': ['1.125rem', { lineHeight: '1.6' }],    // 18px
        'xl': ['1.25rem', { lineHeight: '1.4' }],     // 20px
        '2xl': ['1.5rem', { lineHeight: '1.3' }],     // 24px
        '3xl': ['1.875rem', { lineHeight: '1.25' }],  // 30px
        '4xl': ['2.25rem', { lineHeight: '1.15' }],   // 36px
        '5xl': ['3rem', { lineHeight: '1.1' }],       // 48px
        '6xl': ['3.75rem', { lineHeight: '1.05' }],   // 60px
      },
      letterSpacing: {
        tighter: '-0.02em',
        tight: '-0.01em',
        normal: '0',
        wide: '0.025em',
        wider: '0.05em',
        widest: '0.1em',
      },
      borderRadius: {
        'none': '0',
        'sm': '4px',
        'md': '6px',
        'lg': '8px',
        'xl': '12px',
        '2xl': '16px',
        'full': '9999px',
      },
      borderWidth: {
        'thin': '1px',
        'base': '2px',
        'thick': '3px',
        'chunky': '4px',
      },
      spacing: {
        '18': '4.5rem',
        '22': '5.5rem',
      },
      backgroundImage: {
        // Organic gradients - subtle, natural
        'gradient-page': 'linear-gradient(180deg, #F7F6F3 0%, #EDEBE6 100%)',
        'gradient-primary': 'linear-gradient(180deg, #163F4A 0%, #0F2D35 100%)',
        'gradient-accent': 'linear-gradient(180deg, #F07052 0%, #E5573F 100%)',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'ripple': 'ripple 2s ease-in-out infinite',
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'spin-slow': 'spin 1.5s linear infinite',
        'shimmer': 'shimmer 1.5s infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        ripple: {
          '0%, 100%': { transform: 'scale(1)', opacity: '0.8' },
          '50%': { transform: 'scale(1.05)', opacity: '1' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' },
        },
      },
      boxShadow: {
        // Organic Brutalist shadows - offset with slight warmth
        'xs': '1px 1px 0 #C2BAAC',
        'sm': '2px 2px 0 #C2BAAC',
        'md': '3px 3px 0 #A49C8E',
        'lg': '4px 4px 0 #857D70',
        'xl': '6px 6px 0 #6B6459',

        // Soft variants for less aggressive contexts
        'soft-sm': '0 1px 3px rgba(45, 42, 36, 0.1)',
        'soft-md': '0 4px 6px rgba(45, 42, 36, 0.1)',
        'soft-lg': '0 10px 15px rgba(45, 42, 36, 0.1)',

        // Colored shadows for emphasis
        'accent': '3px 3px 0 #E5573F',
        'primary': '3px 3px 0 #1D525F',

        // Inset for pressed states
        'inset': 'inset 2px 2px 4px rgba(45, 42, 36, 0.15)',
      },
      transitionDuration: {
        '0': '0ms',
        'fast': '100ms',
        'normal': '200ms',
        'slow': '300ms',
        'slower': '500ms',
      },
    },
  },
  plugins: [],
};
export default config;
