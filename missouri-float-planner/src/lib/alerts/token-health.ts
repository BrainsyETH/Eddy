// src/lib/alerts/token-health.ts
// Pruning dead Expo push tokens. Shared by both delivery passes.
//
// Extracted when gauge alerts gained their own drain: two copies of this would
// have drifted the first time either was tuned, and the failure mode of a stale
// copy is silent — a token that should have been disabled keeps being sent to,
// burning a slot in every batch and inflating the push-failure rate that the
// strategy doc names as a kill signal.

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Retire tokens Expo told us are gone.
 *
 * Note DeviceNotRegistered usually arrives in the RECEIPT rather than the
 * ticket. The receipt poll also retires devices with that explicit result.
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
