// src/lib/account-deletion.ts
// Deleting a user account and everything that must go with it.
//
// App Store Guideline 5.1.1(v) requires an in-app path that deletes the
// account itself, not one that deactivates it or emails support. This is that
// path's implementation; the route is a thin wrapper (src/app/api/me/route.ts).
//
// ── Why this is not just auth.admin.deleteUser() ──────────────────────────
//
// Most of the per-user tables hang off auth.users with ON DELETE CASCADE, so
// removing the auth user removes them: profiles, entitlements, starred_rivers,
// starred_gauges, device_tokens, alert_subscriptions, alert_push_deliveries,
// and — added with per-gauge alerting — gauge_alert_subscriptions,
// gauge_alert_events and notification_preferences.
//
// alert_push_deliveries is worth a second look, because migration 00203 dropped
// its FK to river_condition_events so the ledger could serve both outboxes. Its
// user_id FK is untouched and still cascades, so account deletion is unaffected;
// what that migration gave up was cleanup when an EVENT is deleted, which
// push-receipts' 24-hour prune now covers.
//
// float_plans does NOT. Its FK is ON DELETE SET NULL, and float_plans has this
// RLS policy (migration 00184):
//
//     using (user_id is null or user_id = (select auth.uid()))
//
// Read those two facts together: cascading a delete would set user_id to NULL
// on every saved float, and a NULL user_id is the ANONYMOUS, WORLD-READABLE
// tier — the share-by-link plans the accountless web saves. Deleting your
// account would publish your saved floats. That is the precise inverse of what
// the button promises, on data the product treats as sensitive: a saved float
// predicts where a person will physically be, which is why 00184 closed the
// world-readable SELECT in the first place.
//
// So owned plans are deleted EXPLICITLY, before the auth user goes.
//
// Community submissions currently use the public reports endpoint without an
// account id. river_photos is an editorial library with no account column.
// These cannot be located by account deletion; the privacy policy explains
// submission removal requests. Do not infer ownership from submitter_name.
// If account-linked submissions are introduced, add their rows AND stored
// images to this deletion workflow before shipping that write path.

import type { SupabaseClient } from '@supabase/supabase-js';
import { revokeDeletedAccount, type AppleRevocationStatus } from '@/lib/apple/revocation-queue';

/**
 * Tables that must be deleted by hand because their FK to auth.users does NOT
 * cascade, and where the post-cascade state would be worse than the row
 * existing.
 *
 * This is a list rather than inline calls so the reasoning is testable: see
 * account-deletion.test.ts, which fails if float_plans is ever dropped from it.
 */
export const EXPLICIT_DELETE_TABLES = [
  {
    table: 'float_plans',
    column: 'user_id',
    // ON DELETE SET NULL + "user_id is null" meaning public would turn every
    // saved float into a world-readable one.
    reason: 'SET NULL would publish owned plans under the anonymous-read policy',
  },
] as const;

export interface AccountDeletionResult {
  deleted: Record<string, number>;
  appleRevoked: boolean;
  appleRevocationStatus: AppleRevocationStatus;
}

export interface AccountDeletionDeps {
  appleAccount?: boolean;
  revokeApple?: (admin: SupabaseClient, userId: string, appleAccount: boolean) => Promise<AppleRevocationStatus>;
}

/**
 * Owned floats must disappear before auth deletion can make their owner NULL.
 * The auth.users trigger copies the Apple token to a durable outbox atomically
 * with deletion. Apple's availability never determines whether deletion works.
 */
export async function deleteAccount(
  admin: SupabaseClient,
  userId: string,
  deps: AccountDeletionDeps = {},
): Promise<AccountDeletionResult> {
  // Fail before deleting anything if the required migration has not landed.
  // The migration creates both this table and the trigger in one transaction.
  const { error: queueError } = await admin.from('apple_token_revocations').select('id').limit(0);
  if (queueError) throw new Error('Account deletion is temporarily unavailable. Please try again later.');

  const deleted: Record<string, number> = {};
  for (const { table, column } of EXPLICIT_DELETE_TABLES) {
    const { data, error } = await admin.from(table).delete().eq(column, userId).select('id');
    if (error) throw new Error(`Could not delete ${table}: ${error.message}`);
    deleted[table] = data?.length ?? 0;
  }

  // The trigger queues the latest token before its FK cascades. A failed queue
  // insert aborts this transaction, leaving the account and original token.
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw new Error(`Could not delete auth user: ${error.message}`);

  let appleRevocationStatus: AppleRevocationStatus = 'pending';
  try {
    appleRevocationStatus = await (deps.revokeApple ?? revokeDeletedAccount)(admin, userId, deps.appleAccount ?? false);
  } catch {
    // The account is already deleted. Cron can retry the durable row; never
    // report a successful deletion as failed or emit credential-bearing errors.
    console.error('[account-deletion] Apple revocation deferred to retry');
  }
  return { deleted, appleRevoked: appleRevocationStatus === 'revoked', appleRevocationStatus };
}
