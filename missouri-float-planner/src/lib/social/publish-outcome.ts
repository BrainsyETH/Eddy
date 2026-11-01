// src/lib/social/publish-outcome.ts
// What a publish attempt established — and what it did NOT.
//
// ── "Failed" and "unknown" are different facts ───────────────────────────────
//
// A post in `publishing` means a platform call is in flight or was in flight
// when something stopped. If the function was killed, a request timed out, or
// the platform answered 5xx on the final publish step, the platform may well
// have published it. Eddy used to record all of those as `failed`, and failed
// auto-published posts are retried — so an Instagram Reel that published just
// as the 60-second function limit hit was posted again by the next retry.
//
// `unknown` is the state for that: never auto-retried, resolved either by
// asking the platform (reconcileUnknownPosts, Instagram containers) or by an
// admin who checked. Database constraints and compare-and-swap claims stop
// Eddy running two INTERNAL publish jobs for one row; only the platform can
// say whether the EXTERNAL post happened, which is why provider ids are saved
// as early as the platform hands them out.

import type { PublishResult } from './types';
import { logger } from '@/lib/logger';

export type PostOutcomeStatus = 'published' | 'inbox' | 'failed' | 'unknown';

export function outcomeStatus(result: PublishResult): PostOutcomeStatus {
  if (result.success) return result.delivery ?? 'published';
  return result.ambiguous ? 'unknown' : 'failed';
}

export const UNKNOWN_MESSAGE =
  'Outcome unknown — the platform may have published this. Check the account before retrying.';

/** The row fields one attempt's result justifies. */
export function outcomeFields(
  result: PublishResult,
  now: Date = new Date(),
  { messageOnSuccess = null }: { messageOnSuccess?: string | null } = {},
) {
  const status = outcomeStatus(result);
  return {
    status,
    platform_post_id: result.platformPostId ?? null,
    published_at: status === 'published' ? now.toISOString() : null,
    error_message:
      status === 'published' || status === 'inbox'
        ? messageOnSuccess
        : status === 'unknown'
          ? `${UNKNOWN_MESSAGE} (${result.error ?? 'no response'})`
          : (result.error ?? 'Publishing failed'),
    updated_at: now.toISOString(),
  };
}

/** A publish call that THREW: nothing proves the platform did not accept it. */
export function thrownFields(error: unknown, now: Date = new Date()) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    status: 'unknown' as const,
    error_message: `${UNKNOWN_MESSAGE} (${message})`,
    updated_at: now.toISOString(),
  };
}

/** Postgres check_violation: the `unknown` status migration is not applied yet. */
const isCheckViolation = (error: { code?: string } | null) => error?.code === '23514';
/** Missing column, from Postgres or PostgREST's schema cache. */
const isMissingColumn = (error: { code?: string } | null) => error?.code === '42703' || error?.code === 'PGRST204';

/**
 * Write an attempt's outcome, but only onto a row still in `from` — a row
 * something else already resolved is left alone.
 *
 * If `unknown` is rejected (the migration that allows it has not been applied),
 * the row is LEFT in `publishing` with the explanation in error_message. That
 * is the safe fallback: `publishing` is never auto-retried either.
 */
export async function writeOutcome(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  postId: string,
  fields: Record<string, unknown> & { status: string },
  from = 'publishing',
): Promise<boolean> {
  const { error } = await supabase.from('social_posts').update(fields).eq('id', postId).eq('status', from);
  if (!error) return true;
  if (fields.status === 'unknown' && isCheckViolation(error)) {
    logger.warn('[social] `unknown` status not allowed yet; leaving post in publishing', { postId });
    await supabase
      .from('social_posts')
      .update({ error_message: fields.error_message })
      .eq('id', postId)
      .eq('status', from);
    return false;
  }
  logger.error('[social] could not record publish outcome — check the platform before retrying', new Error(error.message), {
    postId,
    status: fields.status,
  });
  return false;
}

let warnedMissingAttemptColumn = false;

/**
 * Persist the platform's id for an attempt the moment it exists (an Instagram
 * container, before polling), so an attempt that dies later can be checked.
 * Best-effort: a failure here must not fail the publish.
 */
export function providerAttemptRecorder(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  postId: string,
) {
  return async (attemptId: string): Promise<void> => {
    try {
      const { error } = await supabase
        .from('social_posts')
        .update({ provider_attempt_id: attemptId })
        .eq('id', postId);
      if (!error) return;
      if (isMissingColumn(error)) {
        if (!warnedMissingAttemptColumn) {
          warnedMissingAttemptColumn = true;
          logger.warn('[social] provider_attempt_id column missing; apply the social_post_unknown migration');
        }
        return;
      }
      logger.error('[social] could not save provider attempt id', new Error(error.message), { postId });
    } catch (error) {
      logger.error('[social] could not save provider attempt id', error, { postId });
    }
  };
}

export type ContainerState = 'published' | 'not_published' | 'in_progress' | 'unknown';

/**
 * Settle `unknown` Instagram posts by asking Meta about the saved container.
 *
 * PUBLISHED settles it as published. ERROR, EXPIRED and FINISHED (ready but
 * never published) settle it as failed, which makes it retryable again — a
 * retry creates a new container, so the old one cannot double-publish.
 * Anything else stays unknown for an admin.
 */
export async function reconcileUnknownPosts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  checkContainer: (containerId: string) => Promise<ContainerState>,
  now: Date = new Date(),
): Promise<{ checked: number; published: number; failed: number }> {
  const since = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('social_posts')
    .select('id, provider_attempt_id')
    .eq('status', 'unknown')
    .eq('platform', 'instagram')
    .not('provider_attempt_id', 'is', null)
    .gte('created_at', since)
    .limit(25);
  if (error) {
    // Before the migration this column/status does not exist; nothing to do.
    if (!isMissingColumn(error)) logger.warn('[social] could not list unknown posts', { error: error.message });
    return { checked: 0, published: 0, failed: 0 };
  }

  let published = 0;
  let failed = 0;
  for (const row of (data ?? []) as Array<{ id: string; provider_attempt_id: string }>) {
    const state = await checkContainer(row.provider_attempt_id);
    if (state === 'published') {
      const ok = await writeOutcome(
        supabase,
        row.id,
        {
          status: 'published',
          published_at: now.toISOString(),
          error_message: 'Reconciled: Instagram reports this container published.',
          updated_at: now.toISOString(),
        },
        'unknown',
      );
      if (ok) published++;
    } else if (state === 'not_published') {
      const ok = await writeOutcome(
        supabase,
        row.id,
        {
          status: 'failed',
          error_message: 'Reconciled: Instagram never published this attempt; safe to retry.',
          updated_at: now.toISOString(),
        },
        'unknown',
      );
      if (ok) failed++;
    }
  }
  return { checked: data?.length ?? 0, published, failed };
}
