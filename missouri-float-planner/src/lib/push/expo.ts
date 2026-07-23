import type { SupabaseClient } from '@supabase/supabase-js';
import { retryDelayMs, subscriptionMatches, type ConditionEventKind, type SubscriptionKind } from './policy';

const EXPO_SEND_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_RECEIPTS_URL = 'https://exp.host/--/api/v2/push/getReceipts';
const MAX_ATTEMPTS = 5;

type Admin = SupabaseClient;

function titleFor(kind: ConditionEventKind): string {
  if (kind === 'floatable') return 'Your river is floatable';
  if (kind === 'warning') return 'River condition warning';
  if (kind === 'easing') return 'Water is easing';
  return 'River condition update';
}

export async function enqueuePushDeliveries(admin: Admin, limit = 100): Promise<number> {
  const { data: events, error } = await admin
    .from('river_condition_events')
    .select('id, river_id, kind, new_condition_code, detected_at')
    .is('push_delivered_at', null)
    .neq('kind', 'info')
    .order('detected_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  let enqueued = 0;

  for (const event of events || []) {
    const { data: subscriptions } = await admin
      .from('alert_subscriptions')
      .select('id, user_id, kind, one_shot, fired_at')
      .eq('river_id', event.river_id)
      .is('fired_at', null);
    const matching = (subscriptions || []).filter((sub) =>
      subscriptionMatches(sub.kind as SubscriptionKind, event.kind as ConditionEventKind));
    if (matching.length === 0) {
      await admin.from('river_condition_events').update({ push_delivered_at: new Date().toISOString() }).eq('id', event.id);
      continue;
    }

    const userIds = matching.map((sub) => sub.user_id);
    const now = new Date().toISOString();
    const { data: entitled } = await admin
      .from('entitlements')
      .select('user_id')
      .in('user_id', userIds)
      .eq('entitlement_id', 'eddy_plus')
      .gt('expires_at', now);
    const entitledIds = new Set((entitled || []).map((row) => row.user_id));
    const eligible = matching.filter((sub) => entitledIds.has(sub.user_id));
    if (eligible.length === 0) {
      await admin.from('river_condition_events').update({ push_delivered_at: now }).eq('id', event.id);
      continue;
    }

    const { data: tokens } = await admin
      .from('device_tokens')
      .select('id, user_id')
      .in('user_id', eligible.map((sub) => sub.user_id))
      .is('disabled_at', null);
    const rows = (tokens || []).map((token) => ({
      event_id: event.id,
      device_token_id: token.id,
      user_id: token.user_id,
    }));
    if (rows.length) {
      const { error: insertError } = await admin
        .from('push_deliveries')
        .upsert(rows, { onConflict: 'event_id,device_token_id', ignoreDuplicates: true });
      if (insertError) throw insertError;
      enqueued += rows.length;
    } else {
      await admin.from('river_condition_events').update({ push_delivered_at: now }).eq('id', event.id);
    }

    const oneShotIds = rows.length ? eligible.filter((sub) => sub.one_shot).map((sub) => sub.id) : [];
    if (oneShotIds.length) {
      await admin.from('alert_subscriptions').update({ fired_at: now }).in('id', oneShotIds).is('fired_at', null);
    }
  }
  return enqueued;
}

export async function sendPendingPushes(admin: Admin, limit = 100): Promise<number> {
  const now = new Date().toISOString();
  const { data: deliveries, error } = await admin
    .from('push_deliveries')
    .select('id, attempts, device_token_id, event_id, device_tokens!inner(expo_push_token), river_condition_events!inner(kind, new_condition_code, river_id)')
    .in('status', ['pending', 'retry'])
    .lte('next_attempt_at', now)
    .order('created_at', { ascending: true })
    .limit(limit);
  if (error) throw error;
  if (!deliveries?.length) return 0;

  const messages = deliveries.map((delivery) => {
    const token = Array.isArray(delivery.device_tokens) ? delivery.device_tokens[0] : delivery.device_tokens;
    const event = Array.isArray(delivery.river_condition_events) ? delivery.river_condition_events[0] : delivery.river_condition_events;
    return {
      to: token.expo_push_token,
      sound: 'default',
      title: titleFor(event.kind as ConditionEventKind),
      body: `Conditions changed to ${String(event.new_condition_code).replace('_', ' ')}.`,
      data: { eventId: delivery.event_id, riverId: event.river_id, kind: event.kind },
    };
  });

  const response = await fetch(EXPO_SEND_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(messages),
  });
  if (!response.ok) throw new Error(`Expo send failed (${response.status})`);
  const result = await response.json() as { data?: Array<{ status: string; id?: string; message?: string; details?: { error?: string } }> };
  const tickets = result.data || [];

  await Promise.all(deliveries.map(async (delivery, index) => {
    const ticket = tickets[index];
    const attempts = delivery.attempts + 1;
    if (ticket?.status === 'ok' && ticket.id) {
      return admin.from('push_deliveries').update({
        status: 'ticketed', expo_ticket_id: ticket.id, attempts, updated_at: now, last_error: null,
      }).eq('id', delivery.id);
    }
    const permanent = ticket?.details?.error === 'DeviceNotRegistered' || attempts >= MAX_ATTEMPTS;
    await admin.rpc('mark_device_token_failure', {
      p_token_id: delivery.device_token_id,
      p_disable: ticket?.details?.error === 'DeviceNotRegistered',
    });
    return admin.from('push_deliveries').update({
      status: permanent ? (ticket?.details?.error === 'DeviceNotRegistered' ? 'disabled' : 'failed') : 'retry',
      attempts,
      next_attempt_at: new Date(Date.now() + retryDelayMs(attempts)).toISOString(),
      last_error: ticket?.message || ticket?.details?.error || 'Expo rejected message',
      updated_at: now,
    }).eq('id', delivery.id);
  }));
  await finalizeEvents(admin, Array.from(new Set(deliveries.map((row) => row.event_id))));
  return deliveries.length;
}

async function finalizeEvents(admin: Admin, eventIds: string[]) {
  const now = new Date().toISOString();
  for (const eventId of eventIds) {
    const { count } = await admin.from('push_deliveries').select('id', { count: 'exact', head: true })
      .eq('event_id', eventId).in('status', ['pending', 'retry', 'ticketed']);
    if ((count || 0) === 0) {
      await admin.from('river_condition_events').update({ push_delivered_at: now }).eq('id', eventId);
    }
  }
}

export async function checkPushReceipts(admin: Admin, limit = 1000): Promise<number> {
  const cutoff = new Date(Date.now() - 5 * 60_000).toISOString();
  const { data: deliveries, error } = await admin
    .from('push_deliveries')
    .select('id, event_id, device_token_id, expo_ticket_id, attempts')
    .eq('status', 'ticketed')
    .lt('updated_at', cutoff)
    .limit(limit);
  if (error) throw error;
  if (!deliveries?.length) return 0;
  const ids = deliveries.map((row) => row.expo_ticket_id).filter(Boolean);
  const response = await fetch(EXPO_RECEIPTS_URL, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids }),
  });
  if (!response.ok) throw new Error(`Expo receipt request failed (${response.status})`);
  const result = await response.json() as { data?: Record<string, { status: string; message?: string; details?: { error?: string } }> };
  const now = new Date().toISOString();

  for (const delivery of deliveries) {
    const receipt = delivery.expo_ticket_id ? result.data?.[delivery.expo_ticket_id] : undefined;
    if (!receipt) continue;
    if (receipt.status === 'ok') {
      await admin.from('push_deliveries').update({ status: 'delivered', delivered_at: now, updated_at: now }).eq('id', delivery.id);
    } else {
      const disabled = receipt.details?.error === 'DeviceNotRegistered';
      await admin.rpc('mark_device_token_failure', {
        p_token_id: delivery.device_token_id,
        p_disable: disabled,
      });
      await admin.from('push_deliveries').update({
        status: disabled ? 'disabled' : delivery.attempts >= MAX_ATTEMPTS ? 'failed' : 'retry',
        next_attempt_at: new Date(Date.now() + retryDelayMs(delivery.attempts)).toISOString(),
        last_error: receipt.message || receipt.details?.error || 'Push receipt failed',
        updated_at: now,
      }).eq('id', delivery.id);
    }
  }

  await finalizeEvents(admin, Array.from(new Set(deliveries.map((row) => row.event_id))));
  return deliveries.length;
}
