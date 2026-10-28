/**
 * Data corrections from the October 28, 2026 access-point audit, reviewed for
 * what a floater sees. Exact-ID, compare-and-set, preview by default.
 *
 * Run from missouri-float-planner with configured Supabase admin credentials:
 *   npx tsx scripts/repair-access-audit-2026-10.ts --part access        # preview
 *   EXPECTED_SUPABASE_REF=ilefwfpvphadsbptiaur npx tsx scripts/repair-access-audit-2026-10.ts --part access --apply
 *
 * Two parts, because they are safe at different times:
 *
 *   access     Access-point records. The weekly NPS sync writes only
 *              nps_campground_id on access points, so these hold once applied.
 *   landmarks  Points of interest. Apply ONLY after the sync fix in
 *              src/lib/nps/sync.ts (placeColumns) is deployed: before it, the
 *              Sunday cron rewrites type, active and is_on_water on every NPS
 *              place, which is how the September 5 spring repair was undone.
 *              Run scripts/repair-spring-classifications.ts at the same time.
 *   van-buren  Merges Van Buren City Access into Van Buren Riverfront Park.
 *              Apply on a deployment that includes the redirect in
 *              src/lib/access-points/merged-slugs.ts, or the old URL 404s.
 *
 * Every row is checked for identity (id + slug or name) and for each field
 * holding either its expected current value or its target, before the first
 * write. Each write is conditioned on the row's updated_at being unchanged
 * since it was read, so a concurrent edit stops the run instead of being
 * overwritten. A rerun skips rows already corrected. The preview prints the
 * current values, which are the rollback.
 */
import { isDeepStrictEqual } from 'node:util';
import { getScriptClient } from './lib/db';

type Fields = Record<string, unknown>;
interface Correction {
  id: string;
  /** Identity column and value checked before and during the write. */
  identity: { column: 'slug' | 'name'; value: string };
  why: string;
  from: Fields;
  to: Fields;
}

const ALLEY_FEES =
  'No fee to use the river access. Summer campsites (April 15 to October 15) are ' +
  '$20 non-electric and $30 electric per night; winter rates are lower. Reserve on recreation.gov.';

const ACCESS: Correction[] = [
  {
    id: 'ab5c22e7-ff04-44fc-8c1c-b2f981ebd80f',
    identity: { column: 'slug', value: 'cowskin-access' },
    why: 'MDC lists a concrete boat ramp and parking; it was missing from the put-in and take-out pickers.',
    from: { is_float_endpoint: false, types: ['access'] },
    to: { is_float_endpoint: true, types: ['access', 'boat_ramp'] },
  },
  {
    id: '8455512e-fb31-4437-b45e-01e5fa3401b5',
    identity: { column: 'slug', value: 'bass-river-resort' },
    why: 'Private resort with a day-use fee for non-guests; public=true suppressed the iOS permission prompt.',
    from: { is_public: true },
    to: { is_public: false },
  },
  {
    id: 'd64ed019-7c5f-4c66-8fb1-3bba4e70ffd5',
    identity: { column: 'slug', value: 'highway-v-bridge' },
    why: 'Record describes private bridge access; marking it private shows the permission prompt rather than a public badge.',
    from: { is_public: true },
    to: { is_public: false },
  },
  {
    id: 'e3dc7b91-6d06-4102-bd80-99ae16fd4ef1',
    identity: { column: 'slug', value: 'greer-spring' },
    why: 'The record is Greer Crossing (USFS campground and ramp at Hwy 19). Greer Spring is a separate trailhead about a mile away.',
    from: { name: 'Greer Spring', ownership: 'NPS', managing_agency: null, types: ['access'] },
    to: {
      name: 'Greer Crossing',
      ownership: 'USFS',
      managing_agency: 'USFS',
      types: ['access', 'campground', 'boat_ramp'],
    },
  },
  {
    id: '8618c6f4-cbd1-44c6-aa4e-c41f500b732a',
    identity: { column: 'slug', value: 'alley-spring' },
    why: 'Keep the name floaters use. Replace mill-centred prose and stale reservation and shower claims with the launch and campground, from NPS data.',
    from: {
      description: 'Famous red Alley Mill and spring. Major camping and float destination.',
      parking_info: 'Large parking area near mill',
      facilities:
        'Major NPS front-country campground: 146 family sites (some reservable), 26 electric sites, 3 group sites, 14 cluster sites. Flush toilets and hot showers Apr–Oct. Dump station. Campground host in summer. Harvey\'s general store across the road.',
      fee_notes: null,
    },
    to: {
      description:
        'Alley Spring is the largest NPS campground in Ozark National Scenic Riverways and a main river access on the Jacks Fork, about 6 miles west of Eminence on Highway 106. It is the usual take-out for floats from Bay Creek and the put-in for the Alley Spring to Eminence float. The whole campground is within walking distance of the river. The red Alley Mill and the spring are a short walk from the campground and worth the stop.',
      parking_info:
        'Parking is in the campground, which is within walking distance of the river. The campground is often full in summer, so arrive early on weekends.',
      facilities:
        'Largest NPS campground in Ozark National Scenic Riverways: electric and non-electric family sites, cluster sites, and group sites. All sites are reservation only on recreation.gov, with same-day reservations available. Flush toilets, hot showers, and a dump station. Seasonal camp host, camp store, firewood, and ice. A general store is on Highway 106 at the campground turn.',
      fee_notes: ALLEY_FEES,
    },
  },
  {
    id: '44241556-d384-44a7-851e-bad7b998a5bc',
    identity: { column: 'slug', value: 'pulltite-spring' },
    why: 'The record is the campground and launch; the spring is across the river and the description already says so. Fees and reservations from NPS data.',
    from: {
      name: 'Pulltite Spring',
      facilities:
        'NPS campground with ~55 sites ($16/night non-electric). Flush toilets and showers available April 15-Oct 15 (note: flood damage reverted facilities to vault toilet after Oct 2025 - check current status). Picnic tables, fire rings, grills. Current River Canoe Rental on site. Amphitheater.',
      fee_notes: null,
    },
    to: {
      name: 'Pulltite',
      facilities:
        'NPS campground with about 55 sites. All sites are reservation only on recreation.gov, with same-day reservations available. Flush toilets and hot showers. Picnic tables, fire rings, and grills. Seasonal camp host, camp store, firewood, and ice. Amphitheater. Current River Canoe Rental on site.',
      fee_notes:
        'No fee to use the river access. Summer campsites (April 15 to October 15) are $20 per night; winter sites are $10. Reserve on recreation.gov.',
    },
  },
];

const LANDMARKS: Correction[] = [
  {
    id: '9b93df42-3683-4fe3-88e8-e7962d107de2',
    identity: { column: 'name', value: 'Devils Well' },
    why: 'Inland sinkhole and cave lake about a mile from the Current, reached by road. Not a spring on the water.',
    from: { type: 'spring', is_on_water: true },
    to: { type: 'geological', is_on_water: false },
  },
  {
    id: '294bd282-8ef2-46ed-98f4-4091d079e74a',
    identity: { column: 'name', value: 'Rocky Falls' },
    why: 'On Rocky Creek, about 11.6 km from the Jacks Fork line it was snapped to. Not a stop on a Jacks Fork float.',
    from: { is_on_water: true, river_mile: 36.6921643899043 },
    to: { is_on_water: false, river_mile: null },
  },
];

// One town launch recorded twice (audit F15). Riverfront Park is canonical: it
// has the full prose, the photos, the closer pin and the saved-plan and photo
// references. City Access contributes its city ownership and concrete-ramp
// fact, then is retired. Nothing references its ID (checked 2026-10-28); its
// URL redirects via src/lib/access-points/merged-slugs.ts. Order matters: the
// canonical row is completed before the duplicate leaves the pickers.
const VAN_BUREN: Correction[] = [
  {
    id: '330ae0ce-dd7d-4c37-8784-d887bd4503e4',
    identity: { column: 'slug', value: 'van-buren-riverfront-park' },
    why: 'Canonical record for the Van Buren town launch; takes City Access ownership and ramp detail.',
    from: {
      ownership: null,
      managing_agency: null,
      facilities:
        'Town amenities: restaurants, gas station, coffee shop, lodging. The park itself has basic riverfront access. No campground at the park, but Big Spring Campground is 4 miles south.',
    },
    to: {
      ownership: 'city',
      managing_agency: 'Municipal',
      facilities:
        'Concrete boat ramp at the riverfront park. Town amenities nearby: restaurants, gas station, coffee shop, lodging. No campground at the park; Big Spring Campground is 4 miles south.',
    },
  },
  {
    id: '660218df-726a-4340-a392-7b2613eba202',
    identity: { column: 'slug', value: 'van-buren' },
    why: 'Duplicate of Van Buren Riverfront Park, about 140 m away. Retired, not deleted.',
    from: { approved: true },
    to: { approved: false },
  },
];

const PARTS = {
  access: { table: 'access_points', corrections: ACCESS },
  landmarks: { table: 'points_of_interest', corrections: LANDMARKS },
  'van-buren': { table: 'access_points', corrections: VAN_BUREN },
} as const;

const same = (a: unknown, b: unknown) => {
  if (typeof a === 'number' || typeof b === 'number') return a != null && b != null && Number(a) === Number(b);
  return isDeepStrictEqual(a ?? null, b ?? null);
};

async function main() {
  const apply = process.argv.includes('--apply');
  const partArg = process.argv[process.argv.indexOf('--part') + 1];
  if (!process.argv.includes('--part') || !(partArg in PARTS)) {
    throw new Error(`Pass --part with one of: ${Object.keys(PARTS).join(', ')}.`);
  }
  const { table, corrections } = PARTS[partArg as keyof typeof PARTS];
  const db = getScriptClient({ script: `repair-access-audit-2026-10:${partArg}`, write: apply });

  const columns = new Set(['id', 'updated_at', ...corrections.flatMap((c) => [c.identity.column, ...Object.keys(c.to)])]);
  const { data: rows, error } = await db.from(table).select([...columns].join(',')).in('id', corrections.map((c) => c.id));
  if (error) throw error;

  // Validate every row before the first write. Unexpected state needs review.
  const plan = corrections.map((c) => {
    const row = (rows as unknown as Fields[] | null)?.find((r) => r.id === c.id);
    const identity = row?.[c.identity.column];
    if (!row || (identity !== c.identity.value && identity !== c.to[c.identity.column])) {
      throw new Error(`Unexpected identity for ${c.identity.value} (${c.id}); no corrections started.`);
    }
    for (const field of Object.keys(c.to)) {
      if (!same(row[field], c.from[field]) && !same(row[field], c.to[field])) {
        throw new Error(
          `${c.identity.value}.${field} is ${JSON.stringify(row[field])}, neither the expected ` +
            `${JSON.stringify(c.from[field])} nor the target; no corrections started.`,
        );
      }
    }
    const pending = Object.keys(c.to).filter((field) => !same(row[field], c.to[field]));
    return { c, row, pending };
  });

  console.table(plan.map(({ c, pending }) => ({ record: c.identity.value, pending: pending.join(', ') || '(done)' })));
  console.log('Current values (rollback):');
  console.log(JSON.stringify(plan.map(({ c, row }) => ({ id: c.id, ...Object.fromEntries(Object.keys(c.to).map((f) => [f, row[f]])) })), null, 2));
  if (!apply) { console.log('Preview only. Add --apply with the project pin to write.'); return; }

  for (const { c, row, pending } of plan) {
    if (pending.length === 0) continue;
    const update = Object.fromEntries(pending.map((f) => [f, c.to[f]]));
    const { data: changed, error: updateError } = await db.from(table)
      .update({ ...update, updated_at: new Date().toISOString() })
      .eq('id', c.id)
      .eq('updated_at', row.updated_at as string)
      .select('id');
    if (updateError) throw updateError;
    if (changed?.length !== 1) {
      throw new Error(`Concurrent change to ${c.identity.value}; stopped. Earlier corrections may have applied; rerun the preview.`);
    }
    console.log(`Updated ${c.identity.value}: ${pending.join(', ')}`);
  }

  const { data: verified, error: verifyError } = await db.from(table).select([...columns].join(',')).in('id', corrections.map((c) => c.id));
  if (verifyError) throw verifyError;
  for (const c of corrections) {
    const row = (verified as unknown as Fields[] | null)?.find((r) => r.id === c.id);
    for (const field of Object.keys(c.to)) {
      if (!row || !same(row[field], c.to[field])) throw new Error(`Post-write verification failed for ${c.identity.value}.${field}.`);
    }
  }
  console.log(`Verified all ${corrections.length} ${partArg} corrections. Public responses refresh within the CDN TTL; the iOS offline bundle on next online launch.`);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
