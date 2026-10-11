import { Alert, Appearance, Linking } from 'react-native';
import { createExternalLinkOpener } from './externalLinkOpener';
import { darkPalette, lightPalette } from '../theme/palette';

/** Web content only. Keep navigation, directions and App Store actions at their callers. */
export const openExternalLink = createExternalLinkOpener({
  openBrowser: async (url) => {
    // Load on tap: a missing native module in an old dev client cannot break launch.
    const WebBrowser = await import('expo-web-browser');
    await WebBrowser.openBrowserAsync(url, {
      dismissButtonStyle: 'done',
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
      // Resolve on every tap, so changing the system scheme also changes the
      // next sheet. Leave the toolbar background under Safari's control.
      controlsColor: (Appearance.getColorScheme() === 'light' ? lightPalette : darkPalette).interactive,
    });
  },
  openBookingApp: async (url) => {
    const { openUniversalLink } = await import('../../modules/eddy-links');
    return openUniversalLink(url);
  },
  openSystem: (url) => Linking.openURL(url),
  onError: () => Alert.alert('Couldn’t open the link', 'Please try again in a moment.'),
});
