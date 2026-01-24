import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // =========================================
        // Neo-Brutalist Theme
        // Raw, bold, unapologetic - hard shadows & thick borders
        // =========================================

        // Foundations (Dark backgrounds)
        'brutal-void': '#0D0C1D',        // Deepest black-purple
        'brutal-night': '#1A1833',       // Primary dark background
        'brutal-slate': '#2D2A4A',       // Elevated surfaces, cards

        // Primary Accent
        'brutal-coral': '#FF6B6B',       // Primary CTA, key actions
        'brutal-coral-light': '#FF8E8E', // Hover states

        // Secondary Accents
        'brutal-electric': '#4ECDC4',    // Interactive, links, water
        'brutal-lime': '#A8E6CF',        // Success, positive states
        'brutal-gold': '#FFE66D',        // Warnings, highlights

        // Neutrals
        'brutal-white': '#FFFFFF',       // Primary text on dark
        'brutal-offwhite': '#F5F5F5',    // Secondary backgrounds
        'brutal-gray': '#6B6B8D',        // Muted text
        'brutal-black': '#000000',       // Borders, shadows

        // =========================================
        // Legacy Palette (backward compatibility)
        // =========================================

        // Missouri Float Planner - Atmospheric Utility Color Palette
        // Baselines (Backgrounds)
        'river-deep': '#161748', // Primary UI cards/sections
        'river-night': '#0f132f', // Global background/Map background

        // Accents (Highlights/Actions)
        'sky-warm': '#f95d9b', // Primary Call-to-Action, sunset vibes
        'sky-soft': '#f7a1c4', // Secondary gradients, hover states

        // Functional Colors
        'river-water': '#39a0ca', // River polylines, active states
        'river-forest': '#478559', // "Put-in" markers (Start)
        'river-gravel': '#c7b8a6', // Text, secondary icons, gravel bars

        // Legacy colors (kept for backward compatibility during migration)
        ozark: {
          900: '#1a1a2e',
          800: '#16213e',
          700: '#1f3460',
          600: '#2d4a7c',
          500: '#3d5a80',
        },
        river: {
          900: '#134e4a',
          800: '#115e59',
          700: '#0f766e',
          600: '#14b8a6',
          500: '#2dd4bf',
          400: '#5eead4',
          300: '#99f6e4',
          200: '#ccfbf1',
        },
        forest: {
          900: '#1a2e1a',
          800: '#22543d',
          700: '#276749',
          600: '#38a169',
          500: '#48bb78',
          400: '#68d391',
        },
        sunset: {
          900: '#9d174d',
          800: '#be185d',
          700: '#db2777',
          600: '#ec4899',
          500: '#f472b6',
          400: '#f9a8d4',
          300: '#fbcfe8',
        },
        golden: {
          900: '#92400e',
          800: '#b45309',
          700: '#d97706',
          600: '#f59e0b',
          500: '#fbbf24',
          400: '#fcd34d',
        },
        bluff: {
          900: '#1c1917',
          800: '#292524',
          700: '#44403c',
          600: '#57534e',
          500: '#78716c',
          400: '#a8a29e',
          300: '#d6d3d1',
          200: '#e7e5e4',
          100: '#f5f5f4',
          50: '#fafaf9',
        },
      },
      fontFamily: {
        sans: ['var(--font-geist-sans)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-geist-mono)', 'monospace'],
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Neo-Brutalist Typography Scale - Bold and tight
        'brutal-hero': ['5rem', { lineHeight: '1', letterSpacing: '-0.04em', fontWeight: '900' }],
        'brutal-display': ['3.5rem', { lineHeight: '1.05', letterSpacing: '-0.03em', fontWeight: '800' }],
        'brutal-heading': ['2rem', { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '700' }],
        'brutal-subhead': ['1.25rem', { lineHeight: '1.2', letterSpacing: '-0.01em', fontWeight: '700' }],
        'brutal-body': ['1rem', { lineHeight: '1.5', fontWeight: '500' }],
        'brutal-small': ['0.875rem', { lineHeight: '1.4', fontWeight: '500' }],
        'brutal-micro': ['0.75rem', { lineHeight: '1.3', letterSpacing: '0.05em', fontWeight: '600' }],
      },
      borderRadius: {
        // Neo-Brutalist - sharp or chunky
        'brutal-none': '0',
        'brutal': '8px',
        'brutal-lg': '16px',
      },
      borderWidth: {
        'brutal': '3px',
        'brutal-thick': '4px',
      },
      spacing: {
        // Adventure spacing additions
        '18': '4.5rem',
        '22': '5.5rem',
      },
      backgroundImage: {
        // Neo-Brutalist - Minimal gradients, mostly flat
        // Only use gradients sparingly for section breaks
        'brutal-fade': 'linear-gradient(180deg, #1A1833 0%, #0D0C1D 100%)',
        'brutal-coral-fade': 'linear-gradient(180deg, #FF6B6B 0%, #FF8E8E 100%)',

        // Legacy Gradients
        'gradient-ozark': 'linear-gradient(180deg, var(--tw-gradient-stops))',
        'gradient-sunset': 'linear-gradient(135deg, #161748 0%, #0f132f 50%, #161748 100%)',
        'gradient-river': 'linear-gradient(180deg, #39a0ca 0%, #478559 100%)',
        'gradient-hero': 'linear-gradient(180deg, #0f132f 0%, #161748 50%, #0f132f 100%)',
        'gradient-card': 'linear-gradient(180deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0) 100%)',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'ripple': 'ripple 2s ease-in-out infinite',
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
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
      },
      boxShadow: {
        // Neo-Brutalist - Hard offset shadows, no blur
        'brutal-sm': '2px 2px 0 #000000',
        'brutal': '4px 4px 0 #000000',
        'brutal-lg': '6px 6px 0 #000000',
        'brutal-xl': '8px 8px 0 #000000',

        // Colored hard shadows
        'brutal-coral': '4px 4px 0 #FF6B6B',
        'brutal-coral-lg': '6px 6px 0 #FF6B6B',
        'brutal-electric': '4px 4px 0 #4ECDC4',
        'brutal-electric-lg': '6px 6px 0 #4ECDC4',

        // Light shadows for dark backgrounds
        'brutal-light': '4px 4px 0 rgba(255,255,255,0.25)',
        'brutal-light-lg': '6px 6px 0 rgba(255,255,255,0.25)',
        'brutal-white': '4px 4px 0 #FFFFFF',

        // Legacy Shadows
        'glow': '0 0 20px rgba(45, 212, 191, 0.3)',
        'glow-sunset': '0 0 20px rgba(244, 114, 182, 0.3)',
        'card': '0 4px 6px -1px rgba(26, 26, 46, 0.1), 0 2px 4px -2px rgba(26, 26, 46, 0.1)',
        'card-hover': '0 10px 15px -3px rgba(26, 26, 46, 0.15), 0 4px 6px -4px rgba(26, 26, 46, 0.1)',
      },
    },
  },
  plugins: [],
};
export default config;
