import type { FloatSetup } from './floatStart';

export type StartField = 'river' | 'from' | 'to';
export interface StartPicker {
  field: StartField;
  draft: FloatSetup;
  page: 'rivers' | 'access';
}

/** Open the useful list immediately, even when Take-out still needs a river. */
export function openStartPicker(field: StartField, draft: FloatSetup): StartPicker {
  return { field, draft: { ...draft }, page: field === 'river' || !draft.riverSlug ? 'rivers' : 'access' };
}

/** River choice continues the original task; cancelling never mutates Ready. */
export function chooseStartRiver(picker: StartPicker, riverSlug: string): StartPicker {
  const draft = riverSlug === picker.draft.riverSlug ? picker.draft
    : { ...picker.draft, riverSlug, putInId: undefined, takeOutId: undefined };
  return { ...picker, draft, page: picker.field === 'river' ? 'rivers' : 'access' };
}

/**
 * A river chosen in the sheet with no take-out continues to take-outs there.
 * A put-in choice closes the sheet: Ready lists the next take-outs inline.
 */
export function continueToTakeOut(picker: StartPicker, draft: FloatSetup): StartPicker | null {
  return picker.field === 'river' && draft.riverSlug && !draft.takeOutId ? { field: 'to', draft, page: 'access' } : null;
}

/** Rivers worth loading to place a GPS fix: one of their accesses is within reach, nearest first. */
export function gpsRiverCandidates(suggestions: readonly { slug: string; miles: number }[], reachMiles = 3, limit = 3): string[] {
  return suggestions.filter(river => river.miles <= reachMiles)
    .sort((a, b) => a.miles - b.miles).slice(0, limit).map(river => river.slug);
}

/** The river a fix sits on. At a confluence the closest mapped line wins; Change stays one tap away. */
export function gpsRiver(hits: readonly { slug: string; offsetMeters: number }[]): string | null {
  return [...hits].sort((a, b) => a.offsetMeters - b.offsetMeters)[0]?.slug ?? null;
}

/** The next take-outs downstream of a known start, nearest first, and how many more there are. */
export function nextTakeOuts<T extends { mile: number }>(choices: readonly T[], startMile: number | null, count = 3) {
  if (startMile == null) return { next: [] as T[], more: 0 };
  const downstream = choices.filter(point => point.mile > startMile + 0.05).sort((a, b) => a.mile - b.mile);
  return { next: downstream.slice(0, count), more: Math.max(0, downstream.length - count) };
}

export function chooseStartAccess(picker: StartPicker, id: string | undefined, startMile: number | null,
  takeOutMile: number | null): FloatSetup {
  if (picker.field === 'to') return { ...picker.draft, takeOutId: id };
  return { ...picker.draft, putInId: id,
    takeOutId: startMile != null && takeOutMile != null && takeOutMile <= startMile
      ? undefined : picker.draft.takeOutId };
}
