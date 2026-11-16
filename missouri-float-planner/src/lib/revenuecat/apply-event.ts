// src/lib/revenuecat/apply-event.ts
// Persist one RevenueCat webhook event onto an entitlements row — in order.
//
// ── The ordering guard is part of the write ──────────────────────────────────
//
// Webhooks arrive out of order and are retried, so every write carries a rule:
// an event older than the one the row already reflects must not land (a late
// CANCELLATION must not undo a newer RENEWAL). This file used to enforce that
// by reading last_event_at, comparing in JavaScript, then upserting without
// condition. Two overlapping deliveries — a retry plus a newer event, or a
// webhook racing /api/me/entitlement/refresh — could both pass the read and
// then write in the wrong order, granting or revoking Premium wrongly. The
// reconcile path closed exactly this gap with a row-locked RPC
// (lib/revenuecat/api.ts); the webhook path never had.
//
// Now the comparison rides in the UPDATE's WHERE clause. Postgres evaluates it
// under the row lock and re-checks it against the latest row version, so of two
// concurrent writers the older event matches zero rows. No migration needed:
// a single conditional UPDATE is already atomic.
//
// The pre-read stays, but only to label a skipped event as duplicate or stale
// in the response; it is no longer what protects the row.

import type { EntitlementPatch, RevenueCatEvent } from './events';

const LOG_PREFIX = '[RevenueCatWebhook]';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

export interface ApplyResult {
  status: 'applied' | 'duplicate' | 'stale' | 'unknown_user' | 'error';
}

/**
 * The row-level ordering guard as a PostgREST filter: write only if the row has
 * no event yet or its event is not newer than this one. Equal timestamps pass,
 * so a redelivery of the latest event re-writes identical values harmlessly.
 */
export function notNewerThan(eventAt: string): string {
  return `last_event_at.is.null,last_event_at.lte.${eventAt}`;
}

/** Idempotent, ordered write of one (user, entitlement) pair. */
export async function applyToEntitlement(
  supabase: AdminClient,
  params: {
    userId: string;
    entitlementId: string;
    patch: EntitlementPatch;
    event: RevenueCatEvent;
    eventAt: string;
  },
): Promise<ApplyResult> {
  const { userId, entitlementId, patch, event, eventAt } = params;

  const { data: existing, error: readError } = await supabase
    .from('entitlements')
    .select('last_event_id, last_event_at')
    .eq('user_id', userId)
    .eq('entitlement_id', entitlementId)
    .maybeSingle();

  if (readError) {
    console.error(`${LOG_PREFIX} Read failed for ${entitlementId}:`, readError);
    return { status: 'error' };
  }

  // Fast paths, for the response only. The guarded write below is what holds.
  if (existing?.last_event_id && event.id && existing.last_event_id === event.id) {
    return { status: 'duplicate' };
  }
  if (existing?.last_event_at && new Date(eventAt) < new Date(existing.last_event_at)) {
    return { status: 'stale' };
  }

  // Only fields the event actually carries are written; `undefined` entries
  // are dropped so a BILLING_ISSUE can't blank an existing expiry.
  const fields: Record<string, unknown> = {
    rc_app_user_id: event.app_user_id ?? null,
    rc_original_app_user_id: event.original_app_user_id ?? null,
    last_event_id: event.id ?? null,
    last_event_type: event.type ?? null,
    last_event_at: eventAt,
  };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) fields[key] = value;
  }

  if (!existing) {
    // Insert-if-absent. When two first deliveries race, one inserts and the
    // other's insert is ignored, falling through to the guarded update.
    const { data: inserted, error: insertError } = await supabase
      .from('entitlements')
      .upsert(
        { user_id: userId, entitlement_id: entitlementId, ...fields },
        { onConflict: 'user_id,entitlement_id', ignoreDuplicates: true },
      )
      .select('user_id');

    if (insertError) {
      // 23503 = FK violation: the appUserID is a well-formed uuid but no such
      // auth user exists (deleted account). Not retryable.
      if (insertError.code === '23503') {
        console.warn(`${LOG_PREFIX} No auth user for ${userId} — dropping event ${event.id}`);
        return { status: 'unknown_user' };
      }
      console.error(`${LOG_PREFIX} Insert failed for ${entitlementId}:`, insertError);
      return { status: 'error' };
    }
    if (inserted?.length) return { status: 'applied' };
  }

  const { data: updated, error: updateError } = await supabase
    .from('entitlements')
    .update(fields)
    .eq('user_id', userId)
    .eq('entitlement_id', entitlementId)
    .or(notNewerThan(eventAt))
    .select('user_id');

  if (updateError) {
    console.error(`${LOG_PREFIX} Update failed for ${entitlementId}:`, updateError);
    return { status: 'error' };
  }
  // Zero rows: a newer event reached the row between the read and this write.
  return { status: updated?.length ? 'applied' : 'stale' };
}

/**
 * Whether a webhook delivery may have left the row without the expiry
 * RevenueCat knows about, so the route must ask RevenueCat directly.
 *
 * Two cases, both seen in production:
 *
 *   * A STALE event was dropped. Events written in the same second can land in
 *     either order. An offer-code redemption followed at once by turning off
 *     auto-renew sends INITIAL_PURCHASE and CANCELLATION seconds apart. When the
 *     CANCELLATION is saved first, the INITIAL_PURCHASE is "older" and dropped,
 *     and it was the only event carrying the expiry. The ordering guard is right
 *     to refuse it as a write, but that information is now lost.
 *   * The event carried NO expiry (an UNSUBSCRIBE cancellation, a billing issue
 *     with no grace date). Applied to a row that never had one, it creates or
 *     leaves a row with expires_at null: entitled in RevenueCat, locked out here.
 *
 * Reconciling is safe in both cases because reconcile_entitlement can only
 * grant or extend, never revoke (see lib/revenuecat/api.ts).
 */
export function needsReconcile(results: ApplyResult[], patch: EntitlementPatch): boolean {
  if (results.some((r) => r.status === 'stale')) return true;
  return patch.expires_at == null;
}

/**
 * Expire the source side of a TRANSFER, under the same ordering guard. A source
 * row that has since seen a newer event (the account bought again) is left
 * alone rather than revoked by a transfer that arrived late.
 */
export async function revokeTransferredSource(
  supabase: AdminClient,
  params: { userId: string; entitlementId: string; event: RevenueCatEvent; eventAt: string },
): Promise<{ error: unknown }> {
  const { userId, entitlementId, event, eventAt } = params;
  const { error } = await supabase
    .from('entitlements')
    .update({
      expires_at: eventAt,
      will_renew: false,
      last_event_id: event.id ?? null,
      last_event_type: event.type ?? null,
      last_event_at: eventAt,
    })
    .eq('user_id', userId)
    .eq('entitlement_id', entitlementId)
    .or(notNewerThan(eventAt));
  return { error };
}
