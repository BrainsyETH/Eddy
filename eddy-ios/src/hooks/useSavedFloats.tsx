// eddy-ios/src/hooks/useSavedFloats.tsx
// Floats you have shared, kept so you can open them again.
//
// ── Why local, and why only a stub ──────────────────────────────────────────
// A saved plan already lives server-side — /api/plan/save writes the row and
// hands back a short code. What the server does NOT have is any notion of
// "mine": the plans table is keyed by share code, not by account, and the app
// has an anonymous identity for most of its users. So the list of codes YOU
// created is a local fact, and this is where it lives.
//
// Only a stub is stored — the code, the names, the distance, the date. Never
// the numbers. A float saved in April and opened in July describes the same
// stretch and completely different water, so the plan itself is always re-read
// from the server, which recalculates it against today's gauge. Caching the
// April conditions here and showing them under a July date would be a lie with
// a timestamp on it. See fetchSavedPlan.
//
// The stub exists purely so the LIST renders instantly and offline. Opening one
// needs a connection, and says so.

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
import type { FloatPlan } from '@eddy/types';

const STORAGE_KEY = 'eddy.savedFloats.v1';

/**
 * Newest first, capped. A shared-link history is a convenience, not an archive,
 * and an unbounded list would eventually be a slow read on every app start.
 */
const MAX_ENTRIES = 50;

export interface SavedFloat {
  shortCode: string;
  url: string;
  riverName: string;
  riverSlug: string;
  putInName: string;
  takeOutName: string;
  /** Rendered straight from the plan, so the list matches what was shared. */
  distanceLabel: string;
  savedAt: string;
}

interface SavedFloatsValue {
  floats: SavedFloat[];
  /** False until the first load from disk completes. */
  ready: boolean;
  remember: (plan: FloatPlan, saved: { shortCode: string; url: string }) => void;
  forget: (shortCode: string) => void;
}

const SavedFloatsContext = createContext<SavedFloatsValue>({
  floats: [],
  ready: false,
  remember: () => {},
  forget: () => {},
});

export function SavedFloatsProvider({ children }: { children: ReactNode }) {
  const [floats, setFloats] = useState<SavedFloat[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const parsed = raw ? (JSON.parse(raw) as SavedFloat[]) : [];
        if (!cancelled && Array.isArray(parsed)) setFloats(parsed);
      } catch {
        // A corrupt store is an empty store. Losing a list of share codes is
        // not worth a crash on launch, and re-sharing regenerates them.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const persist = useCallback((next: SavedFloat[]) => {
    setFloats(next);
    // Fire and forget. A write that fails costs this entry from the history,
    // which is never worth interrupting someone mid-share over.
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
  }, []);

  const remember = useCallback(
    (plan: FloatPlan, saved: { shortCode: string; url: string }) => {
      setFloats((current) => {
        const entry: SavedFloat = {
          shortCode: saved.shortCode,
          url: saved.url,
          riverName: plan.river.name,
          riverSlug: plan.river.slug,
          putInName: plan.putIn.name,
          takeOutName: plan.takeOut.name,
          distanceLabel: plan.distance.formatted,
          savedAt: new Date().toISOString(),
        };
        // De-duped by code: sharing the same stretch twice returns the same
        // short code, and two identical rows is not a history.
        const next = [entry, ...current.filter((f) => f.shortCode !== entry.shortCode)].slice(
          0,
          MAX_ENTRIES,
        );
        AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
    },
    [],
  );

  const forget = useCallback(
    (shortCode: string) => {
      persist(floats.filter((f) => f.shortCode !== shortCode));
    },
    [floats, persist],
  );

  const value = useMemo<SavedFloatsValue>(
    () => ({ floats, ready, remember, forget }),
    [floats, ready, remember, forget],
  );

  return <SavedFloatsContext.Provider value={value}>{children}</SavedFloatsContext.Provider>;
}

export function useSavedFloats(): SavedFloatsValue {
  return useContext(SavedFloatsContext);
}
