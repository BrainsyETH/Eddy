import { isDamStory, storyDam } from '@shared/social-dam-schedule';
import type { Database } from '@/types/database';
import type { createAdminClient } from '@/lib/supabase/admin';
import { getAdapter } from './adapters';
import { loadDamPost } from './dam-story';
import { outcomeFields, providerAttemptRecorder, thrownFields, writeOutcome } from './publish-outcome';
import { savedPostMedia } from './review';
import type { SocialPlatform } from './types';

type Post = Database['public']['Tables']['social_posts']['Row'];
type Client = ReturnType<typeof createAdminClient>;

export async function checkedMedia(post: Post) {
  const snapshot = isDamStory(post.render_request) && post.render_request.inputProps?.snapshot;
  const current = snapshot ? await loadDamPost(storyDam(snapshot).id, snapshot.kind === 'release' ? undefined : snapshot.scheduleDate) : undefined;
  return savedPostMedia(post, current);
}

/** An immediate approval, retry and timed approval compete for the same row. */
export async function sendReviewedPost(db: Client, post: Post, expected: 'review' | 'failed' | 'scheduled') {
  let media;
  const adapter = getAdapter(post.platform as SocialPlatform);
  try {
    if (!adapter) throw new Error('Platform is not connected.');
    media = await checkedMedia(post);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Could not verify this draft.';
    if (expected === 'scheduled') {
      await db.from('social_posts').update({ status: 'failed', error_message: message, updated_at: new Date().toISOString() })
        .eq('id', post.id).eq('status', expected).eq('scheduled_at', post.scheduled_at!);
    }
    return { status: 409, body: { error: message } };
  }
  let claim = db.from('social_posts').update({
    status: 'publishing', retry_count: (post.retry_count ?? 0) + (expected === 'failed' ? 1 : 0), updated_at: new Date().toISOString(),
  }).eq('id', post.id).eq('status', expected);
  if (expected === 'scheduled') claim = claim.eq('scheduled_at', post.scheduled_at!);
  const { data, error } = await claim.select('id');
  if (error || !data?.length) return { status: 409, body: { error: error?.message ?? 'Already handled. Refresh the queue.' } };
  try {
    const result = await adapter.publishPost({ ...media, onProviderAttempt: providerAttemptRecorder(db, post.id) });
    if (!await writeOutcome(db, post.id, outcomeFields(result))) {
      return { status: 502, body: { error: 'Could not save the delivery receipt. Check the platform before retrying.' } };
    }
    return { status: result.success ? 200 : 502, body: result };
  } catch (err) {
    await writeOutcome(db, post.id, thrownFields(err));
    return { status: 502, body: { error: 'Outcome unknown. Check the account before retrying.' } };
  }
}
