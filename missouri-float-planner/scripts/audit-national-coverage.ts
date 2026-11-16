#!/usr/bin/env npx tsx
/**
 * National River Map coverage audit — READ-ONLY.
 *
 * One row per state (50 + DC): station inventory, latest rows, fresh discharge
 * and stage, seasonal-comparison eligibility, dormant stations, and NWS flood
 * forecast points (matched to a USGS station, and with a defined threshold).
 * Also reports stations near a regional fetch seam with no latest row, and the
 * Aleutian stations east of the antimeridian — the two places a bbox importer
 * loses stations quietly.
 *
 * Reads gauge_stations / gauge_latest through the same loaders the frame
 * recorder uses, and NOAA's riv_gauges layer. Writes nothing anywhere except
 * the optional --out file.
 *
 * Usage:
 *   npx tsx scripts/audit-national-coverage.ts [--out report.md]
 */

import { writeFileSync } from 'node:fs';
import { getScriptClient } from './lib/db';
import { buildCoverageReport, coverageMarkdown } from '../src/lib/national-map/coverage';
import { fetchNoaaFloodStatus } from '../src/lib/national-map/noaa-flood';
import { loadLatestForStations, loadNationalStations } from '../src/lib/national-map/station-source';

const BASE = 'https://mapservices.weather.noaa.gov/eventdriven/rest/services/water/riv_gauges/MapServer/0/query';

/** LID → state, from NOAA's own attribute (frames do not carry it). */
async function nwsStates(): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  for (let page = 0; page < 20; page++) {
    const url = new URL(BASE);
    url.searchParams.set('where', '1=1');
    url.searchParams.set('outFields', 'objectid,gaugelid,state');
    url.searchParams.set('returnGeometry', 'false');
    url.searchParams.set('orderByFields', 'objectid');
    url.searchParams.set('resultOffset', String(page * 2000));
    url.searchParams.set('resultRecordCount', '2000');
    url.searchParams.set('f', 'json');
    const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`riv_gauges states page ${page}: HTTP ${res.status}`);
    const body = (await res.json()) as { features?: Array<{ attributes?: Record<string, unknown> }>; exceededTransferLimit?: boolean };
    for (const f of body.features ?? []) {
      const lid = String(f.attributes?.gaugelid ?? '').trim().toUpperCase();
      const st = String(f.attributes?.state ?? '').trim().toUpperCase();
      if (lid && st) out.set(lid, st);
    }
    if (!body.features?.length || !body.exceededTransferLimit) break;
  }
  return out;
}

async function main() {
  const supabase = getScriptClient({ script: 'audit-national-coverage', write: false });
  const stations = await loadNationalStations(supabase);
  const latest = await loadLatestForStations(supabase, stations);
  const [noaa, states] = await Promise.all([fetchNoaaFloodStatus(), nwsStates()]);
  const report = buildCoverageReport({ stations, latest, nws: noaa.points, nwsStates: states, now: Date.now() });
  const md = coverageMarkdown(report);
  const i = process.argv.indexOf('--out');
  if (i > 0 && process.argv[i + 1]) {
    writeFileSync(process.argv[i + 1], md);
    console.log(`Wrote ${process.argv[i + 1]}`);
  } else {
    console.log(md);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
