// src/app/api/me/dam-alerts/route.ts
// GET    /api/me/dam-alerts          — the caller's dam generation alerts
// PUT    /api/me/dam-alerts          — set one ({ damId, atStart?, hourBefore? })
// DELETE /api/me/dam-alerts?damId=…  — remove one
//
// A dam generation alert pushes when generation is POSTED to start at a dam:
// at the posted time, an hour before it, or both. ADR 0020 has the decision;
// src/lib/alerts/dam-generation.ts has the rules; the delivery cron sends.
//
// ── One alert per dam, changed one switch at a time ─────────────────────────
// The alert is two switches on the dam screen, and the app sends ONLY THE ONE
// THAT MOVED. The other keeps whatever the server holds. It first sent both,
// read from its own copy of the alert — and before that copy had loaded, both
// read off, so switching "an hour before" on silently cleared a saved "at the
// start".
//
// ── The merge is one database call, not three ──────────────────────────────
// This route then did the merge itself: read both times, combine, write both
// back. Two requests enabling different switches at once each read before the
// other wrote, and the second write cleared the first. So PUT makes exactly ONE
// call, set_dam_generation_alert (migration 20261117230000), which reads,
// merges and writes — or deletes, when both end up off — in one transaction
// behind a lock on (user, dam). Do not add a read or a second write around it:
// src/lib/dam-alerts-route.test.ts fires simultaneous requests and counts.
//
// Both ending up off deletes the row — an alert with no time to fire at is not
// a paused alert, it is nothing — and the response says so with `alert: null`.
//
// ── Free, and a permanent account to write ──────────────────────────────────
// Free for the reason every alert is (see /api/me/alert-subscriptions). A
// permanent user is required to write because push needs a durable identity to
// route to; the RLS policy enforces it independently. DELETE and GET take any
// session, since turning an alert off must always work.
//
// ── This route IS the foreign key ───────────────────────────────────────────
// dam_generation_alerts.dam_id has none, as starred_dams has none: dams are
// read through, not stored. So the registry is checked here, and so is whether
// the dam has a posted schedule at all — an alert on a dam SWPA never
// schedules could not fire, and a switch that cannot fire is worse than none.

import { NextRequest, NextResponse } from 'next/server';
import { jsonPrivate } from '@/lib/api-utils';
import { rateLimit } from '@/lib/rate-limit';
import { requirePermanentUser, requireUser } from '@/lib/supabase/request';
import { getUsaceDam } from '@/lib/flow-providers/usace-registry';
import type { DamGenerationAlert, DamGenerationAlertResponse, DamGenerationAlertsResponse } from '@/types/api';

export const dynamic = 'force-dynamic';

const SELECT = 'dam_id, notify_at_start, notify_hour_before, created_at';

interface Row {
  dam_id: string;
  notify_at_start: boolean;
  notify_hour_before: boolean;
  created_at: string;
}

/** Null for a dam that has left the registry: nothing to name and nowhere to open. */
function toAlert(row: Row): DamGenerationAlert | null {
  const dam = getUsaceDam(row.dam_id);
  if (!dam) return null;
  return {
    damId: row.dam_id,
    damName: dam.name,
    atStart: row.notify_at_start,
    hourBefore: row.notify_hour_before,
    createdAt: row.created_at,
  };
}

/** Table missing in Postgres (42P01) or in PostgREST's schema cache (PGRST205). */
function tableMissing(error: { code?: string } | null): boolean {
  return error?.code === '42P01' || error?.code === 'PGRST205';
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;
    const { supabase, user } = auth;

    // Keyed on the USER, never the IP: carrier NAT collapses thousands of
    // mobile subscribers into one bucket.
    const limited = await rateLimit(`me-dam-alerts-read:${user.id}`, 120, 15 * 60 * 1000);
    if (limited) return limited;

    const { data, error } = await supabase
      .from('dam_generation_alerts')
      .select(SELECT)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      // Deployed ahead of its migration: nobody can hold an alert yet, so the
      // honest answer is an empty list rather than a failure.
      if (tableMissing(error)) return jsonPrivate({ alerts: [] } satisfies DamGenerationAlertsResponse);
      console.error('Error listing dam alerts:', error);
      return jsonPrivate({ error: 'Could not load dam alerts' }, { status: 500 });
    }

    const response: DamGenerationAlertsResponse = {
      alerts: ((data ?? []) as unknown as Row[]).flatMap((row) => toAlert(row) ?? []),
    };
    return jsonPrivate(response);
  } catch (error) {
    console.error('Error listing dam alerts:', error);
    return jsonPrivate({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requirePermanentUser(request);
    if (auth instanceof NextResponse) return auth;
    const { supabase, user } = auth;

    const limited = await rateLimit(`me-dam-alerts-write:${user.id}`, 60, 15 * 60 * 1000);
    if (limited) return limited;

    const body = (await request.json().catch(() => null)) as {
      damId?: unknown;
      atStart?: unknown;
      hourBefore?: unknown;
    } | null;

    if (!body || typeof body.damId !== 'string' || !body.damId) {
      return jsonPrivate({ error: 'damId required' }, { status: 400 });
    }
    const sent = (value: unknown) => value !== undefined;
    if (
      (!sent(body.atStart) && !sent(body.hourBefore)) ||
      (sent(body.atStart) && typeof body.atStart !== 'boolean') ||
      (sent(body.hourBefore) && typeof body.hourBefore !== 'boolean')
    ) {
      return jsonPrivate({ error: 'Send atStart, hourBefore or both, as true or false' }, { status: 400 });
    }
    const damId = body.damId;
    const atStart = typeof body.atStart === 'boolean' ? body.atStart : null;
    const hourBefore = typeof body.hourBefore === 'boolean' ? body.hourBefore : null;

    // Checked only when a time is being switched ON. Switching off must work
    // for a dam that has since left the registry, as DELETE does.
    if (atStart === true || hourBefore === true) {
      const dam = getUsaceDam(damId);
      if (!dam) return jsonPrivate({ error: 'Dam not found' }, { status: 404 });
      if (!dam.swpaCode) {
        return jsonPrivate(
          { error: 'This dam has no posted generation schedule to alert on.' },
          { status: 422 },
        );
      }
    }

    // The one database call. A null argument leaves that switch as it is.
    const { data, error } = await supabase.rpc('set_dam_generation_alert', {
      p_dam_id: damId,
      p_at_start: atStart,
      p_hour_before: hourBefore,
    });

    if (error) {
      // Deployed ahead of its migration: the function is not there yet.
      if (error.code === 'PGRST202' || error.code === '42883' || tableMissing(error)) {
        return jsonPrivate({ error: 'Dam alerts are not available yet. Try again soon.' }, { status: 503 });
      }
      console.error('Error saving dam alert:', error);
      return jsonPrivate({ error: 'Could not save that alert' }, { status: 500 });
    }

    // setof: one row when an alert remains, none when both times are off.
    const row = (Array.isArray(data) ? data[0] : data) as Row | null | undefined;
    return jsonPrivate({ alert: row ? toAlert(row) : null } satisfies DamGenerationAlertResponse);
  } catch (error) {
    console.error('Error saving dam alert:', error);
    return jsonPrivate({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;
    const { supabase, user } = auth;

    // Shares the write budget with PUT — a switch is both.
    const limited = await rateLimit(`me-dam-alerts-write:${user.id}`, 60, 15 * 60 * 1000);
    if (limited) return limited;

    const damId = request.nextUrl.searchParams.get('damId');
    if (!damId) return jsonPrivate({ error: 'damId required' }, { status: 400 });

    const { error } = await supabase
      .from('dam_generation_alerts')
      .delete()
      .eq('user_id', user.id)
      .eq('dam_id', damId);

    if (error && !tableMissing(error)) {
      console.error('Error removing dam alert:', error);
      return jsonPrivate({ error: 'Could not remove that alert' }, { status: 500 });
    }
    return jsonPrivate({ ok: true });
  } catch (error) {
    console.error('Error removing dam alert:', error);
    return jsonPrivate({ error: 'Internal server error' }, { status: 500 });
  }
}
