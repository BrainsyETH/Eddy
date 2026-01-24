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
        // Adventure Theme - Outdoor Mountain Palette
        // Bright, optimistic with deep indigo foundations
        // =========================================

        // Foundations (Backgrounds)
        'adventure-night': '#15143D',    // Deepest layer - page backgrounds
        'adventure-deep': '#2B1F6B',     // Card backgrounds, elevated surfaces
        'adventure-violet': '#5144A8',   // Tertiary UI, mountain highlights

        // Warm Accents (CTAs, Highlights)
        'adventure-coral': '#F37A8A',    // Primary CTA, warm highlights
        'adventure-peach': '#F2B7A0',    // Secondary warm, hover states

        // Cool Functional Colors
        'adventure-lake': '#3AA0C9',     // River lines, interactive elements
        'adventure-forest': '#478559',   // Success states, put-in markers

        // Text & Neutrals
        'adventure-cloud': '#F7F6FB',    // Primary text on dark
        'adventure-text': '#1E1B3A',     // Text on light backgrounds
        'adventure-muted': '#6E6A8E',    // Secondary text, captions
        'adventure-mist': '#B8B5C9',     // Disabled states, borders

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
        // Adventure Typography Scale
        'hero': ['4rem', { lineHeight: '1.1', letterSpacing: '-0.025em' }],
        'display': ['3rem', { lineHeight: '1.15', letterSpacing: '-0.02em' }],
        'heading': ['2rem', { lineHeight: '1.2', letterSpacing: '-0.015em' }],
        'subhead': ['1.5rem', { lineHeight: '1.3', letterSpacing: '-0.01em' }],
        'body-lg': ['1.125rem', { lineHeight: '1.6' }],
        'body': ['1rem', { lineHeight: '1.6' }],
        'small': ['0.875rem', { lineHeight: '1.5' }],
        'micro': ['0.75rem', { lineHeight: '1.4' }],
      },
      borderRadius: {
        // Adventure soft radius scale
        'adventure-sm': '6px',
        'adventure-md': '10px',
        'adventure-lg': '16px',
        'adventure-xl': '24px',
        'adventure-2xl': '32px',
      },
      spacing: {
        // Adventure spacing additions
        '18': '4.5rem',
        '22': '5.5rem',
      },
      backgroundImage: {
        // Adventure Theme Gradients
        'gradient-mountain': 'linear-gradient(180deg, #15143D 0%, #2B1F6B 30%, #5144A8 60%, #2B1F6B 85%, #15143D 100%)',
        'gradient-sunrise': 'linear-gradient(180deg, #F37A8A 0%, #F2B7A0 50%, #5144A8 100%)',
        'gradient-lake': 'linear-gradient(135deg, #3AA0C9 0%, #478559 100%)',
        'gradient-adventure-hero': 'linear-gradient(180deg, #15143D 0%, #2B1F6B 40%, #5144A8 70%, #F37A8A 100%)',
        'gradient-adventure-card': 'linear-gradient(180deg, rgba(81, 68, 168, 0.3) 0%, #2B1F6B 40%)',
        'gradient-coral-glow': 'radial-gradient(ellipse at 50% 0%, rgba(243, 122, 138, 0.15) 0%, transparent 70%)',

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
        // Adventure Theme Shadows
        'adventure-card': '0 4px 16px rgba(21, 20, 61, 0.25)',
        'adventure-card-hover': '0 8px 32px rgba(21, 20, 61, 0.35)',
        'glow-coral': '0 0 24px rgba(243, 122, 138, 0.3)',
        'glow-lake': '0 0 24px rgba(58, 160, 201, 0.3)',
        'glow-soft': '0 0 40px rgba(243, 122, 138, 0.15)',
        'inner-soft': 'inset 0 2px 4px rgba(0, 0, 0, 0.1)',

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
