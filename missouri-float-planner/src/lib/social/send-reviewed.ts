import { DamSourceUnavailable, isDamStory, isMeasuredReleaseVideo, storyDam } from '@shared/social-dam-schedule';
import type { Database } from '@/types/database';
import type { createAdminClient } from '@/lib/supabase/admin';
import { getAdapter } from './adapters';
import { loadDamPost, regenerateDamPost } from './dam-story';
import { outcomeFields, providerAttemptRecorder, thrownFields, writeOutcome } from './publish-outcome';
import { savedPostMedia, StaleDamError, StaleReleaseError } from './review';
import type { SocialPlatform } from './types';

type Post = Database['public']['Tables']['social_posts']['Row'];
type Client = ReturnType<typeof createAdminClient>;

export async function checkedMedia(post: Post) {
  const snapshot = isDamStory(post.render_request) && post.render_request.inputProps?.snapshot;
  const current = snapshot ? await loadDamPost(storyDam(snapshot).id, snapshot.kind === 'release' ? undefined : snapshot.scheduleDate) : undefined;
  return savedPostMedia(post, current);
}

export type PublishBudget = { claimBefore: number; signal: AbortSignal };

export function canClaimDelivery(budget: PublishBudget): boolean {
  return Date.now() < budget.claimBefore && !budget.signal.aborted;
}

const deferred = { status: 202, body: { deferred: true } } as const;

/** How long past its send time a timed post keeps trying before it fails. */
export const TIMED_POST_GRACE_MS = 2 * 60 * 60 * 1000;

/** An immediate approval, retry and timed approval compete for the same row. */
export async function sendReviewedPost(db: Client, post: Post, expected: 'review' | 'failed' | 'scheduled', budget?: PublishBudget) {
  if (budget && !canClaimDelivery(budget)) return deferred;
  let media;
  const adapter = getAdapter(post.platform as SocialPlatform);
  try {
    if (expected === 'scheduled' && isMeasuredReleaseVideo(post.render_request)) {
      throw new Error('Measured releases require immediate approval. Review the latest reading.');
    }
    if (!adapter) throw new Error('Platform is not connected.');
    media = await checkedMedia(post);
  } catch (err) {
    let message = err instanceof Error ? err.message : 'Could not verify this draft.';
    if (expected === 'scheduled') {
      // A send time is a standing approval for that day's data. An unreachable
      // source is tried again on the next run, and a revised plan gets a new
      // video, until the post is too late to be worth sending.
      if (Date.now() - Date.parse(post.scheduled_at!) < TIMED_POST_GRACE_MS) {
        if (err instanceof DamSourceUnavailable) {
          await db.from('social_posts').update({ error_message: 'Waiting to send: ' + message, updated_at: new Date().toISOString() })
            .eq('id', post.id).eq('status', expected).eq('scheduled_at', post.scheduled_at!);
          return { status: 503, body: { error: message, retrying: true } };
        }
        if (err instanceof StaleDamError && !(err instanceof StaleReleaseError)) {
          const again = await regenerateDamPost(db, post, 'scheduled');
          if (again.ok) return { status: 503, body: { error: 'The dam data changed. Rendering an updated video.', retrying: true } };
          message = again.error;
        }
      }
      await db.from('social_posts').update({ status: 'failed', error_message: message, updated_at: new Date().toISOString() })
        .eq('id', post.id).eq('status', expected).eq('scheduled_at', post.scheduled_at!);
    }
    return { status: 409, body: { error: message, ...(err instanceof StaleDamError && { code: err instanceof StaleReleaseError ? 'stale_release' : 'stale_dam' }) } };
  }
  if (budget && !canClaimDelivery(budget)) return deferred;
  let claim = db.from('social_posts').update({
    status: 'publishing', retry_count: (post.retry_count ?? 0) + (expected === 'failed' ? 1 : 0), updated_at: new Date().toISOString(),
  }).eq('id', post.id).eq('status', expected);
  // A regenerated dam video replaces the one this request read.
  if (isDamStory(post.render_request)) claim = claim.eq('updated_at', post.updated_at);
  if (expected === 'scheduled') claim = claim.eq('scheduled_at', post.scheduled_at!);
  const { data, error } = await claim.select('id');
  if (error || !data?.length) return { status: 409, body: { error: error?.message ?? 'Already handled. Refresh the queue.' } };
  try {
    const result = await adapter.publishPost({ ...media, signal: budget?.signal, onProviderAttempt: providerAttemptRecorder(db, post.id) });
    // Preparation can expire before anything was sent. Keep that approval for the next tick.
    // If the final call may have reached the provider, its unknown receipt takes precedence.
    if (expected === 'scheduled' && budget?.signal.aborted && !result.success && !result.ambiguous) {
      const saved = await writeOutcome(db, post.id, { status: 'scheduled', provider_attempt_id: null,
        error_message: null, updated_at: new Date().toISOString() });
      if (saved) return deferred;
      return { status: 502, body: { error: 'Could not save the deferred delivery.' } };
    }
    if (!await writeOutcome(db, post.id, outcomeFields(result))) {
      return { status: 502, body: { error: 'Could not save the delivery receipt. Check the platform before retrying.' } };
    }
    return { status: result.success ? 200 : 502, body: result };
  } catch (err) {
    await writeOutcome(db, post.id, thrownFields(err));
    return { status: 502, body: { error: 'Outcome unknown. Check the account before retrying.' } };
  }
}
