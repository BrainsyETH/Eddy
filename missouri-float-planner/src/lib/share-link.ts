// src/lib/share-link.ts
// The one way the website shares a link: the native share sheet on touch
// devices, the clipboard elsewhere. Seven buttons once each carried their own
// copy of this and drifted, so three of them copied the link when the person
// cancelled the sheet (docs/SHARING_PREVIEWS.md forbids that).
//
// Gauge, dam and chart shares (StationShareButton, ChartShareControls) keep
// their own flow: ADR 0015 gives them no cross-fallback between share and copy.

export interface ShareLink {
  /** Absolute URL. Callers pass a canonical one, not the address bar. */
  url: string;
  title?: string;
}

/**
 * - `shared`: the native sheet completed.
 * - `copied`: the link is on the clipboard.
 * - `cancelled`: the person dismissed the sheet, or a share was already open.
 *   Nothing was shared or copied, and nothing should be shown or counted.
 * - `failed`: neither sharing nor copying worked. Say so.
 */
export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

export interface ShareEnvironment {
  /** Touch-first device: the native sheet is the expected control there. */
  coarsePointer: boolean;
  share?: (data: { url: string; title?: string }) => Promise<void>;
  writeText?: (text: string) => Promise<void>;
}

export function browserShareEnvironment(): ShareEnvironment {
  return {
    coarsePointer: window.matchMedia('(pointer: coarse)').matches,
    share: typeof navigator.share === 'function' ? data => navigator.share(data) : undefined,
    writeText: navigator.clipboard?.writeText ? text => navigator.clipboard.writeText(text) : undefined,
  };
}

// A share sheet is modal for the whole page: a second tap while one is open
// would reject, and must not fall through to a copy behind the sheet.
let sheetOpen = false;

export async function shareOrCopy(
  link: ShareLink,
  environment: ShareEnvironment = browserShareEnvironment(),
): Promise<ShareOutcome> {
  if (sheetOpen) return 'cancelled';

  if (environment.coarsePointer && environment.share) {
    sheetOpen = true;
    try {
      await environment.share(link.title ? { title: link.title, url: link.url } : { url: link.url });
      return 'shared';
    } catch (error) {
      // Dismissing the sheet is a decision, not a failure.
      if (error instanceof Error && error.name === 'AbortError') return 'cancelled';
      // Anything else (unsupported data, a lapsed activation) still deserves the link.
    } finally {
      sheetOpen = false;
    }
  }

  if (!environment.writeText) return 'failed';
  try {
    await environment.writeText(link.url);
    return 'copied';
  } catch {
    return 'failed';
  }
}

/** The page's own origin plus a canonical path, without the address bar's query or hash. */
export function canonicalShareUrl(path: string): string {
  return `${window.location.origin}${path}`;
}
