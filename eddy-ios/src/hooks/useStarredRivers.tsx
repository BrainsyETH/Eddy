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
  migrateLegacyStars,
  toggleLocal,
  visibleStars,
  type LocalStar,
} from '@eddy/sync';
import { fetchStarredRivers, starRiver, unstarRiver } from '@/api/client';
import { useSession } from '@/hooks/useSession';

// v2 carries tombstones; v1 was a plain list of starred rivers. Reading the old
// key and writing the new one means an upgrade never loses stars.
const STORAGE_KEY = 'eddy.starredRivers.v2';
const LEGACY_KEY = 'eddy.starredRivers.v1';

export interface StarredRiver {
  riverId: string;
  name: string;
  slug: string;
  starredAt: string;
}

interface StarredRiversValue {
  starred: StarredRiver[];
  /** False until the first load from disk completes. */
  ready: boolean;
  isStarred: (riverId: string) => boolean;
  toggleStar: (river: Omit<StarredRiver, 'starredAt'>) => void;
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
  entriesRef.current = entries;

  const persist = useCallback((next: LocalStar[]) => {
    // Fire-and-forget: in-memory state is already updated, so a failed write
    // costs at most this session's changes rather than blocking the tap.
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  // Load once on mount, migrating the v1 payload if that is what is there.
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const current = await AsyncStorage.getItem(STORAGE_KEY);
        if (current) {
          if (!cancelled) setEntries(migrateLegacyStars(JSON.parse(current)));
          return;
        }
        const legacy = await AsyncStorage.getItem(LEGACY_KEY);
        if (legacy) {
          const migrated = migrateLegacyStars(JSON.parse(legacy));
          if (!cancelled) setEntries(migrated);
          persist(migrated);
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
      const server = await fetchStarredRivers(token);
      // null means the session was rejected — not "the server has no stars".
      // Treating those the same would re-push everything and prune every
      // tombstone against an empty set.
      if (!server) return;

      const plan = mergeStars(entriesRef.current, server);

      await Promise.all([
        ...plan.toStar.map((riverId) => starRiver(token, riverId)),
        ...plan.toUnstar.map((riverId) => unstarRiver(token, riverId)),
      ]);

      // Tombstones that were just deleted server-side have done their job.
      const settled = plan.toUnstar.length
        ? plan.merged.filter((e) => e.starred || !plan.toUnstar.includes(e.riverId))
        : plan.merged;

      setEntries(settled);
      persist(settled);
    } catch (err) {
      // Offline, rate-limited, or the backend is down. The local store is
      // authoritative regardless, so this is never surfaced to the user.
      console.warn('[stars] sync failed', err);
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
    (river: Omit<StarredRiver, 'starredAt'>) => {
      setEntries((current) => {
        const next = toggleLocal(current, river, new Date().toISOString());
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
    const ids = new Set(visible.map((r) => r.riverId));
    return {
      starred: visible.map((entry) => ({
        riverId: entry.riverId,
        name: entry.name,
        slug: entry.slug,
        starredAt: entry.updatedAt,
      })),
      ready,
      syncing,
      isStarred: (riverId: string) => ids.has(riverId),
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
