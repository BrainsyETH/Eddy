#!/usr/bin/env npx tsx
/**
 * Populate gauge_stations.drainage_area_sqmi from the USGS monitoring-locations
 * collection (`drainage_area`, in sq mi). Feeds drainage-area flow transfer
 * (audit F11). Was the legacy Site Web Service (`drain_area_va`) until that
 * service's Q1 2027 decommission forced the move.
 *
 * DRY-RUN by default; pass --write to persist.
 *   npx tsx scripts/fetch-drainage-areas.ts            # preview
 *   npx tsx scripts/fetch-drainage-areas.ts --write    # apply
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { MODERN_BASE, modernHeaders } from '../src/lib/flow-providers/usgs';

// Load env from .env.local (authoritative for this script — overrides the shell so a
// stale placeholder export can't win), falling back to process.env. No external deps.
function loadEnv() {
  try {
    const txt = readFileSync(join(process.cwd(), '.env.local'), 'utf8');
    for (const raw of txt.split('\n')) {
      const line = raw.replace(/\r$/, '');
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      process.env[m[1]] = val;
    }
  } catch {
    /* no .env.local — rely on exported env vars */
  }
}
loadEnv();

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (checked .env.local + shell env)');
  }
  console.error(`[env] url=${url}  key=${key.slice(0, 6)}…(${key.length} chars)`);
  return createClient(url, key);
}

/**
 * Fetches drainage area (sq mi) for a USGS site from the modern
 * monitoring-locations collection.
 *
 * Was the legacy RDB site service (`nwis/site/?siteOutput=expanded`, column
 * `drain_area_va`), which is decommissioned in Q1 2027. The modern collection
 * exposes the same figure as the `drainage_area` property.
 *
 * ⚠️ The identifier property here is `id` ('USGS-07068000'), NOT
 * `monitoring_location_id` — that name belongs to the observation collections
 * and returns InvalidQuery on this one.
 */
async function fetchDrainageArea(siteId: string): Promise<number | null> {
  const url = new URL(`${MODERN_BASE}/monitoring-locations/items`);
  url.searchParams.set('f', 'json');
  url.searchParams.set('id', siteId.startsWith('USGS-') ? siteId : `USGS-${siteId}`);
  url.searchParams.set('limit', '1');
  try {
    const res = await fetch(url.toString(), { headers: modernHeaders() });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      features?: Array<{ properties?: { drainage_area?: number | string | null } | null }>;
    };
    const raw = data.features?.[0]?.properties?.drainage_area;
    const val = typeof raw === 'number' ? raw : parseFloat(String(raw ?? ''));
    return Number.isFinite(val) && val > 0 ? val : null;
  } catch {
    return null;
  }
}

async function main() {
  const write = process.argv.includes('--write');
  const supabase = getSupabase();

  const { data: gauges, error } = await supabase
    .from('gauge_stations')
    .select('id, name, usgs_site_id')
    .eq('active', true);
  if (error || !gauges) throw new Error(`Failed to load gauges: ${error?.message}`);

  console.log(`\nDrainage-area backfill (${write ? 'WRITE' : 'dry-run'}) — ${gauges.length} gauges\n`);

  for (const g of gauges) {
    const area = await fetchDrainageArea(g.usgs_site_id);
    console.log(`${g.usgs_site_id}  ${g.name.padEnd(40)} ${area != null ? `${area} sq mi` : '—'}`);
    if (write && area != null) {
      const { error: upErr } = await supabase
        .from('gauge_stations')
        .update({ drainage_area_sqmi: area })
        .eq('id', g.id);
      if (upErr) console.warn(`    ! write failed: ${upErr.message}`);
    }
  }

  if (!write) console.log('\nDry run — re-run with --write to persist.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
