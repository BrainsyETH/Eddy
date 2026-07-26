// packages/eddy-sync/index.ts
// Reconciling local-first starred rivers with the server copy.
//
// WHY THIS IS HARDER THAN A UNION: the obvious merge — take every river either
// side thinks is starred — silently resurrects rivers the user deliberately
// unstarred. Device A unstars the Current River, the server still has the row,
// the next sync pulls it back, and the star reappears. Users read that as the
// app ignoring them.
//
// So an unstar has to be represented, not just absent. Local records carry
// `starred: false` TOMBSTONES with the time of the change, and reconciliation
// is last-write-wins per river against the server's own starred_at.
//
// The server has no tombstones of its own — a deleted star is simply an absent
// row — which is fine, because the only thing a missing row can mean is "not
// starred", and its timestamp is irrelevant once it's gone.
//
// Shared rather than app-local for the usual reason: it is pure, it encodes a
// correctness rule, and the app has no test runner. Imports stay relative so
// both Metro and the web's tsx runner resolve them.

/** A river's star state on this device, including explicit unstars. */
export interface LocalStar {
  riverId: string;
  name: string;
  slug: string;
  /** ISO. When the USER last changed this river's state — not when it synced. */
  updatedAt: string;
  /** false is a tombstone: deliberately unstarred, not merely unknown. */
  starred: boolean;
}

/** A row from GET /api/me/starred-rivers. Presence alone means starred. */
export interface ServerStar {
  riverId: string;
  riverName: string;
  riverSlug: string;
  starredAt: string;
}

export interface SyncPlan {
  /** The reconciled local store, ready to persist. */
  merged: LocalStar[];
  /** riverIds to POST — starred here, absent there. */
  toStar: string[];
  /** riverIds to DELETE — unstarred here more recently than the server's row. */
  toUnstar: string[];
}

/** Missing or unparseable timestamps sort oldest, so a real edit always wins. */
function time(iso: string | null | undefined): number {
  const value = Date.parse(iso ?? '');
  return Number.isFinite(value) ? value : 0;
}

/**
 * Reconciles this device's stars with the server's.
 *
 * Call ONLY with a successful server fetch. A failed fetch must not be passed
 * as an empty array — that would look like "the server has nothing", and every
 * local star would be re-pushed while every tombstone was pruned.
 */
export function mergeStars(local: LocalStar[], server: ServerStar[]): SyncPlan {
  const byId = new Map<string, LocalStar>();
  for (const entry of local) {
    if (entry && typeof entry.riverId === 'string') byId.set(entry.riverId, entry);
  }

  const merged: LocalStar[] = [];
  const toStar: string[] = [];
  const toUnstar: string[] = [];
  const seen = new Set<string>();

  for (const row of server) {
    seen.add(row.riverId);
    const mine = byId.get(row.riverId);

    // Unstarred here AFTER the server's row was created: this device is the
    // newer edit, so the row goes. Keep the tombstone until the DELETE lands —
    // dropping it now would let the next sync pull the star straight back.
    if (mine && !mine.starred && time(mine.updatedAt) > time(row.starredAt)) {
      toUnstar.push(row.riverId);
      merged.push(mine);
      continue;
    }

    // Otherwise the server wins: either this device agrees, or another device
    // starred it more recently than our tombstone. Server names are canonical —
    // a river renamed on the web should not keep an old label here.
    merged.push({
      riverId: row.riverId,
      name: row.riverName || mine?.name || '',
      slug: row.riverSlug || mine?.slug || '',
      // Preserve the local edit time when this device already had it starred,
      // so a later unstar elsewhere can still be compared meaningfully.
      updatedAt: mine?.starred ? mine.updatedAt : row.starredAt,
      starred: true,
    });
  }

  for (const entry of byId.values()) {
    if (seen.has(entry.riverId)) continue;

    if (entry.starred) {
      // Starred here, absent there — either it never synced or it was starred
      // while offline. Push it.
      toStar.push(entry.riverId);
      merged.push(entry);
    }
    // A tombstone with no server row is redundant: both sides already agree the
    // river is not starred. Dropping it here is what stops tombstones
    // accumulating forever. Safe because this only runs on a SUCCESSFUL fetch.
  }

  return { merged, toStar, toUnstar };
}

/** The starred subset, newest first — what the UI lists. */
export function visibleStars(local: LocalStar[]): LocalStar[] {
  return local
    .filter((entry) => entry.starred)
    .sort((a, b) => time(b.updatedAt) - time(a.updatedAt));
}

/**
 * Applies a toggle locally, writing a tombstone rather than deleting.
 *
 * `now` is injected so this stays pure and testable — and so a single toggle
 * can't produce two different timestamps.
 */
export function toggleLocal(
  local: LocalStar[],
  river: { riverId: string; name: string; slug: string },
  now: string,
): LocalStar[] {
  const existing = local.find((entry) => entry.riverId === river.riverId);
  const nextStarred = !existing?.starred;
  const rest = local.filter((entry) => entry.riverId !== river.riverId);
  return [{ ...river, updatedAt: now, starred: nextStarred }, ...rest];
}

/**
 * Upgrades the pre-sync v1 payload, which was a plain list of starred rivers
 * with no `starred` field and no tombstones.
 *
 * Everything in it was, by definition, starred — v1 represented an unstar by
 * removing the entry. Anything unrecognisable is dropped rather than thrown
 * on: losing a star is bad, an app that won't launch is worse.
 */
export function migrateLegacyStars(raw: unknown): LocalStar[] {
  if (!Array.isArray(raw)) return [];
  const out: LocalStar[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Partial<LocalStar> & { starredAt?: string };
    if (typeof record.riverId !== 'string' || !record.riverId) continue;
    out.push({
      riverId: record.riverId,
      name: typeof record.name === 'string' ? record.name : '',
      slug: typeof record.slug === 'string' ? record.slug : '',
      updatedAt: record.updatedAt ?? record.starredAt ?? new Date(0).toISOString(),
      starred: typeof record.starred === 'boolean' ? record.starred : true,
    });
  }
  return out;
}
