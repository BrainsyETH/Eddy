// src/app/api/cron/push-receipts/route.ts
// GET/POST /api/cron/push-receipts — the second half of sending a push.
//
// A ticket from /push/send only means Expo accepted the message. Whether APNs
// actually took it arrives later, in a RECEIPT, and that is where
// `DeviceNotRegistered` almost always shows up: someone deleted the app, or
// restored to a new phone. deliver-push prunes on ticket-level
// DeviceNotRegistered, which catches a minority.
//
// Without this pass the failure is silent and permanent. A dead token keeps
// succeeding at the ticket stage, so it never trips the failure_count backstop
// either — the row lives forever, we keep sending into nothing, and the person
// who reinstalled simply never hears from Eddy again with nothing anywhere to
// explain why. 00190 left `ticket_id` and an index behind for exactly this.
//
// A SEPARATE route from deliver-push because the two are on different clocks:
// receipts are not ready for several minutes after a send, and deliver-push
// returns early whenever there is nothing to deliver — which is most passes, and
// precisely when the receipts for the last real fan-out are coming due.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { hasValidMachineBearer } from '@/lib/security/machine-auth';
import { tryCronLock, releaseCronLock } from '@/lib/social/cron-lock';
import { chunkReceiptIds, classifyTicketError, fetchExpoReceipts } from '@/lib/push/expo';
import { pushDisabledReason } from '@/lib/push/kill-switch';
import { logger } from '@/lib/logger';

export const dynamic = 'force-dynamic';

const LOCK_JOB = 'push_receipts';
const LOCK_STALE_SECONDS = 120;

/**
 * Expo needs time to hand the message to APNs. Polling sooner mostly returns
 * "not ready", which costs a request and re-polls the same ticket next pass.
 */
const MIN_AGE_MINUTES = 15;

/** Expo drops receipts after 24h. Past that there is nothing left to learn. */
const RETENTION_HOURS = 24;

/** Bounds one pass. At 1000 ids per request this is 5 HTTP calls. */
const MAX_CHUNKS = 5;

/**
 * Receipt errors that mean the TOKEN is dead rather than the message being bad.
 *
 * `mismatched_credentials` is included deliberately: it means the token belongs
 * to a different Expo project — usually a build from another environment — and
 * it will never be deliverable by us however many times we try.
 */
const FATAL_FOR_TOKEN = new Set(['device_not_registered', 'mismatched_credentials']);

interface DeliveryRow {
  event_id: string;
  device_token_id: string;
  ticket_id: string;
}

async function run(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error('[push-receipts] CRON_SECRET not configured', new Error('missing CRON_SECRET'));
    return NextResponse.json({ error: 'Cron secret not configured' }, { status: 500 });
  }
  if (!hasValidMachineBearer(request.headers.get('authorization'), cronSecret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();

  // The same switch that stops sending stops asking. If push is off, the
  // outstanding tickets can wait — and a kill switch that leaves half the
  // pipeline running is not a kill switch.
  const disabled = await pushDisabledReason(supabase);
  if (disabled) {
    return NextResponse.json({ skipped: true, reason: disabled });
  }

  const gotLock = await tryCronLock(supabase, LOCK_JOB, LOCK_STALE_SECONDS);
  if (!gotLock) {
    return NextResponse.json({ skipped: true, reason: 'concurrent run' });
  }

  const startedAt = Date.now();
  try {
    const now = Date.now();
    const readyBefore = new Date(now - MIN_AGE_MINUTES * 60 * 1000).toISOString();
    const expiredBefore = new Date(now - RETENTION_HOURS * 60 * 60 * 1000).toISOString();

    // Tickets Expo has already forgotten. Marking them checked is the whole
    // action: there is no answer left to get, and leaving them unchecked would
    // grow the poll's index without bound.
    const { data: expiredRows } = await supabase
      .from('alert_push_deliveries')
      .select('event_id, device_token_id')
      .eq('status', 'sent')
      .not('ticket_id', 'is', null)
      .is('receipt_checked_at', null)
      .lt('sent_at', expiredBefore)
      .limit(2000);

    const expired = (expiredRows ?? []) as Array<{ event_id: string; device_token_id: string }>;
    for (const row of expired) {
      await supabase
        .from('alert_push_deliveries')
        .update({ receipt_checked_at: new Date().toISOString() })
        .eq('event_id', row.event_id)
        .eq('device_token_id', row.device_token_id);
    }

    const { data: pendingRows, error: pendingError } = await supabase
      .from('alert_push_deliveries')
      .select('event_id, device_token_id, ticket_id')
      .eq('status', 'sent')
      .not('ticket_id', 'is', null)
      .is('receipt_checked_at', null)
      .gte('sent_at', expiredBefore)
      .lt('sent_at', readyBefore)
      .order('sent_at', { ascending: true })
      .limit(MAX_CHUNKS * 1000);

    if (pendingError) {
      logger.error('[push-receipts] could not read pending deliveries', pendingError);
      return NextResponse.json({ error: 'Could not read deliveries' }, { status: 500 });
    }

    const pending = (pendingRows ?? []) as DeliveryRow[];
    if (pending.length === 0) {
      return NextResponse.json({ ok: true, checked: 0, expired: expired.length });
    }

    // One ticket id can in principle back more than one row, so map rather than
    // assume a 1:1 with the response.
    const rowsByTicket = new Map<string, DeliveryRow[]>();
    for (const row of pending) {
      const bucket = rowsByTicket.get(row.ticket_id);
      if (bucket) bucket.push(row);
      else rowsByTicket.set(row.ticket_id, [row]);
    }

    let checked = 0;
    let errored = 0;
    const deadTokens = new Set<string>();

    for (const chunk of chunkReceiptIds([...rowsByTicket.keys()])) {
      const receipts = await fetchExpoReceipts(chunk);

      for (const [ticketId, receipt] of receipts) {
        const rows = rowsByTicket.get(ticketId);
        if (!rows) continue;

        const errorKind = classifyTicketError(receipt);
        if (errorKind) errored++;
        if (errorKind && FATAL_FOR_TOKEN.has(errorKind)) {
          for (const row of rows) deadTokens.add(row.device_token_id);
        }

        for (const row of rows) {
          checked++;
          await supabase
            .from('alert_push_deliveries')
            .update({
              receipt_checked_at: new Date().toISOString(),
              // A receipt error supersedes the optimistic 'sent': the ticket
              // was accepted, the delivery was not.
              ...(errorKind ? { status: 'error', error_code: errorKind } : {}),
            })
            .eq('event_id', row.event_id)
            .eq('device_token_id', row.device_token_id);
        }
      }

      // Tickets Expo did not answer for are left UNCHECKED on purpose — the
      // receipt is simply not ready. Marking them would throw away the only
      // chance to learn that the device is gone.
    }

    if (deadTokens.size > 0) {
      await supabase
        .from('device_tokens')
        .update({ disabled_at: new Date().toISOString() })
        .in('id', [...deadTokens]);
    }

    const durationMs = Date.now() - startedAt;
    logger.info('[push-receipts] pass complete', {
      pending: pending.length,
      checked,
      errored,
      tokensDisabled: deadTokens.size,
      expired: expired.length,
      durationMs,
    });

    return NextResponse.json({
      ok: true,
      pending: pending.length,
      checked,
      errored,
      tokensDisabled: deadTokens.size,
      expired: expired.length,
      durationMs,
    });
  } catch (error) {
    logger.error('[push-receipts] pass failed', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  } finally {
    await releaseCronLock(supabase, LOCK_JOB);
  }
}

export async function GET(request: NextRequest) {
  return run(request);
}

export async function POST(request: NextRequest) {
  return run(request);
}
