import type { StylePackCounts } from './tripDownload';

export type StylePackRead =
  | { kind: 'counts'; counts: StylePackCounts }
  | { kind: 'unconfirmed'; reason: 'module-missing' | 'native-unconfirmed' | 'timeout' | 'read-failed' };

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
