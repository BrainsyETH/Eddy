// eddy-ios/src/theme/ThemeProvider.tsx
// Light and dark, following the system setting.
//
// WHY A HOOK AND NOT A CONSTANT: StyleSheet.create runs ONCE at module import,
// so any colour written into a StyleSheet is frozen at the value the app started
// with and will not change when the system flips to dark. That is the whole
// reason this exists.
//
// The convention throughout the app is therefore a split:
//   • StyleSheet.create  — layout, spacing, radii, font sizes (never colour)
//   • inline style props — colour, pulled from useTheme()
//
// Layout stays in StyleSheet because that is the part worth registering once;
// colour is a handful of props per screen and costs nothing to apply inline.

import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { DynamicColorIOS, Platform, useColorScheme, type ColorValue } from 'react-native';
import { darkPalette, elevation, floating, lightPalette, type Palette } from './palette';
import { highContrastDarkPalette, highContrastLightPalette } from './contrast';
import { useIncreaseContrast } from '@/hooks/useIncreaseContrast';
import { useReduceTransparency } from '@/hooks/useReduceTransparency';

const nativeRoles = (colors: Palette) => Object.fromEntries(
  (['text', 'textMuted', 'border', 'interactive'] as const).map(role => [role, Platform.OS === 'ios'
    ? DynamicColorIOS({ light: lightPalette[role], dark: darkPalette[role], highContrastLight: highContrastLightPalette[role], highContrastDark: highContrastDarkPalette[role] })
    : colors[role]]),
) as Record<'text' | 'textMuted' | 'border' | 'interactive', ColorValue>;

interface ThemeValue {
  colors: Palette;
  isDark: boolean;
  increaseContrast: boolean;
  reduceTransparency: boolean;
  nativeColors: ReturnType<typeof nativeRoles>;
  /** Depth for `level`, already resolved for the current scheme. */
  elevation: (level: 1 | 2) => ReturnType<typeof elevation>;
  /** Depth for a control floating over content — see floating() in palette.ts. */
  floating: () => ReturnType<typeof floating>;
}

// Dark is the default so a first frame rendered before the scheme resolves
// matches the app's most common appearance rather than flashing white.
const ThemeContext = createContext<ThemeValue>({
  colors: darkPalette,
  isDark: true,
  increaseContrast: false,
  reduceTransparency: true,
  nativeColors: nativeRoles(darkPalette),
  elevation: (level) => elevation(darkPalette, level),
  floating: () => floating(darkPalette),
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Returns null before the scheme is known; treat that as dark rather than
  // flashing a light screen and correcting a frame later.
  const scheme = useColorScheme();
  const increaseContrast = useIncreaseContrast();
  const reduceTransparency = useReduceTransparency();

  const value = useMemo<ThemeValue>(() => {
    const colors = scheme === 'light'
      ? increaseContrast ? highContrastLightPalette : lightPalette
      : increaseContrast ? highContrastDarkPalette : darkPalette;
    return {
      colors,
      isDark: colors.scheme === 'dark',
      increaseContrast,
      reduceTransparency,
      nativeColors: nativeRoles(colors),
      elevation: (level: 1 | 2) => elevation(colors, level),
      floating: () => floating(colors),
    };
  }, [scheme, increaseContrast, reduceTransparency]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeValue {
  return useContext(ThemeContext);
}

/** Shorthand for the common case of only needing colours. */
export function useColors(): Palette {
  return useContext(ThemeContext).colors;
}
