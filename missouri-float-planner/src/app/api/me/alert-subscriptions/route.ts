// src/app/api/me/alert-subscriptions/route.ts
// GET    /api/me/alert-subscriptions            — list the caller's push subscriptions
// POST   /api/me/alert-subscriptions            — subscribe to a curated river (Eddy+)
// DELETE /api/me/alert-subscriptions?riverId=…  — unsubscribe
//
// This is the backend half of the "🔔 notify me when it's floatable" tap — the
// contextual paywall trigger and the funnel's north-star event. Subscriptions
// here are for CURATED Eddy Rivers (river_id → rivers), i.e. the paid
// floatability translation. Raw-gauge threshold alerts stay free and will land
// on their own gauge-keyed table.
//
// Gating asymmetry is deliberate:
//   POST   requires an active entitlement (402 → paywall)
//   GET    does not — a lapsed subscriber must still see what they had
//   DELETE does not — never trap someone in notifications they can't turn off
//
// Entitlement is ALSO re-checked at send time by the fan-out, so a lapse
// between subscribing and the next transition doesn't leak paid pushes.

import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/supabase/request';
import { requireEntitlement } from '@/lib/entitlement';
import type { AlertSubscriptionsResponse } from '@/types/api';

export const dynamic = 'force-dynamic';

const VALID_KINDS = ['floatable', 'safety', 'all'] as const;
type SubscriptionKind = (typeof VALID_KINDS)[number];

export async function GET(request: NextRequest) {
  try {
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;
    const { supabase, user } = auth;

    const { data, error } = await supabase
      .from('alert_subscriptions')
      .select('id, river_id, kind, one_shot, fired_at, created_at, rivers!inner(name, slug)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error listing alert subscriptions:', error);
      return NextResponse.json({ error: 'Could not load subscriptions' }, { status: 500 });
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

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error listing alert subscriptions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    // 401 (no token) / 403 (anonymous) / 402 (no active Eddy+) are all
    // returned ready-to-send; the app maps 402 to the paywall.
    const auth = await requireEntitlement(request);
    if (auth instanceof NextResponse) return auth;
    const { supabase, user } = auth;

    const body = await request.json().catch(() => null) as
      | { riverId?: string; riverSlug?: string; kind?: string; oneShot?: boolean }
      | null;
    if (!body?.riverId && !body?.riverSlug) {
      return NextResponse.json({ error: 'riverId or riverSlug required' }, { status: 400 });
    }

    const kind = (body.kind ?? 'all') as SubscriptionKind;
    if (!VALID_KINDS.includes(kind)) {
      return NextResponse.json(
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
      return NextResponse.json({ error: 'River not found' }, { status: 404 });
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
        return NextResponse.json({ error: 'River not found' }, { status: 404 });
      }
      console.error('Error saving alert subscription:', error);
      return NextResponse.json({ error: 'Could not save subscription' }, { status: 500 });
    }

    return NextResponse.json({
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
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    // Deliberately NOT entitlement-gated — see header note.
    const auth = await requireUser(request);
    if (auth instanceof NextResponse) return auth;
    const { supabase, user } = auth;

    const riverId = request.nextUrl.searchParams.get('riverId');
    if (!riverId) {
      return NextResponse.json({ error: 'riverId required' }, { status: 400 });
    }

    const { error } = await supabase
      .from('alert_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('river_id', riverId);

    if (error) {
      console.error('Error deleting alert subscription:', error);
      return NextResponse.json({ error: 'Could not delete subscription' }, { status: 500 });
    }

    return NextResponse.json({ ok: true, riverId });
  } catch (error) {
    console.error('Error deleting alert subscription:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
