import { Image, type ColorValue } from 'react-native';

// A bundled alpha template, shared with the native iOS tab. Metro selects the
// matching @2x/@3x asset; the tab bar supplies selected and unselected colors.
export const FLOAT_TAB_ICON = require('../../assets/tab-icons/eddy-canoe.png');

export function FloatTabIcon({ color, size }: { color: ColorValue; size: number }) {
  return (
    <Image
      source={FLOAT_TAB_ICON}
      style={{ width: size, height: size, tintColor: color }}
      resizeMode="contain"
      accessible={false}
      importantForAccessibility="no"
    />
  );
}
