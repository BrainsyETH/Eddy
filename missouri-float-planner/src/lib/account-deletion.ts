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
// ── What deliberately survives ────────────────────────────────────────────
//
// community_reports.user_id and river_photos are also SET NULL, and that is
// left alone on purpose. Those are published contributions other people rely
// on — gauge ground-truth and by-level imagery — and anonymising authorship is
// the standard, defensible reading of "delete my account" for public UGC. It
// is a different decision from the float_plans one because the data is already
// public by intent; nothing becomes newly visible.

import type { SupabaseClient } from '@supabase/supabase-js';

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
  /** Rows removed per table, for the audit log. */
  deleted: Record<string, number>;
}

/**
 * Delete a user and their owned data.
 *
 * Takes a SERVICE-ROLE client. The caller has already verified the requester's
 * identity from their own JWT (requireUser), and every statement below is
 * scoped by that verified id — but the work itself has to bypass RLS, because
 * removing the auth user requires the admin API and because a deletion must not
 * be silently narrowed by a policy that happens not to grant DELETE.
 *
 * NOT ATOMIC, and ordered accordingly. Postgres cannot roll back the auth
 * admin call, so the owned-data deletes run FIRST: if the run dies halfway, the
 * sensitive rows are already gone and the account still exists, which leaves
 * the user able to retry. The reverse order could orphan private data behind a
 * deleted account with nobody able to reach it.
 */
export async function deleteAccount(
  admin: SupabaseClient,
  userId: string
): Promise<AccountDeletionResult> {
  const deleted: Record<string, number> = {};

  for (const { table, column } of EXPLICIT_DELETE_TABLES) {
    const { data, error } = await admin
      .from(table)
      .delete()
      .eq(column, userId)
      .select('id');

    if (error) {
      throw new Error(`Could not delete ${table}: ${error.message}`);
    }
    deleted[table] = data?.length ?? 0;
  }

  // Cascades the rest. Must be last — see the ordering note above.
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    throw new Error(`Could not delete auth user: ${error.message}`);
  }

  return { deleted };
}
