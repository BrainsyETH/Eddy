// src/app/api/webhooks/revenuecat/route.ts
// POST /api/webhooks/revenuecat — RevenueCat subscription lifecycle receiver.
//
// This is the ONLY writer of the `entitlements` table: the app never tells the
// backend what it bought, so a tampered client cannot grant itself Eddy Premium.
//
// Authenticity: RevenueCat sends a fixed Authorization header configured in
// its dashboard (Project → Integrations → Webhooks). Set that value to
//     Bearer <REVENUECAT_WEBHOOK_SECRET>
// so it verifies with the same fail-closed, constant-time helper the cron
// callbacks use. Like the Resend receiver, this route is intentionally PUBLIC
// (it lives outside /api/admin) and proves authenticity by shared secret.
//
// Semantics live in src/lib/revenuecat/events.ts (pure, unit-tested). This
// file owns auth, idempotency and persistence.
//
// Retry contract: RevenueCat retries on 5xx. So configuration problems and
// transient DB errors return 5xx (retry), while permanently unprocessable
// events (an appUserID that isn't a Supabase uid, a deleted user) return 200
// with a server-side warning — retrying those would never succeed.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasValidMachineBearer } from '@/lib/security/machine-auth';
import { DEFAULT_ENTITLEMENT_ID } from '@/lib/entitlement';
import {
  computeEntitlementPatch,
  entitlementIdsFor,
  eventTimestamp,
  toSupabaseUserId,
  type EntitlementPatch,
  type RevenueCatEvent,
} from '@/lib/revenuecat/events';

export const dynamic = 'force-dynamic';

const LOG_PREFIX = '[RevenueCatWebhook]';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = any;

interface ApplyResult {
  status: 'applied' | 'duplicate' | 'stale' | 'unknown_user' | 'error';
}

/**
 * Idempotent upsert of one (user, entitlement) pair.
 *
 * Two guards make redelivery safe without a separate processed-events table:
 *   * same event id as the last applied one → duplicate, no-op
 *   * event older than the last applied one → stale, no-op (webhooks can
 *     arrive out of order; a late CANCELLATION must not undo a newer RENEWAL)
 */
async function applyToEntitlement(
  supabase: AdminClient,
  params: {
    userId: string;
    entitlementId: string;
    patch: EntitlementPatch;
    event: RevenueCatEvent;
    eventAt: string;
  }
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

  if (existing?.last_event_id && event.id && existing.last_event_id === event.id) {
    return { status: 'duplicate' };
  }

  if (existing?.last_event_at && new Date(eventAt) < new Date(existing.last_event_at)) {
    return { status: 'stale' };
  }

  // Only fields the event actually carries are written; `undefined` entries
  // are dropped so a BILLING_ISSUE can't blank an existing expiry.
  const row: Record<string, unknown> = {
    user_id: userId,
    entitlement_id: entitlementId,
    rc_app_user_id: event.app_user_id ?? null,
    rc_original_app_user_id: event.original_app_user_id ?? null,
    last_event_id: event.id ?? null,
    last_event_type: event.type ?? null,
    last_event_at: eventAt,
  };
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) row[key] = value;
  }

  const { error: upsertError } = await supabase
    .from('entitlements')
    .upsert(row, { onConflict: 'user_id,entitlement_id' });

  if (upsertError) {
    // 23503 = FK violation: the appUserID is a well-formed uuid but no such
    // auth user exists (deleted account). Not retryable.
    if (upsertError.code === '23503') {
      console.warn(`${LOG_PREFIX} No auth user for ${userId} — dropping event ${event.id}`);
      return { status: 'unknown_user' };
    }
    console.error(`${LOG_PREFIX} Upsert failed for ${entitlementId}:`, upsertError);
    return { status: 'error' };
  }

  return { status: 'applied' };
}

/**
 * TRANSFER — the subscription moved between Apple IDs / app users. Re-key the
 * row rather than granting fresh access: copy the source's remaining
 * entitlement to the target, then expire the source. Without this, a
 * transferred sub would leave the losing account entitled forever.
 */
async function applyTransfer(
  supabase: AdminClient,
  event: RevenueCatEvent,
  eventAt: string
): Promise<ApplyResult> {
  const fromIds = (event.transferred_from ?? []).map(toSupabaseUserId).filter((id): id is string => !!id);
  const toIds = (event.transferred_to ?? []).map(toSupabaseUserId).filter((id): id is string => !!id);

  if (!toIds.length) {
    console.warn(`${LOG_PREFIX} TRANSFER ${event.id} has no usable transferred_to — ignoring`);
    return { status: 'unknown_user' };
  }

  for (const targetId of toIds) {
    for (const sourceId of fromIds) {
      const { data: sourceRows, error: readError } = await supabase
        .from('entitlements')
        .select('entitlement_id, expires_at, will_renew, product_id, store, environment')
        .eq('user_id', sourceId);

      if (readError) {
        console.error(`${LOG_PREFIX} TRANSFER read failed:`, readError);
        return { status: 'error' };
      }

      for (const source of sourceRows ?? []) {
        const moved = await applyToEntitlement(supabase, {
          userId: targetId,
          entitlementId: source.entitlement_id,
          patch: {
            expires_at: source.expires_at,
            will_renew: source.will_renew ?? undefined,
            product_id: source.product_id,
            store: source.store,
            environment: source.environment,
            billing_issue_detected_at: null,
          },
          event,
          eventAt,
        });
        if (moved.status === 'error') return moved;

        // Revoke on the source side, stamped with this event so a redelivery
        // is caught by the duplicate guard.
        const { error: revokeError } = await supabase
          .from('entitlements')
          .update({
            expires_at: eventAt,
            will_renew: false,
            last_event_id: event.id ?? null,
            last_event_type: event.type ?? null,
            last_event_at: eventAt,
          })
          .eq('user_id', sourceId)
          .eq('entitlement_id', source.entitlement_id);

        if (revokeError) {
          console.error(`${LOG_PREFIX} TRANSFER revoke failed:`, revokeError);
          return { status: 'error' };
        }
      }
    }
  }

  return { status: 'applied' };
}

export async function POST(request: NextRequest) {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;

  // Fail closed: without the secret we cannot prove authenticity, and a 500
  // both surfaces the misconfiguration and makes RevenueCat retry.
  if (!secret) {
    console.error(`${LOG_PREFIX} Missing REVENUECAT_WEBHOOK_SECRET`);
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  if (!hasValidMachineBearer(request.headers.get('authorization'), secret)) {
    console.warn(`${LOG_PREFIX} Rejected request with invalid Authorization header`);
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let event: RevenueCatEvent;
  try {
    const body = await request.json();
    event = body?.event ?? {};
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const type = event.type?.toUpperCase();
  if (!type) {
    return NextResponse.json({ error: 'Missing event type' }, { status: 400 });
  }

  // RevenueCat's dashboard "Send test event" button — acknowledge loudly so
  // setup can be verified end to end without touching data.
  if (type === 'TEST') {
    console.log(`${LOG_PREFIX} Received TEST event — webhook wiring is good`);
    return NextResponse.json({ ok: true, handled: 'TEST' });
  }

  const eventAt = eventTimestamp(event);
  const supabase = createAdminClient();

  if (type === 'TRANSFER') {
    const result = await applyTransfer(supabase, event, eventAt);
    if (result.status === 'error') {
      return NextResponse.json({ error: 'Could not apply transfer' }, { status: 500 });
    }
    return NextResponse.json({ ok: true, handled: type, status: result.status });
  }

  const patch = computeEntitlementPatch(event);
  if (!patch) {
    // Known-but-inert (e.g. SUBSCRIBER_ALIAS) or a type RevenueCat added
    // later. Acknowledge so it isn't retried forever.
    console.log(`${LOG_PREFIX} Ignoring unhandled event type ${type}`);
    return NextResponse.json({ ok: true, handled: type, status: 'ignored' });
  }

  const userId = toSupabaseUserId(event.app_user_id);
  if (!userId) {
    // Purchases are supposed to happen only after Apple sign-in, so the
    // appUserID should always be a Supabase uid. An RC anonymous id here means
    // the app paywall let someone buy while anonymous — log it as a real bug.
    console.error(
      `${LOG_PREFIX} ${type} ${event.id} has non-Supabase app_user_id "${event.app_user_id}" — entitlement NOT granted`
    );
    return NextResponse.json({ ok: true, handled: type, status: 'unmapped_user' });
  }

  const statuses: string[] = [];
  for (const entitlementId of entitlementIdsFor(event, DEFAULT_ENTITLEMENT_ID)) {
    const result = await applyToEntitlement(supabase, { userId, entitlementId, patch, event, eventAt });
    if (result.status === 'error') {
      return NextResponse.json({ error: 'Could not apply event' }, { status: 500 });
    }
    statuses.push(`${entitlementId}:${result.status}`);
  }

  console.log(`${LOG_PREFIX} ${type} ${event.id} → ${statuses.join(', ')}`);
  return NextResponse.json({ ok: true, handled: type, statuses });
}
