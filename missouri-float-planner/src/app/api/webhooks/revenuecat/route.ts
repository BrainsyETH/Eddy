import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/api/errors';
import {
  clearsBillingIssue,
  entitlementIds,
  eventDate,
  REVENUECAT_APPLIED_TYPES,
  transferredUuids,
  uuidCandidates,
  willRenewFor,
  type RevenueCatPayload,
} from '@/lib/revenuecat/events';
import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

function secureEqual(received: string, expected: string): boolean {
  const a = Buffer.from(received);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const expected = process.env.REVENUECAT_WEBHOOK_AUTHORIZATION;
  if (!expected) return apiError(503, 'service_unavailable', 'RevenueCat webhook is not configured');
  const received = request.headers.get('authorization') || '';
  if (!secureEqual(received, expected)) return apiError(401, 'invalid_token', 'Invalid webhook authorization');

  const payload = await request.json().catch(() => null) as RevenueCatPayload | null;
  const event = payload?.event;
  if (!event?.id || !event.type || !Number.isFinite(event.event_timestamp_ms)) {
    return apiError(400, 'validation_failed', 'Invalid RevenueCat event');
  }

  const admin = createAdminClient();
  const eventAt = eventDate(event.event_timestamp_ms)!;
  const ledger = {
    event_id: event.id,
    event_type: event.type,
    event_timestamp: eventAt,
    app_user_id: event.app_user_id || null,
    original_app_user_id: event.original_app_user_id || null,
    aliases: event.aliases || [],
    environment: event.environment || null,
    payload,
    status: 'received',
  };
  const { error: ledgerError } = await admin.from('revenuecat_webhook_events').insert(ledger);
  if (ledgerError?.code === '23505') {
    const { data: existing } = await admin.from('revenuecat_webhook_events')
      .select('status').eq('event_id', event.id).maybeSingle();
    if (existing?.status === 'applied' || existing?.status === 'ignored') {
      return NextResponse.json({ ok: true, duplicate: true });
    }
    // A prior attempt failed or died after writing the ledger. Continue from
    // the durable payload; the entitlement RPC remains timestamp-idempotent.
  }
  else if (ledgerError) {
    console.error('[RevenueCat] ledger insert failed:', ledgerError);
    return apiError(500, 'internal_error', 'Could not persist webhook event');
  }

  if (!REVENUECAT_APPLIED_TYPES.has(event.type)) {
    await admin.from('revenuecat_webhook_events').update({
      status: 'ignored', processed_at: new Date().toISOString(),
    }).eq('event_id', event.id);
    return NextResponse.json({ ok: true, ignored: event.type });
  }

  try {
    if (event.type === 'TRANSFER') {
      const sources = transferredUuids(event.transferred_from);
      const targets = transferredUuids(event.transferred_to);
      const target = targets[0];
      if (!target) throw new Error('TRANSFER has no UUID destination');

      for (const source of sources) {
        const { data: sourceRows } = await admin.from('entitlements').select('*').eq('user_id', source);
        for (const row of sourceRows || []) {
          const { error: targetError } = await admin.rpc('apply_revenuecat_entitlement_event', {
            p_user_id: target,
            p_entitlement_id: row.entitlement_id,
            p_expires_at: row.expires_at,
            p_will_renew: row.will_renew,
            p_product_id: row.product_id,
            p_store: event.store || row.store,
            p_environment: event.environment || row.environment,
            p_billing_issue_at: row.billing_issue_detected_at,
            p_clear_billing_issue: false,
            p_rc_app_user_id: target,
            p_rc_original_app_user_id: event.original_app_user_id || row.rc_original_app_user_id,
            p_event_id: event.id,
            p_event_type: event.type,
            p_event_at: eventAt,
          });
          if (targetError) throw targetError;

          const { error: sourceError } = await admin.rpc('apply_revenuecat_entitlement_event', {
            p_user_id: source,
            p_entitlement_id: row.entitlement_id,
            p_expires_at: eventAt,
            p_will_renew: false,
            p_product_id: row.product_id,
            p_store: event.store || row.store,
            p_environment: event.environment || row.environment,
            p_billing_issue_at: null,
            p_clear_billing_issue: true,
            p_rc_app_user_id: source,
            p_rc_original_app_user_id: row.rc_original_app_user_id,
            p_event_id: event.id,
            p_event_type: event.type,
            p_event_at: eventAt,
          });
          if (sourceError) throw sourceError;
        }
      }
    } else {
      const userId = uuidCandidates(event)[0];
      if (!userId) throw new Error('No Supabase UUID found in RevenueCat identities');
      const expiration = eventDate(event.expiration_at_ms);
      for (const entitlementId of entitlementIds(event)) {
        const { error } = await admin.rpc('apply_revenuecat_entitlement_event', {
          p_user_id: userId,
          p_entitlement_id: entitlementId,
          p_expires_at: expiration,
          p_will_renew: willRenewFor(event.type),
          p_product_id: event.product_id || null,
          p_store: event.store || null,
          p_environment: event.environment || null,
          p_billing_issue_at: event.type === 'BILLING_ISSUE' ? eventAt : null,
          p_clear_billing_issue: clearsBillingIssue(event.type),
          p_rc_app_user_id: event.app_user_id || userId,
          p_rc_original_app_user_id: event.original_app_user_id || null,
          p_event_id: event.id,
          p_event_type: event.type,
          p_event_at: eventAt,
        });
        if (error) throw error;
      }
    }

    await admin.from('revenuecat_webhook_events').update({
      status: 'applied', processed_at: new Date().toISOString(), error: null,
    }).eq('event_id', event.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[RevenueCat] processing failed:', error);
    await admin.from('revenuecat_webhook_events').update({
      status: 'failed', error: message.slice(0, 1000), processed_at: new Date().toISOString(),
    }).eq('event_id', event.id);
    return apiError(500, 'internal_error', 'Could not process webhook event');
  }
}
