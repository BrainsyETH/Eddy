type OpenUrl = (url: string) => Promise<unknown>;

/**
 * Non-web schemes the app will hand to the system: a call, a text, an email,
 * and the two navigation apps the directions chooser offers deep links for
 * (directionsChoices.ts). Nothing else a server record could carry.
 */
const SYSTEM_SCHEMES = new Set(['tel:', 'sms:', 'mailto:', 'comgooglemaps:', 'waze:']);

/** Native-free so the handoff, fallback and duplicate-tap rules can be tested. */
export function createExternalLinkOpener({ openBrowser, openSystem, openBookingApp, onError }: {
  openBrowser: OpenUrl;
  openSystem: OpenUrl;
  openBookingApp?: (url: string) => Promise<boolean>;
  onError: (error: unknown) => void;
}) {
  let openingBrowser = false;

  return async function openExternalLink(url: string, handleError = onError): Promise<void> {
    const target = url.trim();
    let ownsBrowser = false;
    try {
      const parsed = new URL(target);
      const { protocol } = parsed;
      if (protocol !== 'https:' && protocol !== 'http:') {
        // Contact rows can contain telephone/email links as well as websites.
        // Only those: every other scheme a record could carry (an app store
        // link, a third-party app's) is refused rather than handed to the
        // system on the strength of a server field.
        if (!SYSTEM_SCHEMES.has(protocol)) throw new Error(`Unsupported link: ${protocol}`);
        await openSystem(target);
        return;
      }
      if (openingBrowser) return;
      openingBrowser = ownsBrowser = true;
      // Preserve an installed provider app's session for supported booking
      // links. Exact hosts and booking paths only; other pages stay in Eddy.
      if (protocol === 'https:' && !parsed.port && !parsed.username && !parsed.password &&
        ['recreation.gov', 'www.recreation.gov'].includes(parsed.hostname) &&
        /^\/camping\/(campgrounds|campsites)\/[^/]+\/?$/.test(parsed.pathname) && openBookingApp) {
        try {
          if (await openBookingApp(parsed.href)) return;
        } catch { /* Missing native support or a failed handoff uses the browser. */ }
      }
      try {
        // On iOS this stays pending until Done/swipe-to-dismiss, keeping the
        // underlying screen intact and preventing a second browser sheet.
        await openBrowser(parsed.href);
      } catch {
        // An unavailable browser/native module must not strand a booking link.
        await openSystem(parsed.href);
      }
    } catch (error) {
      handleError(error);
    } finally {
      if (ownsBrowser) openingBrowser = false;
    }
  };
}
