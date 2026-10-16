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

/** A finished River or Put-in choice that still lacks a take-out continues to it in the same sheet. */
export function continueToTakeOut(picker: StartPicker, draft: FloatSetup): StartPicker | null {
  return picker.field !== 'to' && draft.riverSlug && !draft.takeOutId ? { field: 'to', draft, page: 'access' } : null;
}

export function chooseStartAccess(picker: StartPicker, id: string | undefined, startMile: number | null,
  takeOutMile: number | null): FloatSetup {
  if (picker.field === 'to') return { ...picker.draft, takeOutId: id };
  return { ...picker.draft, putInId: id,
    takeOutId: startMile != null && takeOutMile != null && takeOutMile <= startMile
      ? undefined : picker.draft.takeOutId };
}
