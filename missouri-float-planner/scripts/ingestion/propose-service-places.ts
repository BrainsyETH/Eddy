// scripts/ingestion/propose-service-places.ts
// Propose a Google place_id for directory services that have none.
// WRITES NOTHING, EVER.
//
//   GOOGLE_PLACES_API_KEY=... npx tsx scripts/ingestion/propose-service-places.ts
//
// ── Why a place id is worth having at all ─────────────────────────────────
//
// Getting this directory from 28 located rows to 138 took a person reading
// operator websites; the last 37 coordinates came that way. Answering "is this
// business still there?" the same way, quarterly, is not a plan.
//
// A place id is the one part of a Places response Google's terms permit
// retaining. Once a row has one, `businessStatus`, the current name and the
// current phone are a scheduled read rather than research — Steele River Kayaks
// would have reported its own closure instead of waiting for somebody to check.
//
// ── The gate, and why it is not just a name ───────────────────────────────
//
// Matching by name alone is exactly how this project has already produced wrong
// data. Measured, not hypothetical:
//
//   Arapaho Campground, Steelville  -> "Arapaho Family Campground"  different phone
//   Song Dog Shuttles, Yellville    -> Crooked Creek Canoe Rentals  another company
//   Camp River Campground, Alton    -> Two Rivers Campground        35 mi away
//   Story's Creek, Eminence         -> Brazil Creek Campground      60 mi away
//
// So a proposal must clear three independent tests, and the third is the one
// that catches the first two failures above:
//
//   1. NAME     — nameScore >= 0.86, reusing the threshold and the function the
//                 coordinate pipeline already uses. Scored against `name` AND
//                 every entry in `alt_names`, best wins: that is what alt_names
//                 bought, and it is why Sundancer and Boiling Spring resolve.
//   2. DISTANCE — within 10 miles of a river the service is linked to, the same
//                 bound the coordinate write path uses. Checked in PostGIS by a
//                 query this script prints, not here, because rivers.geom is
//                 the authority and reimplementing it in TypeScript would be a
//                 second definition to keep in step.
//   3. IDENTITY — a phone or a website host must AGREE. A strong name and a
//                 plausible location is what a namesake down the road looks
//                 like; a matching phone number is not.
//
// A candidate that passes name and distance but has nothing corroborating is
// printed under "needs a human", never in the migration block. 20260807203000's
// lesson stands: distance is a strong filter and not a complete one.
//
// One place id belongs to one service, enforced here and by a unique partial
// index — two Eddy rows once claimed the same OSM node at 1.02 miles and only a
// person noticing the double claim caught it.

import { nameScore } from './geocode-services-dryrun';

/** Same bar the coordinate pipeline uses. Below this, every match measured was wrong. */
export const PLACE_NAME_MIN = 0.86;

/** Same bound the coordinate write path accepts. See geocode-services-mapbox.ts. */
export const PLACE_RIVER_MILES_MAX = 10;

/**
 * How near a candidate must fall to a coordinate we already trust.
 *
 * Only applied when the row HAS coordinates, and tight on purpose: this is not
 * "is it on the right river" (test 2 answers that), it is "is it the same
 * building". Half a mile is generous for a rural business whose pin may be the
 * office rather than the boat ramp, and tight enough that a neighbour fails.
 */
export const PLACE_PIN_MILES_MAX = 0.5;

export interface ServiceForMatch {
  id: string;
  name: string;
  altNames: string[];
  phone: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
}

export interface PlaceCandidate {
  placeId: string;
  displayName: string;
  formattedAddress: string | null;
  phone: string | null;
  websiteUri: string | null;
  latitude: number;
  longitude: number;
  businessStatus: string | null;
}

export type GateVerdict =
  | { kind: 'accept'; reason: string; score: number }
  | { kind: 'review'; reason: string; score: number }
  | { kind: 'reject'; reason: string; score: number };

/** Last ten digits, so formatting differences never decide identity. */
export function phoneDigits(value: string | null | undefined): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, '');
  return digits.length >= 10 ? digits.slice(-10) : null;
}

/** Registrable host, lowercased, `www.` dropped. Nothing else is comparable. */
export function siteHost(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const host = new URL(value.startsWith('http') ? value : `https://${value}`).hostname;
    return host.replace(/^www\./, '').toLowerCase() || null;
  } catch {
    return null;
  }
}

/**
 * Does anything beyond the name agree?
 *
 * Deliberately three-valued rather than boolean. "The phone disagrees" is a
 * REJECT — that is the Arapaho case, where a strong name pointed at a different
 * business. "There is no phone on either side" is not evidence of anything, and
 * collapsing it into the same answer as a disagreement would silently discard
 * matches that a human could confirm in a minute.
 */
export function identityAgrees(
  service: ServiceForMatch,
  candidate: PlaceCandidate,
): 'agrees' | 'disagrees' | 'unknown' {
  const ourPhone = phoneDigits(service.phone);
  const theirPhone = phoneDigits(candidate.phone);
  if (ourPhone && theirPhone) return ourPhone === theirPhone ? 'agrees' : 'disagrees';

  const ourHost = siteHost(service.website);
  const theirHost = siteHost(candidate.websiteUri);
  if (ourHost && theirHost) return ourHost === theirHost ? 'agrees' : 'disagrees';

  return 'unknown';
}

/** Great-circle miles. Local copy so the gate stays pure and dependency-free. */
export function milesApart(
  a: [number, number],
  b: [number, number],
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const [lat1, lng1] = a;
  const [lat2, lng2] = b;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

/** Best name score across the service's own name and every alias it trades under. */
export function bestNameScore(service: ServiceForMatch, candidateName: string): number {
  const names = [service.name, ...service.altNames];
  return names.reduce((best, n) => Math.max(best, nameScore(n, candidateName)), 0);
}

/**
 * Pure. The whole accept rule, minus the river check, which lives in PostGIS.
 *
 * Ordered so the cheapest and most decisive rejections come first, and so the
 * reason a candidate was refused is the most useful one rather than the first
 * one that happened to fire.
 */
export function placeGate(service: ServiceForMatch, candidate: PlaceCandidate): GateVerdict {
  const score = bestNameScore(service, candidate.displayName);

  if (score < PLACE_NAME_MIN) {
    return { kind: 'reject', reason: `name ${score.toFixed(2)} < ${PLACE_NAME_MIN}`, score };
  }

  const identity = identityAgrees(service, candidate);
  if (identity === 'disagrees') {
    // The Arapaho case. A strong name pointing at a different business is the
    // single most dangerous shape here, because it looks like success.
    return { kind: 'reject', reason: 'phone or website contradicts', score };
  }

  if (service.latitude != null && service.longitude != null) {
    const gap = milesApart(
      [service.latitude, service.longitude],
      [candidate.latitude, candidate.longitude],
    );
    if (gap > PLACE_PIN_MILES_MAX) {
      return {
        kind: 'review',
        reason: `${gap.toFixed(2)} mi from the coordinate we already trust`,
        score,
      };
    }
  }

  if (identity === 'unknown') {
    // Name and location agree and nothing contradicts, but nothing confirms
    // either. A person can settle this in a minute; a script must not.
    return { kind: 'review', reason: 'nothing corroborates the name', score };
  }

  return { kind: 'accept', reason: 'name and contact agree', score };
}

/**
 * One place id, one service.
 *
 * The unique partial index enforces this in the database. It is enforced here
 * too so the operator sees BOTH claimants in the review table, rather than a
 * constraint violation naming one row when the interesting fact is the pair.
 */
export function dropContestedPlaceIds<T extends { placeId: string; serviceName: string }>(
  accepted: T[],
): { kept: T[]; contested: T[] } {
  const byPlace = new Map<string, T[]>();
  for (const row of accepted) {
    const existing = byPlace.get(row.placeId);
    if (existing) existing.push(row);
    else byPlace.set(row.placeId, [row]);
  }
  const kept: T[] = [];
  const contested: T[] = [];
  for (const rows of byPlace.values()) {
    if (rows.length === 1) kept.push(rows[0]);
    else contested.push(...rows);
  }
  return { kept, contested };
}

/* ── Everything below is I/O, and runs only when invoked directly ──────────*/

const PLACES_ENDPOINT = 'https://places.googleapis.com/v1/places:searchText';

// Billed by mask tier, so the mask is a cost decision and belongs where it can
// be read. Nothing here is retained except `id` — see the header.
const FIELD_MASK = [
  'places.id',
  'places.displayName',
  'places.formattedAddress',
  'places.location',
  'places.nationalPhoneNumber',
  'places.websiteUri',
  'places.businessStatus',
].join(',');

const sq = (value: string) => value.replace(/'/g, "''");

async function main() {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    console.error('GOOGLE_PLACES_API_KEY is required.');
    console.error('');
    console.error('This script proposes a google_place_id per service and writes nothing.');
    console.error(`It requests only: ${FIELD_MASK}`);
    console.error('Of that, only `id` is stored — Google\'s terms do not permit retaining');
    console.error('the coordinates, name or address that come back beside it.');
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'Set NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_KEY).',
    );
  }

  const query =
    `${url}/rest/v1/nearby_services` +
    `?google_place_id=is.null&status=neq.permanently_closed` +
    `&select=id,name,alt_names,phone,website,city,state,latitude,longitude,service_rivers(rivers(name))` +
    `&order=name`;
  const res = await fetch(query, {
    headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
  });
  if (!res.ok) throw new Error(`nearby_services: ${res.status} ${await res.text()}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: any[] = await res.json();
  console.log(`\n${rows.length} services without a place id (permanently closed excluded)\n`);

  const accepted: Array<{
    serviceId: string;
    serviceName: string;
    placeId: string;
    lat: number;
    lng: number;
    reason: string;
  }> = [];
  const review: string[] = [];

  for (const row of rows) {
    const service: ServiceForMatch = {
      id: row.id,
      name: row.name,
      altNames: row.alt_names ?? [],
      phone: row.phone,
      website: row.website,
      latitude: row.latitude === null ? null : Number(row.latitude),
      longitude: row.longitude === null ? null : Number(row.longitude),
    };
    const where = [row.city, row.state].filter(Boolean).join(', ');

    const body = {
      textQuery: `${service.name}, ${where}`,
      maxResultCount: 1,
      regionCode: 'US',
    };
    const hit = await fetch(PLACES_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': FIELD_MASK,
      },
      body: JSON.stringify(body),
    });
    if (!hit.ok) {
      console.log(`  ! ${service.name}: HTTP ${hit.status}`);
      continue;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const place = (await hit.json())?.places?.[0];
    if (!place) {
      console.log(`  – ${service.name}: no result`);
      continue;
    }

    const candidate: PlaceCandidate = {
      placeId: place.id,
      displayName: place.displayName?.text ?? '',
      formattedAddress: place.formattedAddress ?? null,
      phone: place.nationalPhoneNumber ?? null,
      websiteUri: place.websiteUri ?? null,
      latitude: place.location?.latitude,
      longitude: place.location?.longitude,
      businessStatus: place.businessStatus ?? null,
    };

    const verdict = placeGate(service, candidate);
    console.log(
      `  ${verdict.kind.padEnd(6)} ${service.name} -> ${candidate.displayName} (${verdict.reason})`,
    );
    if (verdict.kind === 'accept') {
      accepted.push({
        serviceId: service.id,
        serviceName: service.name,
        placeId: candidate.placeId,
        lat: candidate.latitude,
        lng: candidate.longitude,
        reason: verdict.reason,
      });
    } else if (verdict.kind === 'review') {
      review.push(`${service.name} -> ${candidate.displayName}: ${verdict.reason}`);
    }
    if (candidate.businessStatus && candidate.businessStatus !== 'OPERATIONAL') {
      review.push(`${service.name}: Google reports ${candidate.businessStatus}`);
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  const { kept, contested } = dropContestedPlaceIds(accepted);
  for (const row of contested) {
    review.push(`${row.serviceName}: place id ${row.placeId} claimed by more than one service`);
  }

  console.log(`\n${kept.length} proposals, ${review.length} for a human.\n`);

  if (review.length) {
    console.log('── Needs a human ────────────────────────────────────────────');
    for (const line of review) console.log(`  ${line}`);
    console.log('');
  }

  if (!kept.length) return;

  console.log('── 1. Confirm each candidate sits on a river it serves ──────\n');
  const values = kept
    .map((r) => `  ('${r.serviceId}','${sq(r.serviceName)}',${r.lat},${r.lng})`)
    .join(',\n');
  console.log(`WITH cand(id, name, lat, lng) AS (VALUES
${values}
)
SELECT c.name,
       round(min(ST_Distance(ST_SetSRID(ST_MakePoint(c.lng, c.lat), 4326)::geography,
                             r.geom::geography) / 1609.344)::numeric, 2) AS mi
FROM cand c
LEFT JOIN service_rivers sr ON sr.service_id = c.id::uuid
LEFT JOIN rivers r ON r.id = sr.river_id AND r.geom IS NOT NULL
GROUP BY c.name ORDER BY mi NULLS FIRST;
-- Drop anything over ${PLACE_RIVER_MILES_MAX} miles, and anything with no row.\n`);

  console.log('── 2. Migration block for whatever survives ─────────────────\n');
  for (const r of kept) {
    console.log(`-- ${r.serviceName} — ${r.reason}`);
    console.log(
      `UPDATE nearby_services SET google_place_id = '${r.placeId}', last_verified_at = now()`,
    );
    console.log(` WHERE id = '${r.serviceId}' AND google_place_id IS NULL;\n`);
  }
}

if (process.argv[1]?.includes('propose-service-places')) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
