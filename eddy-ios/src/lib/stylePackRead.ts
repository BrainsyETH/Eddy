import type { StylePackCounts } from './tripDownload';

export type StylePackRead =
  | { kind: 'counts'; counts: StylePackCounts }
  | { kind: 'unconfirmed'; reason: 'module-missing' | 'native-unconfirmed' | 'timeout' | 'read-failed' };

/**
 * What the offline map card says once every map tile is saved but the style
 * (style, sprites, fonts) is not confirmed complete. One sentence per thing the
 * check actually learned: a style still short of its files, a style Mapbox has
 * no record of, a check that got no answer, and a build without the checker.
 * "Almost ready, check again" was shown for all of them and promised progress
 * nothing was making. `finish` re-requests the style (a resume reloads it).
 */
export interface TilesSavedCopy {
  title: string;
  note: string;
  action: 'finish' | null;
}

export function tilesSavedCopy(read: StylePackRead | null): TilesSavedCopy {
  if (read?.kind === 'counts') {
    const { requiredResourceCount: required, completedResourceCount: completed } = read.counts;
    const percent = required > 0 ? Math.min(99, Math.floor((completed / required) * 100)) : 0;
    return {
      title: 'Map style not finished',
      note: `Map tiles are saved. The map style is ${percent}% downloaded. Finish the download with signal so the map draws offline.`,
      action: 'finish',
    };
  }
  if (read?.kind === 'unconfirmed' && read.reason === 'module-missing') {
    return { title: 'Map style not confirmed', note: 'Update Eddy before relying on this map offline.', action: null };
  }
  if (read?.kind === 'unconfirmed' && read.reason === 'native-unconfirmed') {
    return {
      title: 'Map style not saved',
      note: 'Map tiles are saved, but the map style isn’t. Finish the download with signal so the map draws offline.',
      action: 'finish',
    };
  }
  return {
    title: 'Map style not confirmed',
    note: 'Map tiles are saved. Eddy couldn’t confirm the map style on this phone, so the background map may not draw offline.',
    action: 'finish',
  };
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
