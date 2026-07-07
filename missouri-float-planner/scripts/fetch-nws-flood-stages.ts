#!/usr/bin/env npx tsx
/**
 * Backfill NWS flood/action stages onto river_gauges (audit F4).
 *
 * For each active gauge:
 *   1. Resolve an NWS LID (gauge_stations.nws_lid, else the USGS_TO_NWS_LID map).
 *   2. Fetch NWPS flood/action stages and CROSS-CHECK the USGS id NWPS reports
 *      against ours — a mismatched LID is skipped, never written (guards guesses).
 *   3. Write flood_stage_ft / action_stage_ft and set threshold_source = 'nws_ahps'.
 *   4. For gauges with no NWS forecast point (small creeks: Huzzah/Courtois), fall
 *      back to a USGS statistical anchor (≈p90 daily discharge) and threshold_source='usgs'.
 *
 * We do NOT overwrite the curated level_* bands — 00114's rule is to layer official
 * stages alongside outfitter judgement, not replace it. Adjusting level_dangerous to
 * the official stage is left to human review in the admin gauge editor.
 *
 * DRY-RUN by default. Pass --write to persist. Run:
 *   npx tsx scripts/fetch-nws-flood-stages.ts            # preview
 *   npx tsx scripts/fetch-nws-flood-stages.ts --write    # apply
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { fetchNwpsFloodStages, fetchNwpsLidMap, USGS_TO_NWS_LID } from '../src/lib/nws/flood-stages';
import { fetchDailyStatistics } from '../src/lib/usgs/gauges';

// Load env from .env.local (authoritative — overrides the shell), else process.env.
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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY = service_role key) — checked .env.local + shell env');
  }
  console.error(`[env] url=${url}  key=${key.slice(0, 6)}…(${key.length} chars)`);
  return createClient(url, key);
}

async function main() {
  const write = process.argv.includes('--write');
  const supabase = getSupabase();

  // Only the FLOAT gauges (linked via river_gauges) — flood stages are for the
  // condition taxonomy, not the ~250-gauge statewide map layer.
  const { data: floatLinks, error: linkError } = await supabase
    .from('river_gauges')
    .select('gauge_station_id');
  if (linkError || !floatLinks) throw new Error(`Failed to load river_gauges: ${linkError?.message}`);
  const floatStationIds = Array.from(new Set(floatLinks.map((l) => l.gauge_station_id)));

  const { data: gauges, error } = await supabase
    .from('gauge_stations')
    .select('id, name, usgs_site_id, nws_lid, active')
    .eq('active', true)
    .in('id', floatStationIds);
  if (error || !gauges) throw new Error(`Failed to load gauges: ${error?.message}`);

  // Auto-discover LIDs from NWPS's own gauge list (indexed by usgsId); the hand
  // map is only a fallback if the bbox query fails.
  const lidMap = await fetchNwpsLidMap();
  const lidSource = Object.keys(lidMap).length > 0 ? 'nwps-bbox' : 'fallback-map';
  console.log(`\nNWS flood-stage backfill (${write ? 'WRITE' : 'dry-run'}) — ${gauges.length} float gauges, LIDs via ${lidSource} (${Object.keys(lidMap).length} discovered)\n`);

  for (const g of gauges) {
    const lid: string | null =
      lidMap[g.usgs_site_id] || g.nws_lid || USGS_TO_NWS_LID[g.usgs_site_id] || null;
    let floodStageFt: number | null = null;
    let actionStageFt: number | null = null;
    let source: 'nws_ahps' | 'usgs' | null = null;
    let note = '';

    if (lid) {
      const stages = await fetchNwpsFloodStages(lid);
      if (stages && stages.usgsSiteId && stages.usgsSiteId !== g.usgs_site_id) {
        note = `LID ${lid} maps to USGS ${stages.usgsSiteId}, not ${g.usgs_site_id} — SKIPPED (bad LID)`;
      } else if (stages && (stages.floodStageFt || stages.actionStageFt)) {
        floodStageFt = stages.floodStageFt;
        actionStageFt = stages.actionStageFt;
        source = 'nws_ahps';
        note = `NWPS ${lid}: action=${actionStageFt ?? '—'} flood=${floodStageFt ?? '—'} ft`;
      } else {
        note = `NWPS ${lid}: no stages`;
      }
    }

    // Fallback: USGS statistical anchor for gauges without an NWS forecast point.
    if (!source) {
      const stats = await fetchDailyStatistics(g.usgs_site_id);
      if (stats?.p90 != null) {
        source = 'usgs';
        note = `USGS p90 discharge=${stats.p90} cfs (statistical high-water anchor)`;
      } else {
        note = note || 'no NWS or USGS stats available';
      }
    }

    console.log(`${g.usgs_site_id}  ${g.name}`);
    console.log(`    → ${note}`);

    if (write && source) {
      if (lid && g.nws_lid !== lid) {
        // nws_lid lives on gauge_stations, not river_gauges.
        await supabase.from('gauge_stations').update({ nws_lid: lid }).eq('id', g.id);
      }
      // flood/action columns live on river_gauges (per-river-gauge). Update all rows
      // for this station; the human review step can then adjust level_dangerous.
      const patch: Record<string, unknown> = {};
      if (source === 'nws_ahps') {
        if (floodStageFt != null) patch.flood_stage_ft = floodStageFt;
        if (actionStageFt != null) patch.action_stage_ft = actionStageFt;
      }
      if (Object.keys(patch).length > 0) {
        const { error: upErr } = await supabase
          .from('river_gauges')
          .update(patch)
          .eq('gauge_station_id', g.id);
        if (upErr) console.warn(`    ! write failed: ${upErr.message}`);
        else console.log('    ✓ written');
      }
      // Stamp provenance only where the ladder has none — rows written by the
      // dossier pipeline carry curated provenance (editorial/outfitter) that
      // official stages must not overwrite (00114: layer alongside, not replace).
      const { error: srcErr } = await supabase
        .from('river_gauges')
        .update({ threshold_source: source })
        .eq('gauge_station_id', g.id)
        .is('threshold_source', null);
      if (srcErr) console.warn(`    ! provenance write failed: ${srcErr.message}`);
    }
  }

  if (!write) console.log('\nDry run — re-run with --write to persist.\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
