// eddy-ios/src/lib/chunked-store.ts
// Splits large values across several keys in a small key-value backend.
//
// Deliberately free of any Expo import so it can be unit-tested against an
// in-memory backend — see src/lib/chunked-store.test.ts in the WEB app, which
// is where this repo's pure shared logic is covered. The Keychain wiring lives
// next door in secure-session-store.ts.
//
// ── The problem ──────────────────────────────────────────────────────────
//
// expo-secure-store warns above 2048 bytes per item and does not guarantee
// larger values will store at all. A Supabase session routinely exceeds that:
// it is JSON holding an access JWT plus the full user object, which lands
// between 2 and 4 KB once app_metadata and user_metadata are in it.
//
// ── The failure mode this is shaped around ───────────────────────────────
//
// A TORN WRITE — chunks from two different sessions reassembled into one
// corrupt blob, or a manifest promising more parts than exist. Either would
// hand supabase-js a truncated JSON string, and the throw would surface on a
// cold start with no obvious cause. So:
//
//   * writes clear the previous chunks first, so a shorter value cannot leave
//     a longer one's tail behind for the reader to splice on;
//   * chunks are written BEFORE the manifest, so a crash mid-write leaves
//     orphans rather than a manifest pointing at parts that do not exist;
//   * reads that come up short return null — "no session", which is
//     recoverable — rather than partial data, which is not.

/** The subset of a key-value store this needs. */
export interface ChunkedStoreBackend {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

export interface ChunkedStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
}

/**
 * Comfortably under expo-secure-store's 2048-byte threshold. The headroom
 * covers the limit applying to the ENCODED value: a multibyte character in a
 * display name makes the encoded size exceed the JavaScript string length this
 * slices on.
 */
export const DEFAULT_CHUNK_SIZE = 1024;

/** Marks a chunked value and records how many parts to expect. */
const MANIFEST_PREFIX = '__eddy_chunks__:';

export function chunkKey(key: string, index: number): string {
  return `${key}.${index}`;
}

/** The chunk count a manifest declares, or null if this is a whole value. */
export function manifestCount(value: string): number | null {
  if (!value.startsWith(MANIFEST_PREFIX)) return null;
  const count = Number.parseInt(value.slice(MANIFEST_PREFIX.length), 10);
  return Number.isInteger(count) && count > 0 ? count : null;
}

export function createChunkedStore(
  backend: ChunkedStoreBackend,
  chunkSize: number = DEFAULT_CHUNK_SIZE,
): ChunkedStore {
  async function clearChunks(key: string, count: number): Promise<void> {
    for (let i = 0; i < count; i += 1) {
      await backend.removeItem(chunkKey(key, i)).catch(() => {});
    }
  }

  return {
    async getItem(key) {
      try {
        const head = await backend.getItem(key);
        if (head == null) return null;

        const count = manifestCount(head);
        if (count == null) return head;

        const parts: string[] = [];
        for (let i = 0; i < count; i += 1) {
          const part = await backend.getItem(chunkKey(key, i));
          if (part == null) return null; // see header: short read is no read
          parts.push(part);
        }
        return parts.join('');
      } catch {
        return null;
      }
    },

    async setItem(key, value) {
      try {
        const previous = await backend.getItem(key).catch(() => null);
        const previousCount = previous == null ? null : manifestCount(previous);
        if (previousCount != null) await clearChunks(key, previousCount);

        if (value.length <= chunkSize) {
          await backend.setItem(key, value);
          return;
        }

        const chunks: string[] = [];
        for (let i = 0; i < value.length; i += chunkSize) {
          chunks.push(value.slice(i, i + chunkSize));
        }

        for (let i = 0; i < chunks.length; i += 1) {
          await backend.setItem(chunkKey(key, i), chunks[i]);
        }
        // Manifest last — see header.
        await backend.setItem(key, `${MANIFEST_PREFIX}${chunks.length}`);
      } catch {
        // Non-fatal: the session stays in memory for this launch, and the user
        // signs in again on the next one.
      }
    },

    async removeItem(key) {
      try {
        const head = await backend.getItem(key).catch(() => null);
        const count = head == null ? null : manifestCount(head);
        if (count != null) await clearChunks(key, count);
        await backend.removeItem(key);
      } catch {
        // ignore
      }
    },
  };
}
