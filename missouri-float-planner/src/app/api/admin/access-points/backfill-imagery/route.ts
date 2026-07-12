// src/app/api/admin/access-points/backfill-imagery/route.ts
// POST /api/admin/access-points/backfill-imagery
// Auto-fetch access-point imagery from authoritative agency sources
// (MDC / NPS / RIDB / USFS / State Park / Private) and store the external URL
// in access_points.image_urls — no manual upload, no self-hosting.
//
// Body: {
//   riverId?  string   // scope to one river (preferred; from admin UI)
//   riverSlug? string  // alternative to riverId
//   overwrite? boolean // re-resolve points that already have images (default false)
//   dryRun?    boolean // resolve + report but don't write (default false)
//   limit?     number  // max points to process this call (default 60)
// }

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminAuth, logAdminAction } from '@/lib/admin-auth';
import {
  resolveAccessPointImage,
  type ResolvableAccessPoint,
  type ResolveResult,
} from '@/lib/access-points/imagery';

export const dynamic = 'force-dynamic';
// Sequential, rate-limited fetches across a river's access points can take a
// while; give the function room (Vercel caps this per plan).
export const maxDuration = 300;

// Delay between points — keeps us gentle on free sources (notably MDC's WAF,
// which throttles bursts).
const PER_POINT_DELAY_MS = 800;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function coordsOf(row: {
  location_orig: unknown;
  location_snap: unknown;
}): { lat: number | null; lng: number | null } {
  const orig = row.location_orig as { coordinates?: number[] } | null;
  const snap = row.location_snap as { coordinates?: number[] } | null;
  const lng = orig?.coordinates?.[0] ?? snap?.coordinates?.[0] ?? null;
  const lat = orig?.coordinates?.[1] ?? snap?.coordinates?.[1] ?? null;
  return { lat: lat ?? null, lng: lng ?? null };
}

export async function POST(request: NextRequest) {
  const authError = requireAdminAuth(request);
  if (authError) return authError;

  let body: {
    riverId?: string;
    riverSlug?: string;
    overwrite?: boolean;
    dryRun?: boolean;
    limit?: number;
  };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const { riverId, riverSlug, overwrite = false, dryRun = false } = body;
  const limit = Math.min(Math.max(Number(body.limit) || 60, 1), 200);

  if (!riverId && !riverSlug) {
    return NextResponse.json(
      { error: 'Provide riverId or riverSlug to scope the backfill.' },
      { status: 400 },
    );
  }

  const supabase = createAdminClient();

  // Resolve the river (need its park_code for NPS matching).
  const riverQuery = supabase
    .from('rivers')
    .select('id, name, slug, park_code')
    .limit(1);
  if (riverId) riverQuery.eq('id', riverId);
  else riverQuery.eq('slug', riverSlug!);

  const { data: river, error: riverErr } = await riverQuery.single();
  if (riverErr || !river) {
    return NextResponse.json({ error: 'River not found' }, { status: 404 });
  }

  // Pull approved access points for this river.
  const { data: points, error: pointsErr } = await supabase
    .from('access_points')
    .select('id, name, managing_agency, official_site_url, image_urls, location_orig, location_snap')
    .eq('river_id', river.id)
    .eq('approved', true)
    .order('river_mile_downstream', { ascending: true });

  if (pointsErr) {
    return NextResponse.json({ error: 'Failed to load access points' }, { status: 500 });
  }

  const candidates = (points || []).filter((p) =>
    overwrite ? true : !(p.image_urls && p.image_urls.length > 0),
  );
  const toProcess = candidates.slice(0, limit);

  const results: ResolveResult[] = [];
  let resolved = 0;
  let noMatch = 0;
  let errors = 0;

  for (let i = 0; i < toProcess.length; i++) {
    const p = toProcess[i];
    const { lat, lng } = coordsOf(p);

    const ap: ResolvableAccessPoint = {
      id: p.id,
      name: p.name,
      managingAgency: p.managing_agency,
      officialSiteUrl: p.official_site_url,
      lat,
      lng,
    };

    const result = await resolveAccessPointImage(ap, { parkCode: river.park_code });
    results.push(result);

    if (result.status === 'resolved' && result.image) {
      resolved++;
      if (!dryRun) {
        const existing = (overwrite ? [] : p.image_urls) || [];
        const next = Array.from(new Set([...existing, result.image.url]));
        const { error: updErr } = await supabase
          .from('access_points')
          .update({ image_urls: next })
          .eq('id', p.id);
        if (updErr) {
          result.status = 'error';
          result.detail = `write failed: ${updErr.message}`;
          resolved--;
          errors++;
        }
      }
    } else if (result.status === 'error') {
      errors++;
    } else {
      noMatch++;
    }

    // Rate-limit between points (skip the wait after the last one).
    if (i < toProcess.length - 1) await sleep(PER_POINT_DELAY_MS);
  }

  if (!dryRun && resolved > 0) {
    await logAdminAction({
      action: 'backfill_imagery',
      entityType: 'river',
      entityId: river.id,
      entityName: river.name,
      details: { resolved, noMatch, errors, processed: toProcess.length, overwrite },
    });
  }

  return NextResponse.json({
    river: { id: river.id, name: river.name, slug: river.slug, parkCode: river.park_code },
    dryRun,
    overwrite,
    totalCandidates: candidates.length,
    processed: toProcess.length,
    resolved,
    noMatch,
    errors,
    remaining: Math.max(candidates.length - toProcess.length, 0),
    results: results.map((r) => ({
      id: r.accessPointId,
      name: r.name,
      status: r.status,
      detail: r.detail,
      source: r.image?.source ?? null,
      url: r.image?.url ?? null,
      credit: r.image?.credit ?? null,
    })),
  });
}
