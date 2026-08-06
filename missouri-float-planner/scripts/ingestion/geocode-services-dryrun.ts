// scripts/ingestion/geocode-services-dryrun.ts
// Propose coordinates for services that have none. WRITES NOTHING, EVER.
//
//   npx tsx scripts/ingestion/geocode-services-dryrun.ts [--type=campground]
//
// ── Why this proposes rather than applies ─────────────────────────────────
//
// Eleven of Eddy's private campgrounds have no coordinates and so appear on no
// map. Running their names through a geocoder and writing the answers was tried
// first, and every near-miss was a real, different campground:
//
//   Camp River Campground, Alton       -> Two Rivers Campground     35 mi away
//   Story's Creek Campground, Eminence -> Brazil Creek Campground   60 mi away
//   Ruby's Landing, Jerome             -> Twin Rivers Landing       71 mi away
//
// A pin is a claim about where a place IS, and somebody plans a drive around
// it. Being confidently wrong is worse than being absent, which is the same
// rule the availability line follows when it renders nothing rather than
// "unknown". So this prints a table for a person to read, and the accepted rows
// go into a migration by hand.
//
// ── The two tests a proposal has to pass ──────────────────────────────────
//
// NAME, because "Circle B" matching "Circle B" is evidence and "Camp River"
// matching "Two Rivers" is not. Compared twice — whole, and with the words
// every campground shares stripped out — taking whichever is kinder, because
// "Circle B Campground & Resort" and "Circle B" are the same business.
//
// DISTANCE from the town the row already records, because that is an
// independent fact Eddy holds and the geocoder does not. It is what rejects
// Two Rivers: the name is plausible, and it is thirty-five miles from Alton.
//
// Both, or it is not a match. Name alone accepted four wrong campgrounds.

interface Candidate {
  name: string;
  lat: number;
  lng: number;
}

/** Nominatim asks for one request a second and a real User-Agent. */
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const OVERPASS = 'https://overpass-api.de/api/interpreter';
const AGENT = 'EddyGuide/1.0 (eddy.guide; float trip planner)';

/**
 * How alike two names must be, and how near the town.
 *
 * 0.86 sits above every wrong match measured (the worst was Camp River ->
 * Two Rivers at 0.81) and below the one right one (Circle B at 1.00). Twelve
 * miles is generous for a rural campground whose town is the nearest post
 * office rather than its address, and still rejects everything in the set.
 */
const NAME_MIN = 0.86;
const MILES_MAX = 12;

const NOISE = /\b(campground|campgrounds|camping|resort|rv|park|the|and|of|llc|inc)\b/g;

function normalise(value: string): string {
  return value
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function core(value: string): string {
  return normalise(value).replace(NOISE, ' ').replace(/\s+/g, ' ').trim();
}

/** Dice coefficient over bigrams — cheap, and stable on short business names. */
function similarity(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const bigrams = (s: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      out.set(g, (out.get(g) ?? 0) + 1);
    }
    return out;
  };
  const [x, y] = [bigrams(a), bigrams(b)];
  let shared = 0;
  for (const [g, n] of x) shared += Math.min(n, y.get(g) ?? 0);
  return (2 * shared) / (a.length - 1 + (b.length - 1));
}

export function nameScore(a: string, b: string): number {
  return Math.max(similarity(normalise(a), normalise(b)), similarity(core(a), core(b)));
}

/** Great-circle miles. */
export function milesBetween(a: [number, number], b: [number, number]): number {
  const R = 3958.8;
  const p = Math.PI / 180;
  const dLat = (b[0] - a[0]) * p;
  const dLng = (b[1] - a[1]) * p;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a[0] * p) * Math.cos(b[0] * p) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

/**
 * Whether a candidate may be written without a human looking at it.
 *
 * Exported because this rule is the substance of the script, and it is asserted
 * against the real measured set in the web suite rather than trusted.
 */
export function accepts(
  serviceName: string,
  town: [number, number] | null,
  candidate: Candidate,
): { ok: boolean; score: number; miles: number; why: string } {
  const score = nameScore(serviceName, candidate.name);
  const miles = town ? milesBetween(town, [candidate.lat, candidate.lng]) : Number.POSITIVE_INFINITY;

  if (score < NAME_MIN) return { ok: false, score, miles, why: `name ${score.toFixed(2)}` };
  if (!town) return { ok: false, score, miles, why: 'town not geocoded' };
  if (miles > MILES_MAX) return { ok: false, score, miles, why: `${miles.toFixed(0)}mi away` };
  return { ok: true, score, miles, why: '' };
}

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'User-Agent': AGENT, ...(init?.headers ?? {}) },
  });
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  return (await response.json()) as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Set SUPABASE_URL and a Supabase key.');

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(url, key);

  const type = process.argv.find((a) => a.startsWith('--type='))?.split('=')[1] ?? 'campground';

  const { data, error } = await supabase
    .from('nearby_services')
    .select('id, name, city, state, type')
    .eq('type', type)
    .is('latitude', null)
    .order('name');
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  if (rows.length === 0) {
    console.log(`Every ${type} already has coordinates.`);
    return;
  }
  console.log(`${rows.length} ${type} rows with no coordinates\n`);

  // One Overpass sweep for the whole region beats a request per row, and it is
  // the same corpus every run so results are comparable between runs.
  const box = '36.4,-92.6,38.6,-90.6';
  const query = `[out:json][timeout:90];(
    node["tourism"="camp_site"](${box}); way["tourism"="camp_site"](${box});
    node["tourism"="caravan_site"](${box}); way["tourism"="caravan_site"](${box});
  );out center tags;`;
  const osm = await json<{ elements: Record<string, never>[] }>(OVERPASS, {
    method: 'POST',
    body: new URLSearchParams({ data: query }),
  });

  const candidates: Candidate[] = [];
  for (const raw of osm.elements ?? []) {
    const e = raw as unknown as {
      tags?: { name?: string };
      lat?: number;
      lon?: number;
      center?: { lat: number; lon: number };
    };
    const name = e.tags?.name;
    const lat = e.lat ?? e.center?.lat;
    const lng = e.lon ?? e.center?.lon;
    if (name && lat != null && lng != null) candidates.push({ name, lat, lng });
  }
  console.log(`${candidates.length} named campground POIs in the region\n`);

  const towns = new Map<string, [number, number] | null>();
  let accepted = 0;

  for (const row of rows) {
    const townKey = `${row.city}, ${row.state}`;
    if (!towns.has(townKey)) {
      const found = await json<{ lat: string; lon: string }[]>(
        `${NOMINATIM}?q=${encodeURIComponent(`${townKey}, USA`)}&format=json&limit=1`,
      );
      towns.set(townKey, found[0] ? [Number(found[0].lat), Number(found[0].lon)] : null);
      await sleep(1200);
    }
    const town = towns.get(townKey) ?? null;

    let best: { candidate: Candidate; verdict: ReturnType<typeof accepts> } | null = null;
    for (const candidate of candidates) {
      const verdict = accepts(row.name, town, candidate);
      if (!best || verdict.score > best.verdict.score) best = { candidate, verdict };
    }
    if (!best) continue;

    const { candidate, verdict } = best;
    if (verdict.ok) accepted++;
    console.log(
      `${verdict.ok ? 'ACCEPT' : 'review'}  ${row.name.slice(0, 30).padEnd(32)}` +
        `-> ${candidate.name.slice(0, 28).padEnd(30)} ` +
        `${verdict.score.toFixed(2)} ${verdict.miles.toFixed(1).padStart(6)}mi  ${verdict.why}`,
    );
    if (verdict.ok) {
      console.log(`        ${candidate.lat.toFixed(5)}, ${candidate.lng.toFixed(5)}`);
    }
  }

  console.log(`\n${accepted} of ${rows.length} clear both tests.`);
  console.log('Nothing was written. Put the accepted rows in a migration by hand,');
  console.log("with geocode_precision='exact' and geocode_source='osm'.");
}

if (process.argv[1]?.includes('geocode-services-dryrun')) {
  void main();
}
