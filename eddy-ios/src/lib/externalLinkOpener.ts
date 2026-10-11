type OpenUrl = (url: string) => Promise<unknown>;

/** Native-free so the handoff, fallback and duplicate-tap rules can be tested. */
export function createExternalLinkOpener({ openBrowser, openSystem, onError }: {
  openBrowser: OpenUrl;
  openSystem: OpenUrl;
  onError: (error: unknown) => void;
}) {
  let openingBrowser = false;

  return async function openExternalLink(url: string, handleError = onError): Promise<void> {
    const target = url.trim();
    let ownsBrowser = false;
    try {
      const { protocol } = new URL(target);
      if (protocol !== 'https:' && protocol !== 'http:') {
        // Contact rows can contain telephone/email links as well as websites.
        await openSystem(target);
        return;
      }
      if (openingBrowser) return;
      openingBrowser = ownsBrowser = true;
      try {
        // On iOS this stays pending until Done/swipe-to-dismiss, keeping the
        // underlying screen intact and preventing a second browser sheet.
        await openBrowser(target);
      } catch {
        // An unavailable browser/native module must not strand a booking link.
        await openSystem(target);
      }
    } catch (error) {
      handleError(error);
    } finally {
      if (ownsBrowser) openingBrowser = false;
    }
  };
}
