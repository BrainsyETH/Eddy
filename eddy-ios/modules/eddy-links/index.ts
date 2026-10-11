import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

interface EddyLinksModule {
  openUniversalLink: (url: string) => Promise<boolean>;
}

/** False means use the in-app browser, without opening Safari as a side effect. */
export async function openUniversalLink(url: string): Promise<boolean> {
  if (Platform.OS !== 'ios') return false;
  // Lookup happens only after a tap. Older dev clients safely use the browser.
  const native = requireOptionalNativeModule<EddyLinksModule>('EddyLinks');
  return native ? native.openUniversalLink(url) : false;
}
