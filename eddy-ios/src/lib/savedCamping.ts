import type { CampsiteAvailabilitySummary } from '@eddy/types';

export interface SavedCamping {
  availability: CampsiteAvailabilitySummary;
  name: string;
  /** Download time drives retries; availability.fetchedAt ages the inventory. */
  downloadedAt: string;
}

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
const count = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0;
const date = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
const inventory = (value: Record<string, unknown>) =>
  ['open', 'full', 'closed', 'not_yet_released'].includes(String(value.status))
  && count(value.sitesOpen) && count(value.sitesReservable) && value.sitesOpen <= value.sitesReservable
  && (value.sitesWalkUp == null || count(value.sitesWalkUp));

/** Malformed optional inventory must never prevent loading the saved place. */
export function decodeSavedCamping(value: unknown): SavedCamping | null | undefined {
  // Missing is distinct from a completed lookup with no availability, so older
  // saves can be enriched by the existing bounded foreground refresh once.
  if (value === undefined) return undefined;
  if (!record(value) || typeof value.name !== 'string' || typeof value.downloadedAt !== 'string') return null;
  const a = value.availability;
  if (!record(a) || !record(a.window) || !date(a.window.startDate) || !date(a.window.endDate)
    || a.window.startDate >= a.window.endDate || typeof a.window.label !== 'string'
    || !inventory(a) || !['campground', 'backcountry_district'].includes(String(a.kind))
    || !['recreation_gov', 'mo_state_parks'].includes(String(a.source))
    || typeof a.fetchedAt !== 'string' || !Number.isFinite(Date.parse(a.fetchedAt))
    || (a.facilityId != null && typeof a.facilityId !== 'string')
    || (a.nights != null && (!Array.isArray(a.nights) || !a.nights.every(n => record(n) && date(n.date) && inventory(n))))) return null;
  return value as unknown as SavedCamping;
}
