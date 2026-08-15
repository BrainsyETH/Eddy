// scripts/discover-usace-locations.ts
// Every project a CWMS district publishes, diffed against the dam registry.
//
//   npx tsx scripts/discover-usace-locations.ts             # SWL, SWT, MVS
//   npx tsx scripts/discover-usace-locations.ts SWL         # one district
//   npx tsx scripts/discover-usace-locations.ts SWL --json  # machine-readable
//
// Read-only: GETs a public, unauthenticated API and writes nothing.
// Deliberately NOT in the `test` script — it needs the network, and CI stays
// hermetic. Same posture as check-usace-resolver.ts, and the two are meant to be
// run in sequence when adding dams (see USAGE at the bottom).
//
// ── WHY THIS EXISTS ────────────────────────────────────────────────────────
// `cdaLocation` cannot be derived and must never be guessed. The registry's own
// header says a typo there "is a silent 404 rather than a type error", and the
// naming is not one convention but at least four:
//
//   Table_Rock_Dam          SWL reservoir  — name with underscores
//   GreersFerry_Dam         SWL reservoir  — and sometimes without the space
//   LD12_Ozark              SWL lock & dam — lock number, then name
//   Mark Twain Lk-Salt      MVS            — spaces, abbreviation, stream suffix
//   TENK / FGIB / BROK      SWT            — opaque four-letter codes
//
// Nothing about "DeGray Lake" tells you whether SWL files it as `DeGray_Dam`,
// `DEGR`, or `DeGray Lk-Caddo`. The only authority is /locations, so this asks
// it and prints the answer beside what the registry already claims.
//
// It also answers the question that comes first: WHICH projects a district
// publishes at all. Kansas City publishes nothing to CDA — a fact recorded in
// the registry only because somebody checked by hand — and a district that has
// gone quiet looks identical to one nobody has looked at.
//
// ── WHAT IT DOES NOT DO ────────────────────────────────────────────────────
// It does not tell you whether a location carries USEFUL timeseries. A CWMS
// office publishes gauges, weirs and pumping plants alongside its dams, and a
// location existing says nothing about `Flow-Res Out` existing under it. That
// is check-usace-resolver.ts's job, and it can only be asked once a candidate
// has an id — which is what this produces.

import { USACE_DAMS, type UsaceOffice } from '../src/lib/flow-providers/usace-registry';

const CDA_BASE = 'https://cwms-data.usace.army.mil/cwms-data';
const CDA_HEADERS = { Accept: 'application/json;version=2' } as const;

/** Generous: the catalog endpoints are slow and this is one request per office. */
const REQUEST_TIMEOUT_MS = 30_000;

/** Districts Eddy has dams in. Add one here to sweep it. */
const DEFAULT_OFFICES: UsaceOffice[] = ['SWL', 'SWT', 'MVS'];

/**
 * Words that mark a location as a PROJECT rather than an instrument.
 *
 * A district publishes hundreds of locations, most of them stream gauges. This
 * is a display filter only — `--all` prints everything — and it is deliberately
 * generous rather than clever: a candidate wrongly hidden here is a dam nobody
 * adds, which is the failure that matters. Anything unmatched still appears
 * under the "other" count so the filter can never silently swallow the answer.
 */
const PROJECT_HINT = /\b(dam|lake|lk|reservoir|res|lock|ld\d+|pool)\b/i;

interface CdaLocation {
  name: string;
  latitude: number | null;
  longitude: number | null;
  /** CWMS's own two-letter state, which the registry prefers over a gazetteer. */
  ['state-initial']?: string | null;
  ['public-name']?: string | null;
  ['location-kind']?: string | null;
  active?: boolean | null;
}

/**
 * The district's locations, or NULL when the request itself failed.
 *
 * ── Null and empty are different answers and must not share a return ───────
 * The first version returned `[]` for both, and the consequence was immediate:
 * run behind a proxy that denies CDA and the script reported all eight shipped
 * Little Rock dams as "renamed or withdrawn upstream" — the loudest finding it
 * can produce, fabricated wholesale out of a 403. That is the same cry-wolf
 * failure check-usace-resolver.ts documents at length and re-checks every
 * finding to avoid.
 *
 * A district that genuinely publishes nothing is a real and interesting answer
 * — it is what Kansas City looks like — so the empty array has to stay
 * expressible. Hence null for "we could not ask".
 */
async function fetchLocations(office: string): Promise<CdaLocation[] | null> {
  // page-size is generous on purpose: a district has hundreds of locations and
  // a truncated first page would read as "this district publishes less than it
  // does", which is the exact wrong conclusion for this script to support.
  const url = `${CDA_BASE}/locations?office=${encodeURIComponent(office)}&page-size=2000`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: CDA_HEADERS, signal: controller.signal });
    if (!res.ok) {
      console.error(`[${office}] HTTP ${res.status} from /locations`);
      return null;
    }
    const body = (await res.json()) as { locations?: { locations?: CdaLocation[] } };
    // CDA v2 nests the array; older shapes returned it bare. Accept both rather
    // than failing on an envelope change that has nothing to do with the data.
    const nested = body?.locations?.locations;
    if (Array.isArray(nested)) return nested;
    if (Array.isArray(body?.locations)) return body.locations as unknown as CdaLocation[];
    console.error(`[${office}] unexpected response shape from /locations`);
    return null;
  } catch (e) {
    console.error(`[${office}] fetch failed:`, e instanceof Error ? e.message : e);
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function main(): Promise<void> {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const all = args.includes('--all');
  const offices = args.filter((a) => !a.startsWith('--')) as UsaceOffice[];
  const targets = offices.length > 0 ? offices : DEFAULT_OFFICES;

  // Everything the registry already claims, so the diff is exact rather than
  // eyeballed. Keyed per office because a location name is only unique within
  // one — SWL and SWT could both hold a `TENK` and mean different projects.
  const claimed = new Map<string, Map<string, string>>();
  for (const dam of Object.values(USACE_DAMS)) {
    if (!dam.office || !dam.cdaLocation) continue;
    const forOffice = claimed.get(dam.office) ?? new Map<string, string>();
    forOffice.set(dam.cdaLocation, dam.id);
    claimed.set(dam.office, forOffice);
  }

  return (async () => {
    const report: Record<string, unknown> = {};

    let failed = false;

    for (const office of targets) {
      const locations = await fetchLocations(office);
      const mine = claimed.get(office) ?? new Map<string, string>();

      // Could not ask. Say so and move on — inferring anything from a failed
      // request is how this script would report eight healthy dams as
      // withdrawn, which it did until the return type could express this.
      if (locations === null) {
        failed = true;
        if (json) report[office] = { error: 'request failed — nothing can be concluded' };
        else {
          console.log(`\n── ${office} ${'─'.repeat(60)}`);
          console.log('  request failed — nothing can be concluded about this district.');
        }
        continue;
      }

      const projects = locations.filter((l) => all || PROJECT_HINT.test(l.name ?? ''));
      const wired = projects.filter((l) => mine.has(l.name));
      const candidates = projects.filter((l) => !mine.has(l.name));
      const other = locations.length - projects.length;

      // A pin the district no longer publishes is the failure mode that breaks
      // a SHIPPED dam rather than delaying a new one, so it is reported first
      // and loudest. Everything below it is opportunity; this is a regression.
      const names = new Set(locations.map((l) => l.name));
      const missing = [...mine.entries()].filter(([location]) => !names.has(location));

      if (json) {
        report[office] = {
          total: locations.length,
          wired: wired.map((l) => ({ cdaLocation: l.name, damId: mine.get(l.name) })),
          missing: missing.map(([location, damId]) => ({ cdaLocation: location, damId })),
          candidates: candidates.map((l) => ({
            cdaLocation: l.name,
            publicName: l['public-name'] ?? null,
            state: l['state-initial'] ?? null,
            lat: l.latitude,
            lon: l.longitude,
            kind: l['location-kind'] ?? null,
            active: l.active ?? null,
          })),
        };
        continue;
      }

      console.log(`\n── ${office} ${'─'.repeat(60)}`);
      console.log(
        `${locations.length} locations, ${projects.length} look like projects` +
          (all ? '' : ` (${other} filtered out — pass --all to see them)`)
      );

      if (missing.length > 0) {
        console.log(`\n  !! ${missing.length} REGISTERED location(s) NOT FOUND upstream:`);
        for (const [location, damId] of missing) {
          console.log(`     ${damId} pins ${location} — renamed or withdrawn`);
        }
      }

      console.log(`\n  already wired (${wired.length}):`);
      for (const l of wired) console.log(`     ${l.name.padEnd(24)} ${mine.get(l.name)}`);

      console.log(`\n  candidates (${candidates.length}):`);
      for (const l of candidates) {
        const coords =
          l.latitude != null && l.longitude != null
            ? `${l.latitude.toFixed(5)}, ${l.longitude.toFixed(5)}`
            : 'no coordinates';
        const state = l['state-initial'] ?? '??';
        const label = l['public-name'] && l['public-name'] !== l.name ? ` "${l['public-name']}"` : '';
        console.log(`     ${l.name.padEnd(24)} ${state}  ${coords}${label}`);
      }
    }

    // A run that could not reach CDA has produced no answer, and exiting 0
    // would let it pass for one in a script somebody wired into a check.
    if (failed) {
      console.error(
        '\nOne or more districts could not be reached. CDA is public and unauthenticated,' +
          '\nso a 403 here is usually an egress policy rather than upstream: this repo’s' +
          '\nweb environment denies cwms-data.usace.army.mil. Run locally or widen it.'
      );
      process.exitCode = 1;
      if (json) console.log(JSON.stringify(report, null, 2));
      return;
    }

    if (json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(`
── NEXT ${'─'.repeat(63)}
A candidate here is an ID, not a decision. Before one becomes a registry entry:

  1. npx tsx scripts/check-usace-resolver.ts   — after adding the entry with its
     office + cdaLocation, confirm which metrics actually resolve. A location
     that exists may publish nothing Eddy can use.
  2. Decide tailwaterFishery. It is REQUIRED on every dam and deliberately
     cannot be inferred — Norfork is a premier trout tailwater that publishes no
     water temperature at all. If it is trout, update the exact list in
     usace-registry.test.ts, which is designed to fail until you do.
  3. Take lat/lon/state from THIS output, not from a gazetteer. The registry
     says so, and check-usace-resolver re-checks against CWMS.

A dam with no swpaCode gets no generation SCHEDULE — no next-change line, and no
forward half of the pattern strip. It does still get a powerhouse, observed
turbine flow and pattern history, provided it declares a nameplate: that is what
hasPowerhouse() reads, and both the wire field and the history cron go through
it. See docs/dam-expansion.md.
`);
    }
  })();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
