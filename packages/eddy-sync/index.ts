// packages/eddy-sync/index.ts
// Reconciling local-first stars — rivers and gauges — with the server copy.
//
// WHY THIS IS HARDER THAN A UNION: the obvious merge — take everything either
// side thinks is starred — silently resurrects what the user deliberately
// unstarred. Device A unstars the Current River, the server still has the row,
// the next sync pulls it back, and the star reappears. Users read that as the
// app ignoring them.
//
// So an unstar has to be represented, not just absent. Local records carry
// `starred: false` TOMBSTONES with the time of the change, and reconciliation
// is last-write-wins per entity against the server's own starred_at.
//
// The server has no tombstones of its own — a deleted star is simply an absent
// row — which is fine, because the only thing a missing row can mean is "not
// starred", and its timestamp is irrelevant once it's gone.
//
// ── Three kinds, three endpoints, ONE store ─────────────────────────────────
// Rivers, gauges and dams live in one local array so Favorites can order them
// on one clock and the tombstone rule has exactly one implementation. But they
// sync through separate endpoints, which makes `kind` load-bearing rather than
// descriptive: mergeStars is told which kind it is reconciling and must pass
// every entry of the OTHER kinds through untouched.
//
// Get that wrong and the damage is silent and total. With both kinds in one
// array and only the rivers endpoint answered, every gauge star would be
// pushed to /api/me/starred-rivers as a river id, and every gauge tombstone
// would be pruned as "redundant" — the server has no row, so both sides appear
// to agree. That is also why the two are merged in sequence rather than against
// a unioned server list: the gauge endpoint can 404 against an older deploy,
// and a union would then be a lie in exactly this shape.
//
// Shared rather than app-local for the usual reason: it is pure, it encodes a
// correctness rule, and the app has no test runner. Imports stay relative so
// both Metro and the web's tsx runner resolve them.

/**
 * What a star points at.
 *
 * `dam` is the odd one and the difference is worth knowing before writing any
 * storage for it: a river id and a gauge station id are UUIDs from tables Eddy
 * owns, while a dam id is a SLUG from the USACE registry in the web app's
 * source (`swl-clearwater-dam`). Nine of the ten dams have no database row of
 * any kind — they are read through from CWMS and SWPA on request — so a star on
 * one cannot be a foreign key the way the other two are.
 */
export type StarKind = 'river' | 'gauge' | 'dam';

/** An entity's star state on this device, including explicit unstars. */
export interface LocalStar {
  kind: StarKind;
  /** A river id, a gauge station id, or a dam's registry slug, per `kind`. */
  entityId: string;
  name: string;
  /**
   * The river route this entry opens. For a gauge that is the river it is
   * primary for, which may be absent — a gauge rating no river has nowhere to
   * go, and an empty slug is how that is expressed. For a dam it is the
   * tailwater river when there is one, and empty otherwise: a dam opens its own
   * screen, keyed on `entityId`, not a river's.
   */
  slug: string;
  /** Gauges only: the provider-native site id behind the reading. */
  usgsSiteId?: string | null;
  /** Gauges only: registry id for the station's publisher. */
  provider?: string | null;
  /** ISO. When the USER last changed this entity's state — not when it synced. */
  updatedAt: string;
  /** false is a tombstone: deliberately unstarred, not merely unknown. */
  starred: boolean;
}

/**
 * A row from one of the starred endpoints, normalised by the caller.
 *
 * Normalising in the API client rather than here keeps this module wire-
 * agnostic: /api/me/starred-rivers and /api/me/starred-gauges name their fields
 * differently, and neither shape belongs in a reconciliation rule.
 */
export interface ServerStar {
  kind: StarKind;
  entityId: string;
  name: string;
  slug: string;
  usgsSiteId?: string | null;
  provider?: string | null;
  starredAt: string;
}

export interface SyncPlan {
  /** The reconciled local store — BOTH kinds — ready to persist. */
  merged: LocalStar[];
  /** Entity ids to POST — starred here, absent there. Always the merged kind. */
  toStar: string[];
  /** Entity ids to DELETE — unstarred here more recently than the server's row. */
  toUnstar: string[];
}

/** Missing or unparseable timestamps sort oldest, so a real edit always wins. */
function time(iso: string | null | undefined): number {
  const value = Date.parse(iso ?? '');
  return Number.isFinite(value) ? value : 0;
}

/**
 * Identity across both kinds.
 *
 * A river and a gauge could in principle carry the same uuid; keying on the id
 * alone would let one overwrite the other in the store.
 */
function starKey(kind: StarKind, entityId: string): string {
  return `${kind}:${entityId}`;
}

/**
 * Reconciles this device's stars OF ONE KIND with that kind's server list.
 *
 * Call ONLY with a successful server fetch. A failed fetch must not be passed
 * as an empty array — that would look like "the server has nothing", and every
 * local star of this kind would be re-pushed while every tombstone was pruned.
 *
 * Entries of any other kind are carried through `merged` untouched and are
 * never eligible for `toStar`, `toUnstar`, or tombstone pruning. Chain the
 * calls to sync both:
 *
 *     let merged = local;
 *     if (rivers) { const p = mergeStars(merged, rivers, 'river'); merged = p.merged; … }
 *     if (gauges) { const p = mergeStars(merged, gauges, 'gauge'); merged = p.merged; … }
 */
export function mergeStars(local: LocalStar[], server: ServerStar[], kind: StarKind): SyncPlan {
  const byKey = new Map<string, LocalStar>();
  /** Everything this call must not touch, preserved in order. */
  const otherKinds: LocalStar[] = [];

  for (const entry of local) {
    if (!entry || typeof entry.entityId !== 'string') continue;
    if (entry.kind !== kind) {
      otherKinds.push(entry);
      continue;
    }
    byKey.set(starKey(entry.kind, entry.entityId), entry);
  }

  const merged: LocalStar[] = [...otherKinds];
  const toStar: string[] = [];
  const toUnstar: string[] = [];
  const seen = new Set<string>();

  for (const row of server) {
    const key = starKey(kind, row.entityId);
    seen.add(key);
    const mine = byKey.get(key);

    // Unstarred here AFTER the server's row was created: this device is the
    // newer edit, so the row goes. Keep the tombstone until the DELETE lands —
    // dropping it now would let the next sync pull the star straight back.
    if (mine && !mine.starred && time(mine.updatedAt) > time(row.starredAt)) {
      toUnstar.push(row.entityId);
      merged.push(mine);
      continue;
    }

    // Otherwise the server wins: either this device agrees, or another device
    // starred it more recently than our tombstone. Server names are canonical —
    // something renamed on the web should not keep an old label here.
    merged.push({
      kind,
      entityId: row.entityId,
      name: row.name || mine?.name || '',
      slug: row.slug || mine?.slug || '',
      usgsSiteId: row.usgsSiteId ?? mine?.usgsSiteId ?? null,
      provider: row.provider ?? mine?.provider ?? null,
      // Preserve the local edit time when this device already had it starred,
      // so a later unstar elsewhere can still be compared meaningfully.
      updatedAt: mine?.starred ? mine.updatedAt : row.starredAt,
      starred: true,
    });
  }

  for (const entry of byKey.values()) {
    if (seen.has(starKey(entry.kind, entry.entityId))) continue;

    if (entry.starred) {
      // Starred here, absent there — either it never synced or it was starred
      // while offline. Push it.
      toStar.push(entry.entityId);
      merged.push(entry);
    }
    // A tombstone with no server row is redundant: both sides already agree it
    // is not starred. Dropping it here is what stops tombstones accumulating
    // forever. Safe because this only runs on a SUCCESSFUL fetch — and only for
    // the kind being merged, which is what the otherKinds split above protects.
  }

  return { merged, toStar, toUnstar };
}

/** The starred subset, newest first — what the UI lists. Both kinds, one clock. */
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
  entity: Pick<LocalStar, 'kind' | 'entityId' | 'name' | 'slug'> & {
    usgsSiteId?: string | null;
    provider?: string | null;
  },
  now: string,
): LocalStar[] {
  const key = starKey(entity.kind, entity.entityId);
  const existing = local.find((entry) => starKey(entry.kind, entry.entityId) === key);
  const nextStarred = !existing?.starred;
  const rest = local.filter((entry) => starKey(entry.kind, entry.entityId) !== key);
  return [{ ...entity, updatedAt: now, starred: nextStarred }, ...rest];
}

/**
 * Stars several entities at once, without unstarring anything.
 *
 * ── Why this is not a loop over toggleLocal ─────────────────────────────────
 * toggleLocal FLIPS. Handed a river this device already has starred it produces
 * an unstar, which is correct for a tap on a star button and catastrophic for
 * first-run onboarding: a signed-in reinstall syncs the account's stars down,
 * the picker offers those same rivers, and "Follow" would silently tombstone
 * every one the user picked — the exact opposite of what they pressed.
 *
 * So this SETS rather than flips. Already starred is a no-op that keeps the
 * original `updatedAt`, because the user did not change anything and moving the
 * timestamp would let this device win a last-write-wins race it has no claim to.
 * A tombstone is resurrected with `now`, which is a real edit and must win.
 *
 * Duplicate entries in `entities` collapse to one, so a caller need not dedupe.
 * `now` is injected for the same reasons as toggleLocal's.
 */
export function addStars(
  local: LocalStar[],
  entities: Array<
    Pick<LocalStar, 'kind' | 'entityId' | 'name' | 'slug'> & {
      usgsSiteId?: string | null;
      provider?: string | null;
    }
  >,
  now: string,
): LocalStar[] {
  const byKey = new Map<string, LocalStar>();
  for (const entry of local) {
    if (!entry || typeof entry.entityId !== 'string') continue;
    byKey.set(starKey(entry.kind, entry.entityId), entry);
  }

  /** Newly starred, newest-first like toggleLocal's output. */
  const added: LocalStar[] = [];
  const handled = new Set<string>();

  for (const entity of entities) {
    if (!entity || typeof entity.entityId !== 'string' || !entity.entityId) continue;
    const key = starKey(entity.kind, entity.entityId);
    if (handled.has(key)) continue;
    handled.add(key);

    const existing = byKey.get(key);
    if (existing?.starred) continue; // Already on. Leave its timestamp alone.

    byKey.delete(key);
    added.push({ ...entity, updatedAt: now, starred: true });
  }

  // Untouched entries keep their relative order; the new stars go in front,
  // which is what visibleStars' newest-first ordering would do anyway.
  return [...added, ...local.filter((entry) => byKey.has(starKey(entry.kind, entry.entityId)))];
}

/**
 * Reads any stored payload — v3, v2 or the pre-sync v1 — into the current shape.
 *
 * v1 was a plain list of starred rivers with no `starred` field and no
 * tombstones: everything in it was starred by definition, because v1 expressed
 * an unstar by removing the entry. v2 added tombstones and keyed on `riverId`.
 * v3 adds `kind` and renames the key to `entityId`.
 *
 * TOMBSTONES MUST SURVIVE THE UPGRADE. A v2 tombstone exists precisely because
 * the server row still exists; dropping it here would let the next sync pull
 * that star straight back, which is the one failure this whole module is built
 * to prevent.
 *
 * Anything unrecognisable is dropped rather than thrown on: losing a star is
 * bad, an app that won't launch is worse.
 */
export function migrateStars(raw: unknown): LocalStar[] {
  if (!Array.isArray(raw)) return [];
  const out: LocalStar[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const record = entry as Partial<LocalStar> & { riverId?: string; starredAt?: string };

    // v3 uses entityId; v1 and v2 used riverId. Either is accepted, and an
    // absent `kind` means the payload predates gauges — so it is a river.
    const entityId =
      typeof record.entityId === 'string' && record.entityId
        ? record.entityId
        : typeof record.riverId === 'string' && record.riverId
          ? record.riverId
          : null;
    if (!entityId) continue;

    // An absent or unrecognised `kind` means the payload predates gauges — so
    // it is a river. Listed explicitly rather than defaulted through a chain,
    // so adding a fourth kind is one entry and not one more ternary.
    const kind: StarKind =
      record.kind === 'gauge' || record.kind === 'dam' ? record.kind : 'river';

    out.push({
      kind,
      entityId,
      name: typeof record.name === 'string' ? record.name : '',
      slug: typeof record.slug === 'string' ? record.slug : '',
      usgsSiteId: typeof record.usgsSiteId === 'string' ? record.usgsSiteId : null,
      provider: typeof record.provider === 'string' ? record.provider : null,
      updatedAt: record.updatedAt ?? record.starredAt ?? new Date(0).toISOString(),
      // Only v1 lacks the field entirely, and in v1 presence meant starred.
      starred: typeof record.starred === 'boolean' ? record.starred : true,
    });
  }
  return out;
}

/**
 * @deprecated Use {@link migrateStars}, which reads every stored version.
 * Kept as an alias so the rename lands in one commit without a flag day.
 */
export const migrateLegacyStars = migrateStars;
