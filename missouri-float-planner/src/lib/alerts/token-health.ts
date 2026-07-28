// src/lib/alerts/token-health.ts
// Pruning dead Expo push tokens. Shared by both delivery passes.
//
// Extracted when gauge alerts gained their own drain: two copies of this would
// have drifted the first time either was tuned, and the failure mode of a stale
// copy is silent — a token that should have been disabled keeps being sent to,
// burning a slot in every batch and inflating the push-failure rate that the
// strategy doc names as a kill signal.

import type { SupabaseClient } from '@supabase/supabase-js';

/** Disable a token after this many consecutive send failures. */
export const FAILURE_DISABLE_THRESHOLD = 5;

/**
 * Retire tokens Expo told us are gone.
 *
 * Note DeviceNotRegistered usually arrives in the RECEIPT rather than the
 * ticket, so this catches only some of them — the failure counter below is the
 * backstop, and /api/cron/push-receipts is what catches the rest.
 */
export async function disableTokens(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient | any,
  tokenIds: string[],
): Promise<void> {
  if (tokenIds.length === 0) return;
  await supabase
    .from('device_tokens')
    .update({ disabled_at: new Date().toISOString() })
    .in('id', tokenIds);
}

/**
 * Add this pass's failures to each token's running count, disabling the
 * persistently broken ones.
 *
 * Read-then-write per token rather than an atomic increment: the counts are
 * advisory, both delivery passes are serialized by their own cron locks, and
 * losing one increment to a race costs at most one extra send to a token that
 * is already failing.
 */
export async function recordTokenFailures(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient | any,
  failuresByToken: Map<string, number>,
  threshold = FAILURE_DISABLE_THRESHOLD,
): Promise<void> {
  for (const [tokenId, count] of failuresByToken) {
    const { data: row } = await supabase
      .from('device_tokens')
      .select('failure_count')
      .eq('id', tokenId)
      .maybeSingle();

    const next = (row?.failure_count ?? 0) + count;
    await supabase
      .from('device_tokens')
      .update({
        failure_count: next,
        ...(next >= threshold ? { disabled_at: new Date().toISOString() } : {}),
      })
      .eq('id', tokenId);
  }
}
