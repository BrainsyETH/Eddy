import { Image, type ColorValue } from 'react-native';

// Bundled alpha templates, shared with native iOS tabs. Metro selects the
// matching @2x/@3x asset; the tab bar supplies selected and unselected colors.
export const BRAND_TAB_ICONS = {
  today: require('../../assets/tab-icons/eddy-today.png'),
  floats: require('../../assets/tab-icons/eddy-canoe.png'),
} as const;

export function BrandTabIcon({ name, color, size }: {
  name: keyof typeof BRAND_TAB_ICONS;
  color: ColorValue;
  size: number;
}) {
  return (
    <Image
      source={BRAND_TAB_ICONS[name]}
      style={{ width: size, height: size, tintColor: color }}
      resizeMode="contain"
      accessible={false}
      importantForAccessibility="no"
    />
  );
}
