import { cache } from 'react';
import { damScheduleShare, validScheduleDate } from '@shared/dam-schedule-share';
import { getUsaceDam } from '@/lib/flow-providers/usace-registry';
import { loadDamPageSnapshot } from '@/lib/data/dam-page-snapshot';
import { damScheduleExpired } from './dam-schedule-indexing';

/** Dated requests never fall through to a different day's schedule. */
export const loadDamScheduleShare = cache(async (damId: string, date: string) => {
  if (!validScheduleDate(date) || !getUsaceDam(damId)?.swpaCode) return null;
  const now = Date.now();
  if (damScheduleExpired(date, now)) return null;
  try {
    const dam = await loadDamPageSnapshot(damId, now);
    return dam ? damScheduleShare(dam, date, now) : null;
  } catch {
    // A provider outage is temporary, never evidence that this date is gone.
    return null;
  }
});
