// Layout tokens shared by new Eddy surfaces.
//
// The web system declares these ideas in globals.css. React Native cannot
// consume CSS, so this is the native translation: the same compact rhythm and
// object hierarchy, expressed as numbers StyleSheet can register once. Colour
// and elevation stay in ThemeProvider because they change with appearance.

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const radius = {
  control: 8,
  inset: 12,
  card: 14,
  pill: 999,
} as const;

export const border = {
  standard: 1,
  emphasized: 2,
} as const;
