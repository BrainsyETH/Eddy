// eddy-ios/src/hooks/useStarredRivers.tsx
// Local-first starred rivers, with the server as a replica rather than a source.
//
// Stars work with NO account and NO network. That is a product decision, not a
// shortcut: starring is the investment mechanic that comes before any paywall
// ask, so it must cost the user nothing — no sign-up, no signal, no wait. Writes
// are optimistic and persisted immediately; a star tap must never show a spinner
// or fail because the river is out of coverage.
//
// Syncing is therefore strictly additive. Everything below still works with the
// session permanently unavailable — which is the state today, since anonymous
// sign-ins are off in the Supabase dashboard.
//
// The reconciliation itself lives in packages/eddy-sync because it is pure, it
// encodes a correctness rule (an unstar must not be resurrected by the server
// copy), and it needs tests the app has no runner for.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  addStars,
  mergeStars,
  migrateStars,
  toggleLocal,
  visibleStars,
  type LocalStar,
  type StarKind,
} from '@eddy/sync';
import {
  fetchStarredDams,
  fetchStarredGauges,
  fetchStarredRivers,
  starDam,
  starGauge,
  starRiver,
  unstarDam,
  unstarGauge,
  unstarRiver,
} from '@/api/client';
import { useSession } from '@/hooks/useSession';
import { warn } from '@/lib/monitoring';

// v3 carries gauges as well as rivers; v2 carried tombstones; v1 was a plain
// list of starred rivers. Each older key is READ and left in place — a rollback
// to a previous build must not find an empty store, and the payload is a few
// hundred bytes. The namespace changed with v3 because "starredRivers" is no
// longer what it holds.
const STORAGE_KEY = 'eddy.stars.v3';
const LEGACY_KEYS = ['eddy.starredRivers.v2', 'eddy.starredRivers.v1'];

/** A starred river or gauge, as the UI consumes it. */
export interface StarredItem {
  kind: StarKind;
  /** A river id or a gauge station id, depending on `kind`. */
  entityId: string;
  name: string;
  /** The river route this opens. Empty for a gauge that rates no river. */
  slug: string;
  usgsSiteId?: string | null;
  provider?: string | null;
  starredAt: string;
}

interface StarredRiversValue {
  starred: StarredItem[];
  /** False until the first load from disk completes. */
  ready: boolean;
  isStarred: (kind: StarKind, entityId: string) => boolean;
  toggleStar: (item: Omit<StarredItem, 'starredAt'>) => void;
  /**
   * Stars several entities at once WITHOUT unstarring any of them.
   *
   * First-run onboarding follows a handful of rivers in one press, and some of
   * them may already be starred on the account. `toggleStar` in a loop would
   * turn those off. See addStars in packages/eddy-sync.
   */
  followStars: (items: Omit<StarredItem, 'starredAt'>[]) => void;
  /** True while a background reconciliation is in flight. Never blocks the UI. */
  syncing: boolean;
}

const StarredRiversContext = createContext<StarredRiversValue>({
  starred: [],
  ready: false,
  isStarred: () => false,
  toggleStar: () => {},
  followStars: () => {},
  syncing: false,
});

export function StarredRiversProvider({ children }: { children: ReactNode }) {
  const [entries, setEntries] = useState<LocalStar[]>([]);
  const [ready, setReady] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const { session, getAccessToken } = useSession();

  // The store is read inside sync() without being a dependency of it — a stale
  // closure there would reconcile against an out-of-date local set and undo a
  // star the user made moments earlier.
  const entriesRef = useRef<LocalStar[]>([]);
  // Written in an effect, not during RENDER. A ref mutated during render is a
  // React rule violation (it breaks under StrictMode's double render and under
  // concurrent rendering, where a render can be thrown away), and React 19's
  // lint rejects it.
  //
  // That ban is on render only. `toggleStar` writes this ref directly, and has
  // to: it calls sync() in the same tick, before this effect has run, so the
  // effect alone left sync() reconciling against the set as it was BEFORE the
  // tap that triggered it.
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

  // ── Why a sync needs a generation, and a queue ──────────────────────────
  //
  // sync() snapshots the local set, then awaits a fetch and a round of pushes —
  // seconds, on the connection this app is used on — and then commits the
  // merged result as authoritative. A star toggled during that window was not
  // in the snapshot, so committing overwrote it in memory AND on disk; and it
  // was never pushed either, so no later sync could bring it back. A tap
  // silently undone is the one failure this store must not have.
  //
  // `mutationGen` marks the local set as changed. A sync that finds it moved
  // since its snapshot declines to commit and asks for another pass instead of
  // publishing a stale answer.
  //
  // `syncInFlight`/`syncQueued` keep the passes from overlapping at all, so two
  // runs cannot push contradictory stars and unstars for the same id at once.
  // Between them: the local store stays authoritative, and every tap survives.
  const mutationGen = useRef(0);
  const syncInFlight = useRef(false);
  const syncQueued = useRef(false);
  // The trailing pass is started through this rather than by sync() naming
  // itself: a useCallback whose body references its own binding cannot be
  // memoized by the React compiler, which fails the lint outright. Written in
  // an effect below, and only ever read long after mount.
  const syncRef = useRef<(() => void) | null>(null);

  const persist = useCallback((next: LocalStar[]) => {
    // Fire-and-forget: in-memory state is already updated, so a failed write
    // costs at most this session's changes rather than blocking the tap.
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  // Load once on mount, reading whichever stored version is present. Newest
  // key first, then each legacy key in turn; migrateStars understands all three
  // and stamps `kind: 'river'` on anything that predates gauges — TOMBSTONES
  // INCLUDED, or an unstar made before the upgrade comes straight back on the
  // next sync.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const current = await AsyncStorage.getItem(STORAGE_KEY);
        if (current) {
          if (!cancelled) setEntries(migrateStars(JSON.parse(current)));
          return;
        }
        for (const key of LEGACY_KEYS) {
          const legacy = await AsyncStorage.getItem(key);
          if (!legacy) continue;
          const migrated = migrateStars(JSON.parse(legacy));
          if (!cancelled) setEntries(migrated);
          persist(migrated);
          return;
        }
      } catch {
        // Unreadable or corrupt store: start empty rather than blocking launch.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [persist]);

  /**
   * Reconciles with the server. Safe to call at any time and safe to fail.
   *
   * The pushes run BEFORE the merged set is persisted so that a push failure
   * leaves the local store untouched and the next attempt tries again. Writing
   * first would let a dropped DELETE look like a completed unstar.
   */
  const sync = useCallback(async () => {
    // One pass at a time. A second caller leaves a note rather than starting a
    // parallel round of pushes against the same ids.
    if (syncInFlight.current) {
      syncQueued.current = true;
      return;
    }
    syncInFlight.current = true;

    try {
      const token = await getAccessToken();
      if (!token) return;

      // Captured with the snapshot below, and checked against it before this
      // pass is allowed to publish anything.
      const gen = mutationGen.current;

      setSyncing(true);
      // Fetched together, merged SEPARATELY. Each null is its own story: a
      // rejected session, or — for gauges — a backend that predates the
      // endpoint, which is guaranteed to exist for as long as an App Store
      // review takes. Neither may be read as "the server has nothing", which
      // would re-push everything and prune every tombstone against an empty set.
      const [riverServer, gaugeServer, damServer] = await Promise.all([
        // Independently resilient: one kind failing must not cost the others
        // their reconciliation, and no failure may be read as "the server has
        // nothing" — which would re-push everything and prune every tombstone.
        fetchStarredRivers(token).catch(() => null),
        fetchStarredGauges(token),
        fetchStarredDams(token),
      ]);
      if (!riverServer && !gaugeServer && !damServer) return;

      let merged = entriesRef.current;
      const settledIds: string[] = [];

      // One kind at a time, chained. mergeStars carries the other kind through
      // untouched — see the note in @eddy/sync for why merging both against a
      // unioned list would push gauge ids to the rivers endpoint and prune every
      // gauge tombstone the moment one of the two fetches failed.
      if (riverServer) {
        const plan = mergeStars(merged, riverServer, 'river');
        await Promise.all([
          ...plan.toStar.map((id) => starRiver(token, id)),
          ...plan.toUnstar.map((id) => unstarRiver(token, id)),
        ]);
        merged = plan.merged;
        settledIds.push(...plan.toUnstar);
      }

      if (gaugeServer) {
        const plan = mergeStars(merged, gaugeServer, 'gauge');
        await Promise.all([
          ...plan.toStar.map((id) => starGauge(token, id)),
          ...plan.toUnstar.map((id) => unstarGauge(token, id)),
        ]);
        merged = plan.merged;
        settledIds.push(...plan.toUnstar);
      }

      if (damServer) {
        const plan = mergeStars(merged, damServer, 'dam');
        await Promise.all([
          ...plan.toStar.map((id) => starDam(token, id)),
          ...plan.toUnstar.map((id) => unstarDam(token, id)),
        ]);
        merged = plan.merged;
        settledIds.push(...plan.toUnstar);
      }

      // The local set moved while this pass was on the wire, so `merged` is
      // built on a snapshot that no longer describes what the user wants.
      // Publishing it would undo their tap. Drop the result — the pushes above
      // already happened and are idempotent — and let the trailing pass merge
      // against the current set and a server that now reflects them.
      //
      // Tombstone pruning is skipped with it, deliberately: a tombstone kept
      // one pass too long is re-sent and re-settled, which costs a request. A
      // star dropped is gone.
      if (mutationGen.current !== gen) {
        syncQueued.current = true;
        return;
      }

      // Tombstones that were just deleted server-side have done their job.
      const settled = settledIds.length
        ? merged.filter((e) => e.starred || !settledIds.includes(e.entityId))
        : merged;

      entriesRef.current = settled;
      setEntries(settled);
      persist(settled);
    } catch (err) {
      // Offline, rate-limited, or the backend is down. The local store is
      // authoritative regardless, so this is never surfaced to the user.
      warn('stars', 'sync failed', err);
    } finally {
      setSyncing(false);
      syncInFlight.current = false;
      // Whatever asked for another pass — an overlapping caller, or this one
      // declining to publish — gets it now that the wire is free.
      if (syncQueued.current) {
        syncQueued.current = false;
        syncRef.current?.();
      }
    }
  }, [getAccessToken, persist]);

  useEffect(() => {
    syncRef.current = () => {
      void sync();
    };
  }, [sync]);

  // Sync once the local store is loaded and a session exists. Ordering matters:
  // syncing before the disk read would merge against an empty local set and
  // push nothing while adopting everything.
  useEffect(() => {
    if (!ready || !session) return;
    sync();
  }, [ready, session, sync]);

  const toggleStar = useCallback(
    (item: Omit<StarredItem, 'starredAt'>) => {
      // Computed off the REF rather than inside a functional update, so the
      // three things that follow all describe the same set. sync() is called
      // below in this same tick — before any effect has run — so a ref written
      // only by an effect would hand it the pre-tap set and let the pass
      // overwrite this tap. This is an event handler, not a render, so writing
      // the ref here is allowed; see the note beside its declaration.
      const next = toggleLocal(entriesRef.current, item, new Date().toISOString());
      entriesRef.current = next;
      // Any pass already on the wire is now reconciling a stale set and must
      // not publish its result.
      mutationGen.current += 1;
      setEntries(next);
      persist(next);
      // Push in the background. If it fails the local tombstone or star stays
      // put and the next sync resolves it — which is the point of tombstones.
      void sync();
    },
    [persist, sync],
  );

  const followStars = useCallback(
    (items: Omit<StarredItem, 'starredAt'>[]) => {
      if (items.length === 0) return;
      // One timestamp for the batch: these were all chosen by the same press,
      // and giving them separate clock reads would order them arbitrarily in
      // Favorites for no reason a user could see.
      const now = new Date().toISOString();
      // Same three guards as toggleStar, for the same reason — and the moment
      // this runs is the one where they matter MOST. The first-run picker
      // fires this right after the first sign-in, which is exactly when the
      // mount sync is on the wire; a pass that snapshotted the pre-follow set
      // would sail through the generation check and commit over the follows,
      // in memory and on disk, unpushed — the erased stars gone with nothing
      // left for a later sync to restore. This took only the setEntries path,
      // so the gen never bumped and sync() below read a ref an effect had not
      // flushed yet.
      const next = addStars(entriesRef.current, items, now);
      entriesRef.current = next;
      mutationGen.current += 1;
      setEntries(next);
      persist(next);
      void sync();
    },
    [persist, sync],
  );

  const value = useMemo<StarredRiversValue>(() => {
    const visible = visibleStars(entries);
    // Keyed on the PAIR: a river and a gauge could carry the same uuid, and a
    // bare id set would report one as starred because the other is.
    const keys = new Set(visible.map((e) => `${e.kind}:${e.entityId}`));
    return {
      starred: visible.map((entry) => ({
        kind: entry.kind,
        entityId: entry.entityId,
        name: entry.name,
        slug: entry.slug,
        usgsSiteId: entry.usgsSiteId ?? null,
        provider: entry.provider ?? null,
        starredAt: entry.updatedAt,
      })),
      ready,
      syncing,
      isStarred: (kind: StarKind, entityId: string) => keys.has(`${kind}:${entityId}`),
      toggleStar,
      followStars,
    };
  }, [entries, ready, syncing, toggleStar, followStars]);

  return (
    <StarredRiversContext.Provider value={value}>{children}</StarredRiversContext.Provider>
  );
}

export function useStarredRivers(): StarredRiversValue {
  return useContext(StarredRiversContext);
}
