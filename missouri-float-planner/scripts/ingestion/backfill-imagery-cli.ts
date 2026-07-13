#!/usr/bin/env npx tsx
/**
 * CLI wrapper around the access-point imagery resolver (#843), mirroring
 * POST /api/admin/access-points/backfill-imagery but runnable without the
 * Next server / admin auth. Resolves a hot-linkable agency photo for each
 * APPROVED access point on a river and stores it in access_points.image_urls.
 *
 * Usage:
 *   npx tsx scripts/ingestion/backfill-imagery-cli.ts <slug> [--overwrite] [--dry]
 *
 * Env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, and (optional but
 *      recommended) NPS_API_KEY + RIDB/RECREATION_GOV key for NPS/USFS sources.
 *      Without those keys, og:image sources (MDC, State Park, private) still work.
 */
import { createAdminClient } from '../../src/lib/supabase/admin';
import {
  resolveAccessPointImage,
  type ResolvableAccessPoint,
} from '../../src/lib/access-points/imagery';

const PER_POINT_DELAY_MS = 800;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function coordsOf(row: { location_orig: any; location_snap: any }) {
  const lng = row.location_orig?.coordinates?.[0] ?? row.location_snap?.coordinates?.[0] ?? null;
  const lat = row.location_orig?.coordinates?.[1] ?? row.location_snap?.coordinates?.[1] ?? null;
  return { lat, lng };
}

async function main() {
  const [slug, ...flags] = process.argv.slice(2);
  if (!slug) { console.error('Usage: backfill-imagery-cli.ts <slug> [--overwrite] [--dry]'); process.exit(1); }
  const overwrite = flags.includes('--overwrite');
  const dryRun = flags.includes('--dry');

  const db = createAdminClient();
  const { data: river, error: rErr } = await db
    .from('rivers').select('id, name, slug, park_code').eq('slug', slug).single();
  if (rErr || !river) throw new Error(`river ${slug} not found: ${rErr?.message}`);

  const { data: points, error: pErr } = await db
    .from('access_points')
    .select('id, name, managing_agency, official_site_url, image_urls, location_orig, location_snap')
    .eq('river_id', river.id)
    .eq('approved', true)
    .order('river_mile_downstream', { ascending: true });
  if (pErr) throw pErr;

  const candidates = (points ?? []).filter((p) => (overwrite ? true : !(p.image_urls && p.image_urls.length > 0)));
  console.log(`\n${river.name}: ${candidates.length} approved point(s) to resolve (park_code=${river.park_code ?? '—'})`);

  let resolved = 0, noMatch = 0, errors = 0;
  for (let i = 0; i < candidates.length; i++) {
    const p = candidates[i];
    const { lat, lng } = coordsOf(p);
    const ap: ResolvableAccessPoint = {
      id: p.id, name: p.name, managingAgency: p.managing_agency, officialSiteUrl: p.official_site_url, lat, lng,
    };
    const result = await resolveAccessPointImage(ap, { parkCode: river.park_code });
    if (result.status === 'resolved' && result.image) {
      resolved++;
      console.log(`  ✅ ${p.name} ← ${result.image.source}: ${result.image.url}`);
      if (!dryRun) {
        const existing = (overwrite ? [] : p.image_urls) || [];
        const next = Array.from(new Set([...existing, result.image.url]));
        const { error: uErr } = await db.from('access_points').update({ image_urls: next }).eq('id', p.id);
        if (uErr) { console.log(`     ⚠️ write failed: ${uErr.message}`); resolved--; errors++; }
      }
    } else if (result.status === 'error') {
      errors++; console.log(`  ❌ ${p.name}: ${result.detail}`);
    } else {
      noMatch++; console.log(`  · ${p.name}: no-match (${result.detail})`);
    }
    if (i < candidates.length - 1) await sleep(PER_POINT_DELAY_MS);
  }
  console.log(`\n  resolved=${resolved} noMatch=${noMatch} errors=${errors}${dryRun ? ' (DRY)' : ''}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
