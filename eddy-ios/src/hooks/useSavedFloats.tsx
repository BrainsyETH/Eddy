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
// The list and saved logistics work offline. Live readings and time estimates
// are never stored here. Older stubs gain logistics the next time they open
// successfully online; timestamped saved warnings remain clearly historical.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { FloatPlan } from '@eddy/types';
import { savedFloatLogistics, type SavedFloatLogistics } from '@/lib/savedFloatLogistics';
import { createStorageQueue } from '@/lib/storageQueue';

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
  logistics?: SavedFloatLogistics;
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
  updateLogistics: (shortCode: string, plan: FloatPlan) => void;
  clearForAccountDeletion: () => Promise<void>;
}

const SavedFloatsContext = createContext<SavedFloatsValue>({
  floats: [],
  ready: false,
  remember: () => {},
  forget: () => {},
  isSaved: () => false,
  forgetPlan: () => {},
  updateLogistics: () => {},
  clearForAccountDeletion: async () => {},
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
  const floatsRef = useRef<SavedFloat[]>([]);
  const writes = useRef(createStorageQueue());
  const epoch = useRef(0);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const loadedEpoch = epoch.current;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const parsed = raw ? (JSON.parse(raw) as SavedFloat[]) : [];
        if (!cancelled && epoch.current === loadedEpoch && Array.isArray(parsed)) {
          floatsRef.current = parsed;
          setFloats(parsed);
        }
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
    floatsRef.current = next;
    setFloats(next);
    void writes.current.run(() => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next))).catch(() => {});
  }, []);

  const remember = useCallback((plan: FloatPlan, saved: { shortCode: string; url: string }) => {
    // An earlier save request may finish after deletion. Its callback belongs
    // to the old revision and must not put that trip back on this device.
    if (epoch.current !== revision) return;
    const entry: SavedFloat = {
      ...saved, riverName: plan.river.name, riverSlug: plan.river.slug,
      putInName: plan.putIn.name, takeOutName: plan.takeOut.name,
      putInId: plan.putIn.id, takeOutId: plan.takeOut.id,
      distanceLabel: plan.distance.formatted, savedAt: new Date().toISOString(),
      logistics: savedFloatLogistics(plan),
    };
    persist([entry, ...floatsRef.current.filter((f) => f.shortCode !== entry.shortCode && !matchesPlan(f, plan))].slice(0, MAX_ENTRIES));
  }, [persist, revision]);

  const forget = useCallback((shortCode: string) => {
    persist(floatsRef.current.filter((f) => f.shortCode !== shortCode));
  }, [persist]);

  const isSaved = useCallback((plan: FloatPlan) => floats.some((f) => matchesPlan(f, plan)), [floats]);
  const forgetPlan = useCallback((plan: FloatPlan) => {
    persist(floatsRef.current.filter((f) => !matchesPlan(f, plan)));
  }, [persist]);

  const updateLogistics = useCallback((shortCode: string, plan: FloatPlan) => {
    if (epoch.current !== revision || !floatsRef.current.some((f) => f.shortCode === shortCode)) return;
    persist(floatsRef.current.map((f) => f.shortCode === shortCode ? {
      ...f, logistics: savedFloatLogistics(plan),
      riverName: plan.river.name, riverSlug: plan.river.slug,
      putInName: plan.putIn.name, takeOutName: plan.takeOut.name,
      putInId: plan.putIn.id, takeOutId: plan.takeOut.id, distanceLabel: plan.distance.formatted,
    } : f));
  }, [persist, revision]);

  const clearForAccountDeletion = useCallback(async () => {
    epoch.current += 1;
    setRevision(epoch.current);
    floatsRef.current = [];
    setFloats([]);
    await writes.current.run(() => AsyncStorage.removeItem(STORAGE_KEY));
  }, []);

  const value = useMemo<SavedFloatsValue>(
    () => ({ floats, ready, remember, forget, isSaved, forgetPlan, updateLogistics, clearForAccountDeletion }),
    [floats, ready, remember, forget, isSaved, forgetPlan, updateLogistics, clearForAccountDeletion],
  );

  return <SavedFloatsContext.Provider value={value}>{children}</SavedFloatsContext.Provider>;
}

export function useSavedFloats(): SavedFloatsValue {
  return useContext(SavedFloatsContext);
}
