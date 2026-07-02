#!/usr/bin/env npx tsx
/**
 * Populate gauge_stations.drainage_area_sqmi from the USGS Site Web Service
 * (`drain_area_va`, in sq mi). Feeds drainage-area flow transfer (audit F11).
 *
 * DRY-RUN by default; pass --write to persist.
 *   npx tsx scripts/fetch-drainage-areas.ts            # preview
 *   npx tsx scripts/fetch-drainage-areas.ts --write    # apply
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';

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

/** Fetches drainage area (sq mi) for a USGS site from the RDB site service. */
async function fetchDrainageArea(siteId: string): Promise<number | null> {
  const url =
    `https://waterservices.usgs.gov/nwis/site/?format=rdb&sites=${siteId}` +
    `&siteOutput=expanded&siteStatus=all`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const text = await res.text();
    const lines = text.split('\n').filter((l) => l && !l.startsWith('#'));
    if (lines.length < 3) return null;
    const header = lines[0].split('\t');
    const idx = header.indexOf('drain_area_va');
    if (idx < 0) return null;
    // lines[1] is the format row (e.g. "5s"), data starts at lines[2].
    const cols = lines[2].split('\t');
    const val = parseFloat(cols[idx]);
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
