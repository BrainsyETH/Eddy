import { NextRequest, NextResponse } from 'next/server';
import type { AlertSubscriptionKind } from '@eddy/types';
import { apiError } from '@/lib/api/errors';
import { requireEntitlement } from '@/lib/entitlement';

export const dynamic = 'force-dynamic';
const KINDS = new Set<AlertSubscriptionKind>(['floatable', 'safety', 'all']);

export async function GET(request: NextRequest) {
  const auth = await requireEntitlement(request);
  if (auth instanceof NextResponse) return auth;
  const { data, error } = await auth.supabase
    .from('alert_subscriptions')
    .select('id, river_id, kind, one_shot, fired_at, created_at, updated_at')
    .eq('user_id', auth.user.id)
    .order('created_at', { ascending: false });
  if (error) return apiError(500, 'internal_error', 'Could not load alert subscriptions');
  return NextResponse.json({
    subscriptions: (data || []).map((row) => ({
      id: row.id,
      riverId: row.river_id,
      kind: row.kind,
      oneShot: row.one_shot,
      firedAt: row.fired_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
  });
}

export async function PUT(request: NextRequest) {
  const auth = await requireEntitlement(request);
  if (auth instanceof NextResponse) return auth;
  const body = await request.json().catch(() => null) as {
    riverId?: string;
    kind?: AlertSubscriptionKind;
    oneShot?: boolean;
  } | null;
  if (!body?.riverId || !body.kind || !KINDS.has(body.kind)) {
    return apiError(400, 'validation_failed', 'riverId and a valid kind are required');
  }
  const { data, error } = await auth.supabase
    .from('alert_subscriptions')
    .upsert({
      user_id: auth.user.id,
      river_id: body.riverId,
      kind: body.kind,
      one_shot: body.oneShot === true,
      fired_at: null,
    }, { onConflict: 'user_id,river_id' })
    .select('id, river_id, kind, one_shot, fired_at, created_at, updated_at')
    .single();
  if (error?.code === '23503') return apiError(404, 'not_found', 'River not found');
  if (error) return apiError(500, 'internal_error', 'Could not save alert subscription');
  return NextResponse.json({
    subscription: {
      id: data.id,
      riverId: data.river_id,
      kind: data.kind,
      oneShot: data.one_shot,
      firedAt: data.fired_at,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    },
  });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireEntitlement(request);
  if (auth instanceof NextResponse) return auth;
  const riverId = request.nextUrl.searchParams.get('riverId');
  if (!riverId) return apiError(400, 'validation_failed', 'riverId is required');
  const { error } = await auth.supabase
    .from('alert_subscriptions')
    .delete()
    .eq('user_id', auth.user.id)
    .eq('river_id', riverId);
  if (error) return apiError(500, 'internal_error', 'Could not remove alert subscription');
  return NextResponse.json({ ok: true });
}
