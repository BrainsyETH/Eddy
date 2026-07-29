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
  starredAt: string;
}

interface StarredRiversValue {
  starred: StarredItem[];
  /** False until the first load from disk completes. */
  ready: boolean;
  isStarred: (kind: StarKind, entityId: string) => boolean;
  toggleStar: (item: Omit<StarredItem, 'starredAt'>) => void;
  /** True while a background reconciliation is in flight. Never blocks the UI. */
  syncing: boolean;
}

const StarredRiversContext = createContext<StarredRiversValue>({
  starred: [],
  ready: false,
  isStarred: () => false,
  toggleStar: () => {},
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
  // Written in an effect, not during render. A ref mutated during render is a
  // React rule violation (it breaks under StrictMode's double render and under
  // concurrent rendering, where a render can be thrown away), and React 19's
  // lint rejects it. An effect is also sufficient here: every reader of this
  // ref — sync() and the handlers that call it — runs after commit.
  useEffect(() => {
    entriesRef.current = entries;
  }, [entries]);

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
    const token = await getAccessToken();
    if (!token) return;

    setSyncing(true);
    try {
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

      // Tombstones that were just deleted server-side have done their job.
      const settled = settledIds.length
        ? merged.filter((e) => e.starred || !settledIds.includes(e.entityId))
        : merged;

      setEntries(settled);
      persist(settled);
    } catch (err) {
      // Offline, rate-limited, or the backend is down. The local store is
      // authoritative regardless, so this is never surfaced to the user.
      warn('stars', 'sync failed', err);
    } finally {
      setSyncing(false);
    }
  }, [getAccessToken, persist]);

  // Sync once the local store is loaded and a session exists. Ordering matters:
  // syncing before the disk read would merge against an empty local set and
  // push nothing while adopting everything.
  useEffect(() => {
    if (!ready || !session) return;
    sync();
  }, [ready, session, sync]);

  const toggleStar = useCallback(
    (item: Omit<StarredItem, 'starredAt'>) => {
      setEntries((current) => {
        const next = toggleLocal(current, item, new Date().toISOString());
        persist(next);
        return next;
      });
      // Push in the background. If it fails the local tombstone or star stays
      // put and the next sync resolves it — which is the point of tombstones.
      sync();
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
        starredAt: entry.updatedAt,
      })),
      ready,
      syncing,
      isStarred: (kind: StarKind, entityId: string) => keys.has(`${kind}:${entityId}`),
      toggleStar,
    };
  }, [entries, ready, syncing, toggleStar]);

  return (
    <StarredRiversContext.Provider value={value}>{children}</StarredRiversContext.Provider>
  );
}

export function useStarredRivers(): StarredRiversValue {
  return useContext(StarredRiversContext);
}
