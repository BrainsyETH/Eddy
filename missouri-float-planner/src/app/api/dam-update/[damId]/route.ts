// src/app/api/dam-update/[damId]/route.ts
// GET /api/dam-update/[damId] — Eddy's Read for a dam (Premium).
//
// Separate from /api/dams/[damId] because that route is CDN-cached for every
// caller and this one varies by entitlement. A public caller gets whether a
// Read exists and when it was written; a bearer token that verifies as
// entitled gets the whole Read. See DamReadResponse.
//
// Complete-day history is cached; the Read is rendered against the current
// schedule and clock on every request. A schedule revision does not hide it.
// Without a snapshot, advance the saved windows and mark them unverified;
// this fallback expires after three hours. Neither path crosses Central midnight.

import { NextRequest, NextResponse } from 'next/server';
import { optionalAuthCacheHeaders } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';
import { optionalEntitlement } from '@/lib/entitlement';
import { readStoredSnapshot } from '@/lib/data/dam-snapshot-store';
import { damHasRead, renderDamRead, withCurrentSchedule, type DamReadFacts } from '@/lib/eddy/dam-read-facts';
import { servable, tierDamRead } from '@/lib/eddy/dam-update-policy';
import type { DamReadResponse } from '@shared/dam-types';

export const dynamic = 'force-dynamic';

const NONE: DamReadResponse = { available: false, generatedAt: null, read: null };

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ damId: string }> },
) {
  const headers = optionalAuthCacheHeaders(Boolean(request.headers.get('authorization')), 300, 900);
  try {
    const { damId } = await params;
    if (!damHasRead(damId)) return NextResponse.json<DamReadResponse>(NONE, { status: 404, headers });

    // A bearer token asks for the Premium representation; a failed check is
    // returned as itself (401/402/403), never collapsed into the public one.
    const auth = await optionalEntitlement(request);
    if (auth instanceof NextResponse) return auth;
    const entitled = auth !== null;

    const now = Date.now();
    const supabase = createAdminClient();
    const [{ data, error }, snapshot] = await Promise.all([
      supabase
        .from('dam_updates')
        .select('facts, sources_used, generated_at, expires_at')
        .eq('dam_id', damId)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      readStoredSnapshot(damId, { now }),
    ]);

    if (error) {
      console.error(`[DamUpdate] Query error for ${damId}:`, error);
      return NextResponse.json<DamReadResponse>(NONE, { status: 500, headers });
    }
    if (!data) return NextResponse.json<DamReadResponse>(NONE, { headers });

    if (!servable({ generatedAt: data.generated_at, expiresAt: data.expires_at }, snapshot !== null, now)) {
      return NextResponse.json<DamReadResponse>(NONE, { headers });
    }

    const stored = data.facts as DamReadFacts;
    const facts = withCurrentSchedule(stored, snapshot?.schedule ?? null, now);
    const read = tierDamRead(entitled, {
      ...renderDamRead(facts),
      sourcesUsed: Array.isArray(data.sources_used) ? data.sources_used : [],
    });
    return NextResponse.json<DamReadResponse>({ available: true, generatedAt: data.generated_at, read }, { headers });
  } catch (err) {
    console.error('[DamUpdate] Unexpected error:', err);
    return NextResponse.json<DamReadResponse>(NONE, { status: 500, headers });
  }
}
