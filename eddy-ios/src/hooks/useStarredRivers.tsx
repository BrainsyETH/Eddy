// eddy-ios/src/hooks/useStarredRivers.tsx
// Local-first starred rivers.
//
// Stars work with NO account and NO network. That is a product decision, not a
// shortcut: starring is the investment mechanic that comes before any paywall
// ask, so it must cost the user nothing — no sign-up, no signal, no wait. The
// server copy (starred_rivers, with an RLS policy that deliberately permits
// anonymous sessions) exists so stars survive to other devices later, and the
// anonymous → Sign-in-with-Apple upgrade keeps the same user id so nothing needs
// re-syncing at that point.
//
// Writes are optimistic and persisted immediately. A star tap must never show a
// spinner or fail because the river is out of coverage.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'eddy.starredRivers.v1';

export interface StarredRiver {
  riverId: string;
  name: string;
  slug: string;
  /** ISO timestamp, so a future sync can resolve conflicts by recency. */
  starredAt: string;
}

interface StarredRiversValue {
  starred: StarredRiver[];
  /** False until the first load from disk completes. */
  ready: boolean;
  isStarred: (riverId: string) => boolean;
  toggleStar: (river: Omit<StarredRiver, 'starredAt'>) => void;
}

const StarredRiversContext = createContext<StarredRiversValue>({
  starred: [],
  ready: false,
  isStarred: () => false,
  toggleStar: () => {},
});

export function StarredRiversProvider({ children }: { children: ReactNode }) {
  const [starred, setStarred] = useState<StarredRiver[]>([]);
  const [ready, setReady] = useState(false);

  // Load once on mount.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (cancelled || !raw) return;
        const parsed = JSON.parse(raw);
        // Tolerate a corrupt or older payload rather than crashing on launch —
        // losing stars is bad, but an unlaunchable app is worse.
        if (Array.isArray(parsed)) {
          setStarred(parsed.filter((r) => r && typeof r.riverId === 'string'));
        }
      })
      .catch(() => {
        // Unreadable store: start empty rather than blocking.
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: StarredRiver[]) => {
    // Fire-and-forget: the in-memory state is already updated, so a failed
    // write costs at most this session's changes rather than blocking the tap.
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const toggleStar = useCallback(
    (river: Omit<StarredRiver, 'starredAt'>) => {
      setStarred((current) => {
        const exists = current.some((r) => r.riverId === river.riverId);
        const next = exists
          ? current.filter((r) => r.riverId !== river.riverId)
          : [{ ...river, starredAt: new Date().toISOString() }, ...current];
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const value = useMemo<StarredRiversValue>(() => {
    const ids = new Set(starred.map((r) => r.riverId));
    return {
      starred,
      ready,
      isStarred: (riverId: string) => ids.has(riverId),
      toggleStar,
    };
  }, [starred, ready, toggleStar]);

  return (
    <StarredRiversContext.Provider value={value}>{children}</StarredRiversContext.Provider>
  );
}

export function useStarredRivers(): StarredRiversValue {
  return useContext(StarredRiversContext);
}
