// src/app/api/me/alert-subscriptions/route.ts
// GET    /api/me/alert-subscriptions            — list the caller's push subscriptions
// POST   /api/me/alert-subscriptions            — subscribe to a curated river
// DELETE /api/me/alert-subscriptions?riverId=…  — unsubscribe
//
// This is the backend half of the "🔔 notify me" tap. Subscriptions here are for
// CURATED Eddy Rivers (river_id → rivers).
//
// ── Why nothing here is entitlement-gated ────────────────────────────────
//
// POST used to require an active entitlement and answer 402, which the app
// turned into the contextual paywall. That boundary ran straight through the
// middle of the alert engine and the engine lost: `warning` pushes were declared
// free on the grounds that paywalling a hazard is a liability, yet no free user
// could hold the subscription needed to receive one, and the app — written
// against a paid floatability product — asked for `kind: 'floatable'`, which
// matches no warning at all. The result was an app that promised danger alerts
// it was structurally incapable of sending.
//
// Alerting is free in its entirety now. The tier was collapsed rather than
// arbitrated, so there is no longer a rule here that the fan-out has to agree
// with. What remains paid lives elsewhere: offline downloads and the forecast.
//
// A PERMANENT user is still required for writes, and that is not a tier: push
// needs a durable identity to route to, an anonymous id is replaced on
// reinstall, and the RLS policy in migration 00183 enforces it independently.
//
// These limits fail OPEN (no failClosed), unlike /api/me/device-tokens. The
// writes here are tiny idempotent upserts scoped by RLS, so unlimited access
// during a limiter outage is far less harmful than blocking someone from
// saving a favourite because Upstash hiccuped.

import { NextRequest, NextResponse } from 'next/server';
import { jsonPrivate } from '@/lib/api-utils';
import { rateLimit } from '@/lib/rate-limit';
import { requirePermanentUser, requireUser } from '@/lib/supabase/request';
import type { AlertSubscriptionsResponse } from '@/types/api';

export const dynamic = 'force-dynamic';

const VALID_KINDS = ['floatable', 'safety', 'all'] as const;
type SubscriptionKind = (typeof VALID_KINDS)[number];

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;
    const { supabase, user } = auth;

    // Read alongside stars whenever the app opens.
    // Keyed on the USER, never the IP: carrier NAT collapses thousands of
    // mobile subscribers into one bucket, so a per-IP limit would throttle
    // a whole network because one person's client misbehaved.
    const limited = await rateLimit(`me-subs-read:${user.id}`, 120, 15 * 60 * 1000);
    if (limited) return limited;

    const { data, error } = await supabase
      .from('alert_subscriptions')
      .select('id, river_id, kind, one_shot, fired_at, created_at, rivers!inner(name, slug)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error listing alert subscriptions:', error);
      return jsonPrivate({ error: 'Could not load subscriptions' }, { status: 500 });
    }

    // Untyped client: PostgREST types the to-one embed as an array; at
    // runtime it's a single object. Normalize either shape.
    type RiverEmbed = { name: string; slug: string };
    type SubscriptionRow = {
      id: string;
      river_id: string;
      kind: string;
      one_shot: boolean;
      fired_at: string | null;
      created_at: string;
      rivers: RiverEmbed | RiverEmbed[];
    };

    const response: AlertSubscriptionsResponse = {
      subscriptions: ((data ?? []) as SubscriptionRow[]).map((row) => {
        const river = Array.isArray(row.rivers) ? row.rivers[0] : row.rivers;
        return {
          id: row.id,
          riverId: row.river_id,
          riverName: river?.name ?? '',
          riverSlug: river?.slug ?? '',
          kind: row.kind as SubscriptionKind,
          oneShot: row.one_shot,
          firedAt: row.fired_at,
          createdAt: row.created_at,
        };
      }),
    };

    return jsonPrivate(response);
  } catch (error) {
    console.error('Error listing alert subscriptions:', error);
    return jsonPrivate({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // 401 (no token) and 403 (anonymous) come back ready-to-send. There is no
    // 402 any more — see the header. The app maps 403 to a sign-in prompt, which
    // is what the paywall was standing in for whenever the session was the thing
    // that had actually failed.
    const auth = await requirePermanentUser(request);
    if (auth instanceof NextResponse) return auth;
    const { supabase, user } = auth;

    // Subscribing is per-river and deliberate.
    // Keyed on the USER, never the IP: carrier NAT collapses thousands of
    // mobile subscribers into one bucket, so a per-IP limit would throttle
    // a whole network because one person's client misbehaved.
    const limited = await rateLimit(`me-subs-write:${user.id}`, 60, 15 * 60 * 1000);
    if (limited) return limited;

    const body = await request.json().catch(() => null) as
      | { riverId?: string; riverSlug?: string; kind?: string; oneShot?: boolean }
      | null;
    if (!body?.riverId && !body?.riverSlug) {
      return jsonPrivate({ error: 'riverId or riverSlug required' }, { status: 400 });
    }

    const kind = (body.kind ?? 'all') as SubscriptionKind;
    if (!VALID_KINDS.includes(kind)) {
      return jsonPrivate(
        { error: `kind must be one of ${VALID_KINDS.join(', ')}` },
        { status: 400 }
      );
    }

    let riverId = body.riverId ?? null;
    if (!riverId && body.riverSlug) {
      const { data: river } = await supabase
        .from('rivers')
        .select('id')
        .eq('slug', body.riverSlug)
        .maybeSingle();
      riverId = river?.id ?? null;
    }
    if (!riverId) {
      return jsonPrivate({ error: 'River not found' }, { status: 404 });
    }

    // Re-subscribing updates the kind rather than erroring, and clears
    // fired_at so a spent one-shot can be re-armed.
    const { data: saved, error } = await supabase
      .from('alert_subscriptions')
      .upsert(
        {
          user_id: user.id,
          river_id: riverId,
          kind,
          one_shot: body.oneShot ?? false,
          fired_at: null,
        },
        { onConflict: 'user_id,river_id' }
      )
      .select('id, river_id, kind, one_shot, created_at')
      .single();

    if (error) {
      if (error.code === '23503') {
        return jsonPrivate({ error: 'River not found' }, { status: 404 });
      }
      console.error('Error saving alert subscription:', error);
      return jsonPrivate({ error: 'Could not save subscription' }, { status: 500 });
    }

    return jsonPrivate({
      subscription: {
        id: saved.id,
        riverId: saved.river_id,
        kind: saved.kind,
        oneShot: saved.one_shot,
        createdAt: saved.created_at,
      },
    });
  } catch (error) {
    console.error('Error saving alert subscription:', error);
    return jsonPrivate({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Deliberately NOT entitlement-gated — see header note.
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;
    const { supabase, user } = auth;

    // Shares the write budget with POST.
    // Keyed on the USER, never the IP: carrier NAT collapses thousands of
    // mobile subscribers into one bucket, so a per-IP limit would throttle
    // a whole network because one person's client misbehaved.
    const limited = await rateLimit(`me-subs-write:${user.id}`, 60, 15 * 60 * 1000);
    if (limited) return limited;

    const riverId = request.nextUrl.searchParams.get('riverId');
    if (!riverId) {
      return jsonPrivate({ error: 'riverId required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('alert_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('river_id', riverId);

    if (error) {
      console.error('Error deleting alert subscription:', error);
      return jsonPrivate({ error: 'Could not delete subscription' }, { status: 500 });
    }

    return jsonPrivate({ ok: true, riverId });
  } catch (error) {
    console.error('Error deleting alert subscription:', error);
    return jsonPrivate({ error: 'Internal server error' }, { status: 500 });
  }
}
