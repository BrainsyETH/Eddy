// Before the cron makes a new attempt at a scheduled format that falls back
// to an image, it removes today's failed or stuck scheduled rows of that
// format so History shows only the new attempt.
//
// An admin retry can claim one of those rows (failed → publishing) between
// the cron reading it and deleting it. Each delete therefore repeats the
// status check, so a claimed row survives, and the cron is told to skip its
// new attempt: the admin's send is already in flight.

import { postsFromToday } from './post-scheduler';

const STALE = ['failed', 'pending'];

export interface StaleClearResult {
  cleared: number;
  /** A row changed state after it was read (usually an admin retry). Skip the new attempt. */
  claimed: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function clearStaleScheduled(supabase: any, postType: string, timeZone: string): Promise<StaleClearResult> {
  const stale = (await postsFromToday(supabase, postType, timeZone))
    .filter(row => row.auto_publish && STALE.includes(row.status)).map(row => row.id);
  if (!stale.length) return { cleared: 0, claimed: false };
  const { data, error } = await supabase.from('social_posts').delete()
    .in('id', stale).in('status', STALE).eq('auto_publish', true).select('id');
  if (error) throw new Error(`Could not clear earlier ${postType} attempts`);
  const cleared = (data ?? []).length;
  return { cleared, claimed: cleared < stale.length };
}
