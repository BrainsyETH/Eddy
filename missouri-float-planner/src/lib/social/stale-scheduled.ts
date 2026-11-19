// Before the cron makes a new attempt at a scheduled format that falls back
// to an image (Weekend Forecast, Eddy's Read), it decides per destination
// whether that destination still needs a post, and removes the destination's
// failed or stuck scheduled row so History shows only the new attempt.
//
// An admin retry claims an existing row (failed -> publishing) with a
// compare-and-swap, and can do so at any moment around this step. Each
// destination is settled on its own, so whoever claims a destination's row
// first owns that destination and the other platforms still get their post:
//   - A destination whose row is already being delivered or has delivered
//     (an admin retry got there before the read) is left alone.
//   - A destination whose failed row is claimed between the read and the
//     delete keeps that row; the conditional delete removes nothing, and the
//     cron leaves that destination to the admin's send.
//   - Every other destination proceeds, so retrying Instagram never costs
//     Facebook its post.
// The other order is safe already: once the cron has deleted a row, the
// admin's claim finds nothing and reports "Already handled".

import { MAY_HAVE_PUBLISHED } from './publish-outcome';
import { postsFromToday } from './post-scheduler';
import type { SocialPlatform } from './types';

const STALE = ['failed', 'pending'];
const DELIVERING = ['rendering', ...MAY_HAVE_PUBLISHED] as string[];

export interface DestinationClaim<P extends { platform: SocialPlatform }> {
  /** Destinations the cron now owns: post these. */
  ready: P[];
  /** Destinations someone else is delivering or has delivered today. */
  taken: { post: P; reason: string }[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function claimScheduledDestinations<P extends { platform: SocialPlatform }>(supabase: any, postType: string, timeZone: string, posts: P[]): Promise<DestinationClaim<P>> {
  const today = await postsFromToday(supabase, postType, timeZone);
  const ready: P[] = [];
  const taken: DestinationClaim<P>['taken'] = [];
  for (const post of posts) {
    const rows = today.filter(row => row.platform === post.platform);
    const live = rows.find(row => DELIVERING.includes(row.status) || (row.status === 'pending' && !row.auto_publish));
    if (live) { taken.push({ post, reason: `${live.status} post ${live.id}` }); continue; }

    const stale = rows.filter(row => row.auto_publish && STALE.includes(row.status)).map(row => row.id);
    if (stale.length) {
      // Repeats the status check, so a row an admin retry claimed after the
      // read survives and stays the admin's.
      const { data, error } = await supabase.from('social_posts').delete()
        .in('id', stale).in('status', STALE).eq('auto_publish', true).select('id');
      if (error) throw new Error(`Could not clear the earlier ${post.platform} ${postType} attempt`);
      if ((data ?? []).length < stale.length) { taken.push({ post, reason: 'an earlier attempt is being retried' }); continue; }
    }
    ready.push(post);
  }
  return { ready, taken };
}
