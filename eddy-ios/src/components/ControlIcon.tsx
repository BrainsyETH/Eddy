import type { ComponentProps } from 'react';
import { Platform, type StyleProp, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SymbolView, type SFSymbol } from 'expo-symbols';

type Props = ComponentProps<typeof Ionicons>;
const symbols: Partial<Record<NonNullable<Props['name']>, SFSymbol>> = {
  'chevron-forward': 'chevron.right', 'chevron-back': 'chevron.left',
  'chevron-up': 'chevron.up', 'chevron-down': 'chevron.down',
  'share-outline': 'square.and.arrow.up', 'share-social-outline': 'square.and.arrow.up',
  star: 'star.fill', 'star-outline': 'star', close: 'xmark', 'close-outline': 'xmark',
  'close-circle': 'xmark.circle.fill', 'close-circle-outline': 'xmark.circle',
  locate: 'location.fill', 'locate-outline': 'location',
  layers: 'square.3.layers.3d', 'layers-outline': 'square.3.layers.3d',
  search: 'magnifyingglass', 'search-outline': 'magnifyingglass', checkmark: 'checkmark',
};

/** Native utility glyphs on iOS; preserve category artwork and other icons. */
export function ControlIcon({ name, size = 20, color, style, ...props }: Props) {
  const symbol = name ? symbols[name] : undefined;
  if (Platform.OS !== 'ios' || !symbol) return <Ionicons name={name} size={size} color={color} style={style} {...props} />;
  return <SymbolView {...props} name={symbol} tintColor={color} weight="regular" resizeMode="scaleAspectFit"
    tabIndex={props.tabIndex === 0 ? 0 : props.tabIndex === -1 ? -1 : undefined}
    style={[{ width: size, height: size }, style as StyleProp<ViewStyle>]} />;
}
