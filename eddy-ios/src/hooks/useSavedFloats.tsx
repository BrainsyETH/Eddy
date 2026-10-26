// Private saved-plan collection; shared plan URLs remain independent.
import { createContext, useCallback, useContext, useMemo, type ReactNode } from 'react';
import { Alert } from 'react-native';
import type { FloatPlan } from '@eddy/types';
import { savedFloatLogistics, type SavedFloatLogistics } from '@/lib/savedFloatLogistics';
import { savedFloatPhoto } from '@/lib/floatPresentation';
import { floatArchive } from '@/lib/floatArchive';
import { useFloatArchive } from './useFloatArchive';

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
  /** Optional so existing saves stay readable. A cached endpoint photo only. */
  photoUrl?: string;
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
export function matchesPlan(entry: SavedFloat, plan: FloatPlan): boolean {
  if (entry.riverSlug !== plan.river.slug) return false;
  if (entry.putInId && entry.takeOutId) {
    return entry.putInId === plan.putIn.id && entry.takeOutId === plan.takeOut.id;
  }
  return entry.putInName === plan.putIn.name && entry.takeOutName === plan.takeOut.name;
}

export function SavedFloatsProvider({ children }: { children: ReactNode }) {
  const archive = useFloatArchive();
  const scope = archive.scopeToken;
  const floats = useMemo(
    () =>
      archive.rows
        .filter((r) => r.kind === 'saved' && !r.deleted && r.payload)
        .map((r) => ({ ...r.payload, ...(r.logistics ? { logistics: r.logistics } : {}) }) as SavedFloat)
        .sort((a, b) => b.savedAt.localeCompare(a.savedAt)),
    [archive.rows],
  );
  const attempt = useCallback((operation: Promise<unknown>) => {
    void operation.catch(() =>
      Alert.alert('Could not save changes', 'Please try again. Your previous saved data is still on this phone.'),
    );
  }, []);
  const forget = useCallback(
    (code: string) => {
      for (const row of archive.rows)
        if (row.kind === 'saved' && !row.deleted && (row.payload as SavedFloat).shortCode === code)
          attempt(floatArchive.remove(row.id, scope));
    },
    [archive.rows, scope, attempt],
  );
  const remember = useCallback(
    (plan: FloatPlan, saved: { shortCode: string; url: string }) => {
      if (!archive.ready) return;
      const previous = floats.find((f) => matchesPlan(f, plan));
      const entry: SavedFloat = {
        ...saved,
        riverName: plan.river.name,
        riverSlug: plan.river.slug,
        putInName: plan.putIn.name,
        takeOutName: plan.takeOut.name,
        putInId: plan.putIn.id,
        takeOutId: plan.takeOut.id,
        distanceLabel: plan.distance.formatted,
        savedAt: new Date().toISOString(),
        photoUrl: savedFloatPhoto(plan, previous?.photoUrl),
      };
      for (const old of floats) if (matchesPlan(old, plan) && old.shortCode !== saved.shortCode) forget(old.shortCode);
      attempt(floatArchive.putSaved(entry, scope, savedFloatLogistics(plan, undefined, previous?.logistics)));
    },
    [archive.ready, floats, scope, forget, attempt],
  );
  const isSaved = useCallback((plan: FloatPlan) => floats.some((f) => matchesPlan(f, plan)), [floats]);
  const forgetPlan = useCallback(
    (plan: FloatPlan) => {
      floats.filter((f) => matchesPlan(f, plan)).forEach((f) => forget(f.shortCode));
    },
    [floats, forget],
  );
  const updateLogistics = useCallback(
    (code: string, plan: FloatPlan) => {
      const row = floatArchive
        .snapshot()
        .rows.find((r) => r.kind === 'saved' && !r.deleted && (r.payload as SavedFloat).shortCode === code);
      if (!row || !archive.ready) return;
      const entry = row.payload as SavedFloat;
      const logistics = row.logistics;
      attempt(
        floatArchive.putSaved(
          {
            ...entry,
            photoUrl: savedFloatPhoto(plan, entry.photoUrl),
            putInId: plan.putIn.id,
            takeOutId: plan.takeOut.id,
          },
          scope,
          savedFloatLogistics(plan, undefined, logistics),
        ),
      );
    },
    [archive.ready, scope, attempt],
  );
  const value = useMemo<SavedFloatsValue>(
    () => ({
      floats,
      ready: archive.ready,
      remember,
      forget,
      isSaved,
      forgetPlan,
      updateLogistics,
      clearForAccountDeletion: archive.clear,
    }),
    [floats, archive.ready, archive.clear, remember, forget, isSaved, forgetPlan, updateLogistics],
  );
  return <SavedFloatsContext.Provider value={value}>{children}</SavedFloatsContext.Provider>;
}
export const useSavedFloats = () => useContext(SavedFloatsContext);
