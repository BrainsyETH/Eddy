// eddy-ios/src/hooks/useSavedFloats.tsx
// Floats you have kept, so you can open them again.
//
// ── Kept is not the same as shared ──────────────────────────────────────────
// This list used to be written by the Share button, and by nothing else. Two
// things were wrong with that, and they are the same thing from two sides:
// sharing a float with the person driving is not a statement that you want to
// keep it, and wanting to keep one does not mean you have anybody to send it
// to. So a plan you built for yourself could not be saved at all, and a plan
// you sent to a group chat was filed under Favorites whether you meant it or
// not.
//
// Keeping is now its own explicit action — the star on an open plan — and Share
// does not write here. What is stored is unchanged; only who decides.
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
  /**
   * The two ends, by id.
   *
   * What makes "is this stretch already kept?" answerable from a plan that has
   * no short code yet — which is every plan, at the moment the star is tapped.
   * OPTIONAL because rows written by older builds do not have them, and a
   * history is not worth dropping over a field it can live without.
   */
  putInId?: string;
  takeOutId?: string;
  /** Rendered straight from the plan, so the list matches what was saved. */
  distanceLabel: string;
  savedAt: string;
}

interface SavedFloatsValue {
  floats: SavedFloat[];
  /** False until the first load from disk completes. */
  ready: boolean;
  remember: (plan: FloatPlan, saved: { shortCode: string; url: string }) => void;
  forget: (shortCode: string) => void;
  /**
   * Is this exact stretch already kept?
   *
   * Matched on the RIVER AND THE TWO ENDS, never on the short code: the code is
   * assigned by the server when a plan is first kept, so a freshly built plan
   * has none and would otherwise always read as unsaved — a star that never
   * fills in. Rows from before those ids were stored fall back to the names,
   * which are what the list is keyed on visually anyway.
   */
  isSaved: (plan: FloatPlan) => boolean;
  /** Drop this stretch, whatever code it happens to be filed under. */
  forgetPlan: (plan: FloatPlan) => void;
}

const SavedFloatsContext = createContext<SavedFloatsValue>({
  floats: [],
  ready: false,
  remember: () => {},
  forget: () => {},
  isSaved: () => false,
  forgetPlan: () => {},
});

/** True when a stored stub describes the same stretch as this plan. */
function matchesPlan(entry: SavedFloat, plan: FloatPlan): boolean {
  if (entry.riverSlug !== plan.river.slug) return false;
  if (entry.putInId && entry.takeOutId) {
    return entry.putInId === plan.putIn.id && entry.takeOutId === plan.takeOut.id;
  }
  return entry.putInName === plan.putIn.name && entry.takeOutName === plan.takeOut.name;
}

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
          putInId: plan.putIn.id,
          takeOutId: plan.takeOut.id,
          distanceLabel: plan.distance.formatted,
          savedAt: new Date().toISOString(),
        };
        // De-duped by code AND by stretch. The code alone was enough while this
        // list only ever recorded shares — saving the same stretch twice
        // returns the same short code — but a row written by an older build has
        // no ids to match on and could otherwise reappear beside its own
        // replacement. Two identical rows is not a history either way.
        const next = [
          entry,
          ...current.filter((f) => f.shortCode !== entry.shortCode && !matchesPlan(f, plan)),
        ].slice(0, MAX_ENTRIES);
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

  const isSaved = useCallback(
    (plan: FloatPlan) => floats.some((f) => matchesPlan(f, plan)),
    [floats],
  );

  const forgetPlan = useCallback(
    (plan: FloatPlan) => {
      persist(floats.filter((f) => !matchesPlan(f, plan)));
    },
    [floats, persist],
  );

  const value = useMemo<SavedFloatsValue>(
    () => ({ floats, ready, remember, forget, isSaved, forgetPlan }),
    [floats, ready, remember, forget, isSaved, forgetPlan],
  );

  return <SavedFloatsContext.Provider value={value}>{children}</SavedFloatsContext.Provider>;
}

export function useSavedFloats(): SavedFloatsValue {
  return useContext(SavedFloatsContext);
}
