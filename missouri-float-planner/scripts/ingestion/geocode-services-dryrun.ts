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
//
// ── THREE THINGS THIS GOT WRONG, ALL THE SAME MISTAKE ─────────────────────
//
// Each was a constant that did not follow the data it described.
//
// 1. THE SEARCH AREA WAS A HARDCODED BOX — `36.4,-92.6,38.6,-90.6`, the
//    Missouri Ozarks and nothing else. Eddy has since grown onto the Elk River
//    (Noel and Pineville, around -94.5) and into Arkansas (Caddo Gap at 34.4,
//    Yellville at 36.2), and every one of those rows sat outside it. They were
//    not assessed and rejected; they were never candidates at all, and the
//    "matches" printed beside them — 221 miles, 265 miles — were the nearest
//    thing in a box on the wrong side of the state. A reader could easily have
//    read those as near-misses. The box is now derived from the rows being
//    geocoded, so it cannot fall behind them again.
//
// 2. THE POI CORPUS WAS ALWAYS CAMPGROUNDS, whatever `--type` said. Running
//    `--type=outfitter` compared canoe liveries against `tourism=camp_site`
//    and produced plausible-looking nonsense with no warning. Tags are chosen
//    by type now, and an unknown type is refused rather than silently swept
//    against the wrong corpus.
//
// 3. THE BEST CANDIDATE WAS PICKED BY NAME SCORE ALONE, so a perfect namesake
//    two hundred miles away outranked a strong match down the road — and the
//    good one was never shown. Ranking now prefers a candidate that PASSES,
//    then one within range, and only then falls back to the distant namesake,
//    which is the line worth printing when nothing qualifies.

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

/**
 * The candidate worth showing a human, out of everything swept.
 *
 * ── WHY THIS IS NOT SIMPLY THE HIGHEST NAME SCORE ────────────────────────
 *
 * It was, and that hides good answers behind bad ones. A perfect namesake two
 * hundred miles away scores 1.00 and wins; the 0.9 match down the road never
 * gets printed, so the row reads as "no candidate" when a fine one existed.
 *
 * The order is: one that PASSES both tests, then one within range of the town,
 * then whatever scored highest anywhere. That last tier is still worth printing
 * — it is how a reader sees that the only thing resembling this name is in
 * another county, which is a useful thing to learn — but it must never displace
 * a candidate that qualifies.
 */
export function pickBest(
  serviceName: string,
  town: [number, number] | null,
  candidates: readonly Candidate[],
): { candidate: Candidate; verdict: ReturnType<typeof accepts> } | null {
  let best: { candidate: Candidate; verdict: ReturnType<typeof accepts>; rank: number } | null =
    null;
  for (const candidate of candidates) {
    const verdict = accepts(serviceName, town, candidate);
    const rank = verdict.ok ? 2 : verdict.miles <= MILES_MAX ? 1 : 0;
    const better =
      !best ||
      rank > best.rank ||
      (rank === best.rank &&
        (verdict.score > best.verdict.score ||
          (verdict.score === best.verdict.score && verdict.miles < best.verdict.miles)));
    if (better) best = { candidate, verdict, rank };
  }
  return best ? { candidate: best.candidate, verdict: best.verdict } : null;
}

/**
 * The Overpass box: every point at which a candidate could possibly be accepted.
 *
 * Derived from the towns of the rows being geocoded rather than written down,
 * because a written-down box goes stale the moment Eddy adds a river — which is
 * exactly what happened. The padding is `MILES_MAX` converted to degrees, so
 * the swept area IS the area the distance test would allow and not one mile
 * more: a candidate outside this box could not pass even if it were swept.
 *
 * Longitude is divided by cos(lat) because a degree of longitude shrinks toward
 * the poles; at 37°N it is about four fifths of a degree of latitude, and an
 * unscaled pad would be too narrow east-to-west exactly where the Elk River
 * rows sit.
 */
export function sweepBox(towns: readonly [number, number][]): string {
  if (towns.length === 0) throw new Error('No geocoded towns — nothing to sweep.');
  const lats = towns.map((t) => t[0]);
  const lngs = towns.map((t) => t[1]);
  const padLat = MILES_MAX / 69;
  const midLat = (Math.min(...lats) + Math.max(...lats)) / 2;
  const padLng = padLat / Math.max(0.2, Math.cos((midLat * Math.PI) / 180));
  return [
    (Math.min(...lats) - padLat).toFixed(3),
    (Math.min(...lngs) - padLng).toFixed(3),
    (Math.max(...lats) + padLat).toFixed(3),
    (Math.max(...lngs) + padLng).toFixed(3),
  ].join(',');
}

/**
 * Which OSM tags describe each kind of business.
 *
 * Campgrounds are well mapped and well named. Lodging is decent. Outfitters are
 * poor — a canoe livery is often a shop with no distinguishing tag at all — and
 * the run says so rather than letting a thin corpus read as "nothing matched".
 *
 * An unknown type throws. Before this table existed every type swept
 * `tourism=camp_site`, so asking for outfitters compared them against
 * campgrounds and printed matches that meant nothing.
 */
export const POI_TAGS: Record<string, string[]> = {
  campground: ['tourism=camp_site', 'tourism=caravan_site'],
  cabin_lodge: [
    'tourism=chalet',
    'tourism=hotel',
    'tourism=motel',
    'tourism=guest_house',
    'tourism=apartment',
  ],
  outfitter: ['amenity=boat_rental', 'shop=rental', 'shop=outdoor', 'shop=sports'],
};

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
    // A CLOSED BUSINESS IS NOT A GEOCODING PROBLEM. This filter was absent, so
    // every run swept `permanently_closed` rows too — Eminence Canoe Rental and
    // Steele River Kayaks and Boards among them — and printed them for review
    // beside the live ones, indistinguishable. Two costs, and the second is the
    // one this file already argues about at length: it spends Overpass budget
    // and a reader's attention on rows nobody wants a pin for, and the whole
    // point of a coordinate here is to draw one. A pin on a business that shut
    // is the "confidently wrong" case the header opens with, arrived at from a
    // different direction.
    //
    // geocode-services-mapbox.ts, written later, has filtered these out since
    // it landed. This is that same rule, arriving where it was missing.
    .neq('status', 'permanently_closed')
    .order('name');
  if (error) throw new Error(error.message);

  const rows = data ?? [];
  if (rows.length === 0) {
    console.log(`Every ${type} already has coordinates.`);
    return;
  }
  console.log(`${rows.length} ${type} rows with no coordinates\n`);

  const tags = POI_TAGS[type];
  if (!tags) {
    throw new Error(
      `No OSM tags defined for type '${type}'. Add them to POI_TAGS — running ` +
        `without them would sweep the wrong corpus and print matches that mean nothing.`,
    );
  }

  // ── TOWNS FIRST, because the search area is derived from them ───────────
  // This used to happen lazily inside the matching loop, which is why the box
  // below could only ever be a constant. Same number of Nominatim calls, just
  // ordered so the data can decide the area.
  const towns = new Map<string, [number, number] | null>();
  for (const row of rows) {
    const key = `${row.city}, ${row.state}`;
    if (towns.has(key)) continue;
    const found = await json<{ lat: string; lon: string }[]>(
      `${NOMINATIM}?q=${encodeURIComponent(`${key}, USA`)}&format=json&limit=1`,
    );
    towns.set(key, found[0] ? [Number(found[0].lat), Number(found[0].lon)] : null);
    await sleep(1200);
  }

  const located = [...towns.values()].filter((t): t is [number, number] => t !== null);
  const missing = [...towns.entries()].filter(([, t]) => t === null).map(([k]) => k);
  if (missing.length) {
    console.log(`${missing.length} towns did not geocode: ${missing.join('; ')}`);
    console.log('Their rows cannot pass the distance test and will read as review.\n');
  }

  const box = sweepBox(located);
  console.log(`Sweeping ${box} for ${tags.join(', ')}`);

  // One Overpass sweep for the whole region beats a request per row, and it is
  // the same corpus every run so results are comparable between runs.
  const clauses = tags
    .map((t) => {
      const [k, v] = t.split('=');
      return `node["${k}"="${v}"](${box}); way["${k}"="${v}"](${box});`;
    })
    .join('\n    ');
  const query = `[out:json][timeout:180];(\n    ${clauses}\n  );out center tags;`;
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
  console.log(`${candidates.length} named ${type} POIs in that area\n`);
  if (candidates.length < rows.length) {
    console.log(
      `Fewer POIs than rows. OSM names this kind of business sparsely — treat a\n` +
        `blank result as "not in OSM" rather than as "does not exist".\n`,
    );
  }

  let accepted = 0;
  let unreachable = 0;

  for (const row of rows) {
    const town = towns.get(`${row.city}, ${row.state}`) ?? null;
    const best = pickBest(row.name, town, candidates);
    if (!best) {
      unreachable++;
      console.log(`  none    ${row.name.slice(0, 30).padEnd(32)}no candidate in the swept area`);
      continue;
    }

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
  if (unreachable) {
    console.log(`${unreachable} had no candidate at all in the swept area.`);
  }
  console.log('Nothing was written. Put the accepted rows in a migration by hand,');
  console.log("with geocode_precision='exact' and geocode_source='osm'.");
}

if (process.argv[1]?.includes('geocode-services-dryrun')) {
  void main();
}
