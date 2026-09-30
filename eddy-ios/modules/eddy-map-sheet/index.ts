import { requireNativeView, requireOptionalNativeModule } from 'expo';
import { Platform, View, type ViewProps } from 'react-native';

// Older development clients/Expo Go can still open Map without this view.
// The iOS 26 scroll-edge correction requires a binary containing this module.
export const MapSheetScrollBoundary = Platform.OS === 'ios' && requireOptionalNativeModule('EddyMapSheet')
  ? requireNativeView<ViewProps>('EddyMapSheet')
  : View;
