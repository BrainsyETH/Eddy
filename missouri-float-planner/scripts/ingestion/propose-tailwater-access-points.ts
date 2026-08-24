#!/usr/bin/env npx tsx
/**
 * Propose access points for a tailwater from OpenStreetMap, filtered to the
 * river line itself.
 *
 * WRITES NOTHING, EVER. Like geocode-services-dryrun.ts, this prints
 * candidates for a human to accept into a dossier. Access points are the one
 * part of river onboarding that `import-dossier-access-points.ts` lands
 * `approved = false` on purpose, and this sits one step further back: it does
 * not even produce a dossier, it produces a list to build one from.
 *
 * The filter that matters is proximity to the river. A bounding box around
 * ninety miles of the White also contains Bull Shoals Lake, the Buffalo, and
 * every boat ramp in three counties. Anything further than MAX_OFFSET_M from
 * the sliced tailwater geometry is not on this river, so it is dropped and
 * counted rather than shown.
 *
 * Run (after build-tailwater-geometry.ts has written tmp/nhd/<slug>.geojson):
 *   npx tsx scripts/ingestion/propose-tailwater-access-points.ts
 *   npx tsx scripts/ingestion/propose-tailwater-access-points.ts white
 */

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { lineString as turfLine, point as turfPoint, nearestPointOnLine } from '@turf/turf';
import type { Feature, LineString } from 'geojson';

const SLUGS = ['white', 'norfork-tailwater', 'taneycomo'];

/** Past this, it is on another water body, not this river. */
const MAX_OFFSET_M = 300;

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

interface OsmElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Overpass is a shared free service and answers a heavy query with 429 or 502
 * rather than a queue. Both are transient, so rotate endpoints and back off
 * instead of failing the run — a half-finished access list is worse than a
 * slow one.
 */
async function overpass(query: string): Promise<OsmElement[]> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    for (const ep of OVERPASS_ENDPOINTS) {
      try {
        const res = await fetch(ep, {
          method: 'POST',
          body: new URLSearchParams({ data: query }),
          signal: AbortSignal.timeout(180_000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const doc = (await res.json()) as { elements?: OsmElement[] };
        return doc.elements ?? [];
      } catch (e) {
        lastErr = e;
      }
    }
    const wait = 2000 * 2 ** attempt;
    process.stderr.write(`    overpass retry in ${wait / 1000}s (${String(lastErr)})\n`);
    await sleep(wait);
  }
  throw new Error(`All Overpass endpoints failed: ${String(lastErr)}`);
}

/** Split a bbox into north-south tiles so no single query is too heavy. */
function tileBbox(
  minLat: number,
  minLon: number,
  maxLat: number,
  maxLon: number,
  maxSpanDeg = 0.25,
): string[] {
  const tiles: string[] = [];
  const steps = Math.max(1, Math.ceil((maxLat - minLat) / maxSpanDeg));
  const step = (maxLat - minLat) / steps;
  for (let i = 0; i < steps; i++) {
    const lo = minLat + i * step;
    const hi = i === steps - 1 ? maxLat : lo + step;
    tiles.push([lo, minLon, hi, maxLon].join(','));
  }
  return tiles;
}

/** Access-shaped things. Deliberately broad — the proximity filter does the
 *  real narrowing, and a missed put-in costs more than a rejected parking lot. */
/**
 * Structured tags only. An earlier version also matched
 * `["name"~"Access|Shoals|Landing",i]` with no other key, which Overpass
 * answers with a 500 over an area this size — a name regex has no tag index
 * to narrow on, so it is a full scan of the bbox. The structured tags below
 * are what an access point actually is anyway; the name regex was catching
 * the same ramps twice.
 */
function buildQuery(bbox: string): string {
  return `[out:json][timeout:120];
(
  nwr["leisure"="slipway"](${bbox});
  nwr["leisure"="marina"](${bbox});
  nwr["leisure"="fishing"](${bbox});
  nwr["tourism"="camp_site"](${bbox});
  nwr["tourism"="picnic_site"]["name"](${bbox});
  nwr["leisure"="park"]["name"](${bbox});
  nwr["leisure"="nature_reserve"]["name"](${bbox});
);
out center tags;`;
}

function coordsOf(e: OsmElement): [number, number] | null {
  if (typeof e.lat === 'number' && typeof e.lon === 'number') return [e.lon, e.lat];
  if (e.center) return [e.center.lon, e.center.lat];
  return null;
}

/** What kind of access this looks like, from tags. Never guessed from the name. */
function kindOf(t: Record<string, string>): string {
  if (t.leisure === 'slipway') return 'boat_ramp';
  if (t.leisure === 'marina') return 'marina';
  if (t.tourism === 'camp_site') return 'campground';
  if (t.amenity === 'parking') return 'parking';
  if (t.leisure === 'park' || t.leisure === 'nature_reserve') return 'park';
  return 'unclassified';
}

async function main() {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const slugs = args.length ? args : SLUGS;
  const cacheDir = join(process.cwd(), 'tmp', 'nhd');
  const report: string[] = [];

  for (const slug of slugs) {
    const geoPath = join(cacheDir, `${slug}.geojson`);
    if (!existsSync(geoPath)) {
      throw new Error(`${geoPath} missing — run build-tailwater-geometry.ts first.`);
    }
    const feat = JSON.parse(readFileSync(geoPath, 'utf-8')) as Feature<LineString>;
    const line = turfLine(feat.geometry.coordinates);
    const lons = feat.geometry.coordinates.map((c) => c[0]);
    const lats = feat.geometry.coordinates.map((c) => c[1]);
    // Overpass bbox order is south,west,north,east. Pad a little so a ramp
    // set back from the bank is still inside the box.
    const pad = 0.01;
    const tiles = tileBbox(
      Math.min(...lats) - pad,
      Math.min(...lons) - pad,
      Math.max(...lats) + pad,
      Math.max(...lons) + pad,
    );

    process.stderr.write(`\n${slug}: querying Overpass over ${tiles.length} tile(s)\n`);
    const elements: OsmElement[] = [];
    for (const [i, bbox] of tiles.entries()) {
      process.stderr.write(`  tile ${i + 1}/${tiles.length} ${bbox}\n`);
      elements.push(...(await overpass(buildQuery(bbox))));
      if (i < tiles.length - 1) await sleep(1500);
    }

    const rows: Array<{
      name: string;
      kind: string;
      lat: number;
      lon: number;
      offsetM: number;
      alongMi: number;
      osm: string;
      operator: string;
    }> = [];
    let dropped = 0;
    const seen = new Set<string>();

    for (const e of elements) {
      const c = coordsOf(e);
      if (!c) continue;
      const tags = e.tags ?? {};
      const name = tags.name?.trim();
      if (!name) continue;
      const snap = nearestPointOnLine(line, turfPoint(c), { units: 'miles' });
      const offsetM = (snap.properties.dist ?? 0) * 1609.344;
      if (offsetM > MAX_OFFSET_M) {
        dropped++;
        continue;
      }
      const key = `${name}|${c[0].toFixed(3)},${c[1].toFixed(3)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        name,
        kind: kindOf(tags),
        lat: Number(c[1].toFixed(6)),
        lon: Number(c[0].toFixed(6)),
        offsetM: Math.round(offsetM),
        alongMi: Number((snap.properties.location ?? 0).toFixed(2)),
        osm: `${e.type}/${e.id}`,
        operator: tags.operator ?? tags['operator:type'] ?? '',
      });
    }
    rows.sort((a, b) => a.alongMi - b.alongMi);

    process.stderr.write(
      `  ${elements.length} elements → ${rows.length} on the river ` +
        `(${dropped} dropped as further than ${MAX_OFFSET_M} m)\n`,
    );

    report.push(`## ${slug} — ${rows.length} candidates within ${MAX_OFFSET_M} m of the line`, '');
    report.push('| Mile | Name | Kind | Lat | Lon | Off (m) | Operator | OSM |');
    report.push('| ---: | --- | --- | ---: | ---: | ---: | --- | --- |');
    for (const r of rows) {
      report.push(
        `| ${r.alongMi} | ${r.name} | ${r.kind} | ${r.lat} | ${r.lon} | ` +
          `${r.offsetM} | ${r.operator} | ${r.osm} |`,
      );
    }
    report.push('');
    for (const r of rows) process.stderr.write(`    ${String(r.alongMi).padStart(6)} mi  ${r.name}\n`);
  }

  const outPath = join(cacheDir, 'tailwater-access-candidates.md');
  writeFileSync(
    outPath,
    ['# Tailwater access candidates (OpenStreetMap, ODbL)', '', ...report].join('\n'),
  );
  process.stderr.write(`\nWrote ${outPath}\nNothing was written to the database.\n`);
}

main().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
