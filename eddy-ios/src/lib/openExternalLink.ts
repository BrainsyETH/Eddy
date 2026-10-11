import { Alert, Linking } from 'react-native';
import { createExternalLinkOpener } from './externalLinkOpener';

/** Web content only. Keep navigation, directions and App Store actions at their callers. */
export const openExternalLink = createExternalLinkOpener({
  openBrowser: async (url) => {
    // Load on tap: a missing native module in an old dev client cannot break launch.
    const WebBrowser = await import('expo-web-browser');
    await WebBrowser.openBrowserAsync(url, {
      dismissButtonStyle: 'done',
      presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
    });
  },
  openSystem: (url) => Linking.openURL(url),
  onError: () => Alert.alert('Couldn’t open the link', 'Please try again in a moment.'),
});
