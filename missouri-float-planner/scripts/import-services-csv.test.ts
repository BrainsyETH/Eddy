import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildRows,
  checkedAtProblem,
  nameCollisions,
  parseCsv,
  planRow,
  resolveOfferings,
  sourceProblem,
  slugify,
  SOURCE_MAX_AGE_DAYS,
  type ExistingService,
  type ParsedRow,
} from './import-services-csv';

// The importer writes to production. Every rule below exists because the
// previous version broke one of them against real data, so each case names the
// damage it prevents rather than describing the code.

const TODAY = new Date('2026-08-23T00:00:00Z');
const RECENT = '2026-08-01';

/** A header line carrying every column a case below needs. */
const HEADER =
  'name,type,river_slugs,slug,status,phone,website,city,state,latitude,' +
  'services_offered,alt_names,display_order,nps_authorized,tent_sites,' +
  'verified_source,source_checked_at';

function csv(...lines: string[]): string[][] {
  return parseCsv([HEADER, ...lines].join('\n'));
}

function rowFrom(line: string): ParsedRow {
  const { rows, errors } = buildRows(csv(line), TODAY);
  assert.deepEqual(errors, [], `expected a clean row, got ${JSON.stringify(errors)}`);
  return rows[0];
}

const RIVERS = new Map([['niangua', 'river-niangua'], ['bourbeuse', 'river-bourbeuse']]);

function existingService(over: Partial<ExistingService> = {}): ExistingService {
  return {
    id: 'svc-1',
    slug: 'bennett-spring-canoe',
    name: 'Bennett Spring Canoe Rental',
    type: 'outfitter',
    alt_names: [],
    phone: '(417) 532-4307',
    website: 'https://example.com',
    city: 'Lebanon',
    state: 'MO',
    status: 'active',
    display_order: 10,
    nps_authorized: false,
    services_offered: ['canoe_rental', 'shuttle'],
    latitude: 37.7,
    ...over,
  };
}

// ── Presence ──────────────────────────────────────────────────────────────
// An empty cell was never merely a null: status became 'active', state became
// 'MO', display_order became 100, the flags became false and services_offered
// became []. A thin re-import overwrote a rich row with defaults.

test('an absent cell makes no claim, so an update leaves the stored value alone', () => {
  const row = rowFrom(
    `Bennett Spring Canoe Rental,outfitter,niangua,bennett-spring-canoe,,,,,,,,,,,,https://bennettspringcanoe.com,${RECENT}`,
  );
  const plan = planRow(row, existingService(), [{ river_slug: 'niangua', is_primary: true }], RIVERS, false);

  for (const field of ['status', 'state', 'display_order', 'nps_authorized', 'services_offered', 'phone']) {
    assert.ok(!(field in plan.payload), `${field} must not be written when its cell is empty`);
  }
});

test('defaults still apply on insert, where there is nothing to protect', () => {
  const row = rowFrom(
    `New Outfitter,outfitter,niangua,,,,,,,,,,,,,https://newoutfitter.com,${RECENT}`,
  );
  const plan = planRow(row, undefined, [], RIVERS, false);

  assert.equal(plan.action, 'insert');
  assert.equal(plan.payload.status, 'active');
  assert.equal(plan.payload.state, 'MO');
  assert.equal(plan.payload.display_order, 100);
  assert.equal(plan.payload.nps_authorized, false);
  assert.deepEqual(plan.payload.services_offered, []);
});

test('a populated cell does replace the stored scalar', () => {
  const row = rowFrom(
    `Bennett Spring Canoe Rental,outfitter,niangua,bennett-spring-canoe,,(417) 555-0000,,,,,,,,,,https://bennettspringcanoe.com,${RECENT}`,
  );
  const plan = planRow(row, existingService(), [{ river_slug: 'niangua', is_primary: true }], RIVERS, false);
  assert.equal(plan.payload.phone, '(417) 555-0000');
});

// ── Arrays merge, they do not clobber ─────────────────────────────────────

test('services_offered unions rather than replacing', () => {
  const row = rowFrom(
    `Bennett Spring Canoe Rental,outfitter,niangua,bennett-spring-canoe,,,,,,,kayak_rental,,,,,https://bennettspringcanoe.com,${RECENT}`,
  );
  const plan = planRow(row, existingService(), [{ river_slug: 'niangua', is_primary: true }], RIVERS, false);
  assert.deepEqual(
    [...(plan.payload.services_offered as string[])].sort(),
    ['canoe_rental', 'kayak_rental', 'shuttle'],
  );
});

test('--overwrite is what replaces an array wholesale', () => {
  const row = rowFrom(
    `Bennett Spring Canoe Rental,outfitter,niangua,bennett-spring-canoe,,,,,,,kayak_rental,,,,,https://bennettspringcanoe.com,${RECENT}`,
  );
  const plan = planRow(row, existingService(), [{ river_slug: 'niangua', is_primary: true }], RIVERS, true);
  assert.deepEqual(plan.payload.services_offered, ['kayak_rental']);
});

// ── River links ───────────────────────────────────────────────────────────

test('links are added, and none are removed without --overwrite', () => {
  const row = rowFrom(
    `Bennett Spring Canoe Rental,outfitter,niangua|bourbeuse,bennett-spring-canoe,,,,,,,,,,,,https://bennettspringcanoe.com,${RECENT}`,
  );
  const plan = planRow(row, existingService(), [{ river_slug: 'niangua', is_primary: true }], RIVERS, false);
  assert.deepEqual(plan.linkAdds, ['bourbeuse']);
  assert.deepEqual(plan.linkRemoves, []);
});

test('is_primary is never re-pointed by CSV column order alone', () => {
  const row = rowFrom(
    `Bennett Spring Canoe Rental,outfitter,bourbeuse|niangua,bennett-spring-canoe,,,,,,,,,,,,https://bennettspringcanoe.com,${RECENT}`,
  );
  const plan = planRow(row, existingService(), [{ river_slug: 'niangua', is_primary: true }], RIVERS, false);
  assert.deepEqual(plan.primaryFlips, [], 'a stored primary river must survive a reordered CSV');
});

test('--overwrite is what re-points is_primary', () => {
  const row = rowFrom(
    `Bennett Spring Canoe Rental,outfitter,bourbeuse|niangua,bennett-spring-canoe,,,,,,,,,,,,https://bennettspringcanoe.com,${RECENT}`,
  );
  const plan = planRow(row, existingService(), [{ river_slug: 'niangua', is_primary: true }], RIVERS, true);
  assert.deepEqual(plan.primaryFlips, ['bourbeuse']);
});

test('a row that claims nothing new is reported as unchanged, not rewritten', () => {
  const row = rowFrom(
    `Bennett Spring Canoe Rental,outfitter,niangua,bennett-spring-canoe,,(417) 532-4307,,,,,,,,,,https://bennettspringcanoe.com,${RECENT}`,
  );
  const existing = existingService({
    verified_source: 'https://bennettspringcanoe.com',
    last_verified_at: new Date(`${RECENT}T00:00:00Z`).toISOString(),
  });
  const plan = planRow(row, existing, [{ river_slug: 'niangua', is_primary: true }], RIVERS, false);
  assert.equal(plan.action, 'unchanged');
});

// ── Offerings: never guess ────────────────────────────────────────────────
// 12 campgrounds are in production with no camping offering because these keys
// were dropped with a warning instead of refused.

test('an exact synonym is safe to map', () => {
  assert.deepEqual(resolveOfferings(['store', 'rv']).offerings, ['general_store', 'camping_rv']);
});

test('"camping" is refused, because a campground may be RV-only', () => {
  const { errors } = resolveOfferings(['camping']);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /camping_primitive or camping_rv/);
});

test('"restrooms" and "lodging" are refused with their alternatives named', () => {
  assert.match(resolveOfferings(['restrooms']).errors[0], /flush_toilets or vault_toilets/);
  assert.match(resolveOfferings(['lodging']).errors[0], /lodge_rooms or cabins/);
});

test('an offering outside the enum fails validation instead of being dropped', () => {
  const { errors } = buildRows(
    csv(`Withrow Springs,campground,niangua,,,,,,,,camping|showers,,,,10,https://arkansasstateparks.com/withrow,${RECENT}`),
    TODAY,
  );
  assert.ok(errors.some((e) => /ambiguous/.test(e.message)), 'the whole row must fail, not silently lose camping');
});

// ── Provenance is claimed, never inferred ─────────────────────────────────

test('csv_import is refused as a source', () => {
  assert.match(String(sourceProblem('csv_import')), /records nothing/);
});

test('a source must be openable again', () => {
  assert.equal(sourceProblem('https://bennettspringcanoe.com'), null);
  assert.equal(sourceProblem('arkansasstateparks.com/withrow'), null);
  assert.equal(sourceProblem('NPS-BUFF-2026'), null);
  assert.match(String(sourceProblem('i asked someone')), /neither a URL/);
});

test('every part of a comma-separated source list is checked', () => {
  assert.match(String(sourceProblem('https://real.com, csv_import')), /records nothing/);
});

test('research older than the age limit must be re-checked, not re-stamped', () => {
  assert.equal(checkedAtProblem('2026-08-01', TODAY), null);
  assert.match(String(checkedAtProblem('2025-01-01', TODAY)), new RegExp(String(SOURCE_MAX_AGE_DAYS)));
  assert.match(String(checkedAtProblem('2027-01-01', TODAY)), /future/);
  assert.match(String(checkedAtProblem('08/01/2026', TODAY)), /YYYY-MM-DD/);
});

test('last_verified_at comes from the checked date, not from now()', () => {
  const row = rowFrom(
    `New Outfitter,outfitter,niangua,,,,,,,,,,,,,https://newoutfitter.com,${RECENT}`,
  );
  assert.equal(row.claimed.last_verified_at, new Date(`${RECENT}T00:00:00Z`).toISOString());
});

test('a row with no source at all cannot be imported', () => {
  const { errors } = buildRows(csv('Sourceless,outfitter,niangua,,,,,,,,,,,,,,'), TODAY);
  assert.ok(errors.some((e) => /verified_source is required/.test(e.message)));
  assert.ok(errors.some((e) => /source_checked_at is required/.test(e.message)));
});

// ── Identity ──────────────────────────────────────────────────────────────

test('a duplicate slug inside one file is caught before anything is written', () => {
  const { errors } = buildRows(
    csv(
      `Bennett Spring Canoe,outfitter,niangua,,,,,,,,,,,,,https://a.com,${RECENT}`,
      `Bennett Spring Canoe,outfitter,niangua,,,,,,,,,,,,,https://b.com,${RECENT}`,
    ),
    TODAY,
  );
  assert.ok(errors.some((e) => /already used on line/.test(e.message)));
});

test('a renamed business is caught instead of silently duplicated', () => {
  // slugify() would mint a new slug and insert a second row for the same place.
  const row = rowFrom(
    `Bennett Spring Canoe Rentals LLC,outfitter,niangua,,,,,,,,,,,,,https://bennettspringcanoe.com,${RECENT}`,
  );
  const hits = nameCollisions(row, [existingService()]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].slug, 'bennett-spring-canoe');
});

test('alt_names is what lets a known second name resolve', () => {
  // The primary name scores 0.15 against this row; the alt name scores 0.98.
  // Without alt_names the collision is invisible and a duplicate goes in.
  const row = rowFrom(
    `Akers Ferry Canoe Rentals,outfitter,niangua,,,,,,,,,,,,,https://currentrivercanoe.com,${RECENT}`,
  );
  const hits = nameCollisions(row, [existingService({
    name: 'Jason Place Resort', slug: 'jason-place', alt_names: ['Akers Ferry Canoe Rental'],
  })]);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].slug, 'jason-place');
});

test('an explicit slug is the author saying "this is that row" — no collision check', () => {
  const row = rowFrom(
    `Bennett Spring Canoe Rentals LLC,outfitter,niangua,bennett-spring-canoe,,,,,,,,,,,,https://bennettspringcanoe.com,${RECENT}`,
  );
  assert.deepEqual(nameCollisions(row, [existingService()]), []);
});

test('unrelated businesses do not collide', () => {
  const row = rowFrom(
    `Vogel Canoe Rental,outfitter,niangua,,,,,,,,,,,,,https://vogelcanoe.com,${RECENT}`,
  );
  assert.deepEqual(nameCollisions(row, [existingService()]), []);
});

// ── Whole-file validation ─────────────────────────────────────────────────

test('one bad row invalidates the file, so a partial import cannot happen', () => {
  const { rows, errors } = buildRows(
    csv(
      `Good One,outfitter,niangua,,,,,,,,,,,,,https://good.com,${RECENT}`,
      `Bad One,outfitter,niangua,,,,,,,,camping,,,,,https://bad.com,${RECENT}`,
      `Good Two,outfitter,niangua,,,,,,,,,,,,,https://good2.com,${RECENT}`,
    ),
    TODAY,
  );
  assert.equal(rows.length, 3, 'all rows are still planned so the diff shows the whole file');
  assert.ok(errors.length > 0, 'but the run must abort before writing any of them');
});

test('an invalid type or missing river is refused', () => {
  const bad = buildRows(csv(`X,marina,niangua,,,,,,,,,,,,,https://x.com,${RECENT}`), TODAY);
  assert.ok(bad.errors.some((e) => /outfitter\|campground\|cabin_lodge/.test(e.message)));

  const noRiver = buildRows(csv(`X,outfitter,,,,,,,,,,,,,,https://x.com,${RECENT}`), TODAY);
  assert.ok(noRiver.errors.some((e) => /river_slugs is required/.test(e.message)));
});

test('slugify strips punctuation the way stored slugs were built', () => {
  assert.equal(slugify("Akers Ferry Canoe Rental"), 'akers-ferry-canoe-rental');
  assert.equal(slugify("Windy's Floats"), 'windys-floats');
});

test('a timestamp is compared as an instant, not as text', () => {
  // Postgres returns +00:00 where toISOString() produced .000Z. Comparing them
  // as strings made every timestamp this script writes look like it had failed
  // to land, and made an already-correct row look like it needed an update.
  const row = rowFrom(
    `Bennett Spring Canoe Rental,outfitter,niangua,bennett-spring-canoe,,,,,,,,,,,,https://bennettspringcanoe.com,${RECENT}`,
  );
  const existing = existingService({
    verified_source: 'https://bennettspringcanoe.com',
    last_verified_at: `${RECENT}T00:00:00+00:00`,
  });
  const plan = planRow(row, existing, [{ river_slug: 'niangua', is_primary: true }], RIVERS, false);
  assert.equal(plan.action, 'unchanged', 'same instant, different serialisation');
});
