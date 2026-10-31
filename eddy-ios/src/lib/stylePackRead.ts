import type { StylePackCounts } from './tripDownload';

export type StylePackRead =
  | { kind: 'counts'; counts: StylePackCounts }
  | { kind: 'unconfirmed'; reason: 'module-missing' | 'native-unconfirmed' | 'timeout' | 'read-failed' };

/**
 * What the offline map card says once every map tile is saved but the style
 * is not confirmed complete. Two answers in Eddy's words, never the
 * implementation's: a download that is short of something, and a check that
 * could not tell. "Almost ready, check again" was shown for both and promised
 * progress nothing was making.
 *
 * - The style is short of files, or the store confirms it has none: the
 *   download is incomplete, and Finish download (a resume reloads the style)
 *   is what fixes it.
 * - The check got no answer or could not read the store: nothing is known
 *   about the download, so the action is Check again, not another download.
 * - A build without the checker: only an update can tell.
 */
export interface TilesSavedCopy {
  title: string;
  note: string | null;
  action: 'finish' | 'check' | null;
}

export function tilesSavedCopy(read: StylePackRead | null): TilesSavedCopy {
  if (read?.kind === 'counts' || (read?.kind === 'unconfirmed' && read.reason === 'native-unconfirmed')) {
    return { title: 'Download incomplete', note: 'Connect to finish downloading.', action: 'finish' };
  }
  if (read?.kind === 'unconfirmed' && read.reason === 'module-missing') {
    return { title: 'Couldn’t check offline map', note: 'Update Eddy before relying on this map offline.', action: null };
  }
  return { title: 'Couldn’t check offline map', note: null, action: 'check' };
}

/** Keep a failed check distinct from a download that is actually progressing. */
export async function inspectStylePack(
  read: (() => Promise<StylePackCounts | null>) | null,
  timeoutMs = 8_000,
): Promise<StylePackRead> {
  if (!read) return { kind: 'unconfirmed', reason: 'module-missing' };
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      read().then((counts): StylePackRead => counts
        ? { kind: 'counts', counts }
        : { kind: 'unconfirmed', reason: 'native-unconfirmed' }),
      new Promise<StylePackRead>(resolve => {
        timer = setTimeout(() => resolve({ kind: 'unconfirmed', reason: 'timeout' }), timeoutMs);
      }),
    ]);
  } catch {
    return { kind: 'unconfirmed', reason: 'read-failed' };
  } finally {
    clearTimeout(timer);
  }
}
