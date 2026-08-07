// scripts/ingestion/geocode-services-mapbox.ts
// Propose coordinates for directory services that have none, via Mapbox
// Geocoding v6 with permanent=true (results are licensed for storage, unlike
// the temporary endpoint). WRITES NOTHING — it prints three blocks:
//
//   1. a review table,
//   2. a river-validation query to run against the database, and
//   3. a migration-ready UPDATE block for the rows that survive it.
//
//   MAPBOX_ACCESS_TOKEN=... npx tsx scripts/ingestion/geocode-services-mapbox.ts
//
// The acceptance rule is DISTANCE TO THE LINKED RIVER, not distance to the
// recorded town — the town is wrong often enough that the previous sweeps
// stalled on it (see supabase/migrations/20260807024722, lines 46-52). Rivers
// are PostGIS geometry, so that check runs in the database via the emitted
// query; accept a row only when it lands within ~10 miles of its river.
// Six of the thirty rows written by the 2026-08-07 passes sit 2-10 miles out
// and all six are correct, so do not tighten the bound below that.
//
// A town-level answer is a non-answer: v6 reports what it matched via
// feature_type, and anything place/locality/postcode-shaped is skipped here
// rather than proposed. That retires the old `centroid` precision — a
// coordinate that only names the town is never written at all.

const MAPBOX = 'https://api.mapbox.com/search/geocode/v6/forward';
// MO/AR Ozarks. Keeps a namesake in another state from ever being considered;
// the river check catches wrong-in-region.
const BBOX = '-95.9,33.5,-89.0,40.8';

const TOKEN = process.env.MAPBOX_ACCESS_TOKEN;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

interface ServiceRow {
  id: string;
  name: string;
  type: string;
  status: string | null;
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  service_rivers: { rivers: { name: string } | null }[];
}

interface Proposal {
  row: ServiceRow;
  lat: number;
  lng: number;
  featureType: string;
  matched: string;
  precision: 'exact' | 'approximate';
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function fetchRows(): Promise<ServiceRow[]> {
  const url =
    `${SUPABASE_URL}/rest/v1/nearby_services` +
    `?latitude=is.null&status=neq.permanently_closed` +
    `&select=id,name,type,status,address_line1,city,state,zip,service_rivers(rivers(name))` +
    `&order=type,name`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_KEY!, Authorization: `Bearer ${SUPABASE_KEY}` },
  });
  if (!res.ok) throw new Error(`nearby_services: ${res.status} ${await res.text()}`);
  return (await res.json()) as ServiceRow[];
}

/**
 * feature_type tells us what Mapbox actually matched. An address is the place;
 * a street is the right road. Everything coarser is the town wearing a
 * coordinate, and proposing it would be the exact failure this pipeline
 * refuses — so it maps to null and the row stays unresolved.
 */
function precisionFor(featureType: string): 'exact' | 'approximate' | null {
  if (featureType === 'address' || featureType === 'secondary_address') return 'exact';
  if (featureType === 'street' || featureType === 'block' || featureType === 'intersection') {
    return 'approximate';
  }
  return null;
}

async function geocode(row: ServiceRow): Promise<Proposal | null> {
  const params = new URLSearchParams({
    access_token: TOKEN!,
    permanent: 'true',
    country: 'us',
    bbox: BBOX,
    limit: '1',
  });
  if (row.address_line1) {
    params.set('address_line1', row.address_line1);
    if (row.city) params.set('place', row.city);
    if (row.state) params.set('region', row.state);
    if (row.zip) params.set('postcode', row.zip);
  } else {
    params.set('q', [row.name, row.city, row.state].filter(Boolean).join(', '));
  }
  const res = await fetch(`${MAPBOX}?${params}`);
  if (!res.ok) {
    console.error(`  ! ${row.name}: HTTP ${res.status}`);
    return null;
  }
  const body = (await res.json()) as {
    features?: {
      properties?: { feature_type?: string; full_address?: string; name?: string };
      geometry?: { coordinates?: [number, number] };
    }[];
  };
  const f = body.features?.[0];
  const coords = f?.geometry?.coordinates;
  const featureType = f?.properties?.feature_type ?? '';
  const precision = precisionFor(featureType);
  if (!coords || !precision) return null;
  return {
    row,
    lat: coords[1],
    lng: coords[0],
    featureType,
    matched: f?.properties?.full_address ?? f?.properties?.name ?? '',
    precision,
  };
}

function sq(value: string): string {
  return value.replace(/'/g, "''");
}

async function main() {
  if (!TOKEN) throw new Error('MAPBOX_ACCESS_TOKEN is required.');
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY).');
  }

  const rows = await fetchRows();
  console.log(`\n${rows.length} services with no coordinates (permanently closed excluded)\n`);

  const proposals: Proposal[] = [];
  for (const row of rows) {
    const hit = await geocode(row);
    if (hit) proposals.push(hit);
    const label = hit ? `${hit.featureType} -> ${hit.precision}` : 'no usable match';
    console.log(`  ${label.padEnd(28)} ${row.name}`);
    await sleep(150);
  }
  console.log(`\n${proposals.length} of ${rows.length} returned an address- or street-level match.\n`);
  if (!proposals.length) return;

  console.log('── 1. Validate against each service\'s river (run in SQL editor) ──\n');
  const values = proposals
    .map((p) => `  ('${p.row.id}','${sq(p.row.name)}',${p.lat},${p.lng})`)
    .join(',\n');
  console.log(`WITH cand(id, name, lat, lng) AS (VALUES\n${values}\n)
SELECT c.name,
       string_agg(DISTINCT r.name, ', ') AS rivers,
       round(min(ST_Distance(ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography,
                             r.geom::geography) / 1609.34)::numeric, 2) AS mi
FROM cand c
LEFT JOIN service_rivers sr ON sr.service_id = c.id::uuid
LEFT JOIN rivers r ON r.id = sr.river_id AND r.geom IS NOT NULL
GROUP BY c.name ORDER BY mi NULLS LAST;
-- Accept mi <= 10. Reject anything above it, and anything two rows share.\n`);

  console.log('── 2. Migration block for the rows that pass ──\n');
  for (const p of proposals) {
    console.log(`-- ${p.row.name} (${p.row.type}) — mapbox ${p.featureType}: ${p.matched}`);
    console.log(`UPDATE nearby_services SET latitude = ${p.lat}, longitude = ${p.lng},`);
    console.log(`  geocode_precision = '${p.precision}', geocode_source = 'mapbox', geocoded_at = now()`);
    console.log(` WHERE id = '${p.row.id}' AND latitude IS NULL;\n`);
  }
}

if (process.argv[1]?.includes('geocode-services-mapbox')) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { precisionFor };
