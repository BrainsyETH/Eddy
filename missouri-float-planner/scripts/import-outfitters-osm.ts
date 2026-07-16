#!/usr/bin/env npx tsx
/**
 * Import canoe/kayak outfitters from OpenStreetMap into points_of_interest.
 *
 * Sources businesses tagged amenity=boat_rental / canoe=rental /
 * rental~canoe|kayak / shop=boat_rental in the Missouri+Arkansas bbox via
 * the Overpass API, keeps only those within MAX_RIVER_DIST_M of a curated
 * river (that's what separates a float livery from a lake marina or an
 * amusement-park pedal boat), and inserts them as type='outfitter',
 * source='osm' POIs associated to their nearest river.
 *
 * Idempotent: skips candidates whose name already exists (case-insensitive)
 * or that sit within 250 m of an existing outfitter POI, so re-running only
 * picks up newly mapped businesses. OSM identity is kept in
 * raw_data->>'osm_id'.
 *
 * River geometries come from the public /api/usgs/mo-dataset endpoint
 * (GeoJSON), and point-to-reach distance is computed in JS — no PostGIS
 * round-trips needed.
 *
 * Env:  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *       SITE_URL (optional, default https://eddy.guide — dataset source)
 * Run:  npx tsx scripts/import-outfitters-osm.ts [--dry-run]
 */
import { createClient } from '@supabase/supabase-js';

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const BBOX = '35.0,-95.8,40.7,-89.1'; // MO + AR
const MAX_RIVER_DIST_M = 8000;
const DEDUPE_RADIUS_M = 250;
const SITE_URL = process.env.SITE_URL || 'https://eddy.guide';

const OVERPASS_QUERY = `
[out:json][timeout:90];
(
  nwr["amenity"="boat_rental"](${BBOX});
  nwr["canoe"="rental"](${BBOX});
  nwr["rental"~"canoe|kayak",i](${BBOX});
  nwr["shop"="boat_rental"](${BBOX});
);
out center tags;
`;

interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface DatasetRiver {
  id: string;
  name: string;
  geometry: { type: 'LineString'; coordinates: Array<[number, number]> };
}

// Haversine point→segment-chain distance (meters). Good to ~0.5% at these
// latitudes — plenty for an 8km threshold.
function distToRiverM(lat: number, lon: number, coords: Array<[number, number]>): number {
  const R = 6371000;
  const rad = Math.PI / 180;
  const cosLat = Math.cos(lat * rad);
  // Local equirectangular projection around the point.
  const px = 0;
  const py = 0;
  const proj = (c: [number, number]): [number, number] => [
    (c[0] - lon) * rad * cosLat * R,
    (c[1] - lat) * rad * R,
  ];
  let best = Infinity;
  let prev = proj(coords[0]);
  for (let i = 1; i < coords.length; i++) {
    const cur = proj(coords[i]);
    const dx = cur[0] - prev[0];
    const dy = cur[1] - prev[1];
    const lenSq = dx * dx + dy * dy || 1e-9;
    const t = Math.max(0, Math.min(1, ((px - prev[0]) * dx + (py - prev[1]) * dy) / lenSq));
    const qx = prev[0] + t * dx;
    const qy = prev[1] + t * dy;
    best = Math.min(best, Math.hypot(px - qx, py - qy));
    prev = cur;
  }
  return best;
}

function haversineM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!dryRun && (!url || !key)) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (or pass --dry-run)');
  }

  console.log('fetching outfitters from Overpass…');
  const opRes = await fetch(OVERPASS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // Overpass usage policy requires an identifying UA; without one (and
      // an Accept header) the API answers 406.
      'User-Agent': 'eddy.guide outfitter import (https://eddy.guide)',
      Accept: 'application/json',
    },
    body: `data=${encodeURIComponent(OVERPASS_QUERY)}`,
  });
  if (!opRes.ok) throw new Error(`overpass → ${opRes.status}`);
  const op = (await opRes.json()) as { elements: OverpassElement[] };

  console.log('fetching curated river geometries…');
  const dsRes = await fetch(`${SITE_URL}/api/usgs/mo-dataset`);
  if (!dsRes.ok) throw new Error(`mo-dataset → ${dsRes.status}`);
  const rivers = ((await dsRes.json()) as { rivers: DatasetRiver[] }).rivers.filter(
    (r) => r.geometry?.coordinates?.length >= 2,
  );

  // Candidates: named, located, near a curated river; deduped by name
  // (OSM often maps the same business as both a node and a building way).
  const byName = new Map<
    string,
    { name: string; lat: number; lon: number; osmId: string; tags: Record<string, string>; river: DatasetRiver; distM: number }
  >();
  for (const e of op.elements) {
    const name = e.tags?.name;
    const lat = e.lat ?? e.center?.lat;
    const lon = e.lon ?? e.center?.lon;
    if (!name || lat == null || lon == null) continue;
    let bestRiver: DatasetRiver | null = null;
    let bestDist = Infinity;
    for (const r of rivers) {
      const d = distToRiverM(lat, lon, r.geometry.coordinates);
      if (d < bestDist) {
        bestDist = d;
        bestRiver = r;
      }
    }
    if (!bestRiver || bestDist > MAX_RIVER_DIST_M) continue;
    const cur = byName.get(name.toLowerCase());
    if (!cur || bestDist < cur.distM) {
      byName.set(name.toLowerCase(), {
        name, lat, lon,
        osmId: `${e.type}/${e.id}`,
        tags: e.tags ?? {},
        river: bestRiver,
        distM: bestDist,
      });
    }
  }
  const candidates = [...byName.values()];
  console.log(`${candidates.length} river-adjacent outfitters (of ${op.elements.length} raw elements)`);

  if (dryRun) {
    for (const c of candidates) {
      console.log(`  ${c.name} → ${c.river.name} (${Math.round(c.distM)}m)`);
    }
    return;
  }

  const supabase = createClient(url!, key!);
  const { data: existing, error: exErr } = await supabase
    .from('points_of_interest')
    .select('name, latitude, longitude, type');
  if (exErr) throw exErr;

  let inserted = 0;
  for (const c of candidates) {
    const dupe = (existing ?? []).some(
      (p) =>
        p.name?.toLowerCase() === c.name.toLowerCase() ||
        (p.type === 'outfitter' &&
          p.latitude != null &&
          haversineM(p.latitude, p.longitude, c.lat, c.lon) < DEDUPE_RADIUS_M),
    );
    if (dupe) {
      console.log(`  skip (exists): ${c.name}`);
      continue;
    }
    const { error } = await supabase.from('points_of_interest').insert({
      river_id: c.river.id,
      name: c.name,
      slug: c.name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
      description: c.tags.description ?? null,
      type: 'outfitter',
      source: 'osm',
      latitude: c.lat,
      longitude: c.lon,
      active: true,
      is_on_water: false,
      raw_data: {
        osm_id: c.osmId,
        website: c.tags.website ?? c.tags['contact:website'] ?? null,
        phone: c.tags.phone ?? c.tags['contact:phone'] ?? null,
        imported_by: 'import-outfitters-osm',
        river_distance_m: Math.round(c.distM),
      },
      last_synced_at: new Date().toISOString(),
    });
    if (error) {
      console.error(`  FAILED ${c.name}:`, error.message);
      continue;
    }
    inserted++;
    console.log(`  + ${c.name} → ${c.river.name} (${Math.round(c.distM)}m)`);
  }
  console.log(`inserted ${inserted} outfitters`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
