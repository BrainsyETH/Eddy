import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { screeningGauge, screenCandidates, type Reach } from './search';
import type { Access, GaugeLink } from './data';

const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const links = [0, 10, 25, 50].map((mile, i) => ({
  gauge_station_id: id(i + 1),
  river_mile: mile,
  is_primary: i === 0,
  gauge_stations: { id: id(i + 1), active: i !== 3 },
})) as GaugeLink[];
const reaches: Reach[] = [
  {
    id: id(20),
    sort_order: 0,
    river_mile_start: 15,
    river_mile_end: 25,
    primary_gauge_station_id: id(3),
  },
  {
    id: id(21),
    sort_order: 1,
    river_mile_start: 40,
    river_mile_end: 60,
    primary_gauge_station_id: id(4),
  },
];
const points = Array.from({ length: 24 }, (_, i) => ({
  id: id(i + 100),
  approved: true,
  is_float_endpoint: true,
  is_public: true,
  river_mile_downstream: i * 2,
})) as Access[];

test('screening matches the latest migration’s actual mile-selection SQL including reach overrides', async () => {
  const folder = 'supabase/migrations';
  const file = readdirSync(folder)
    .sort()
    .reverse()
    .find(
      (name) =>
        name.endsWith('.sql') &&
        /CREATE OR REPLACE FUNCTION get_river_condition_segment\(/.test(
          readFileSync(`${folder}/${name}`, 'utf8'),
        ),
    )!;
  const migration = readFileSync(`${folder}/${file}`, 'utf8');
  const definition = migration.slice(
    migration.indexOf(
      'CREATE OR REPLACE FUNCTION get_river_condition_segment(',
    ),
  );
  // Execute the actual selection CTEs. This test supplies a verified mile, so
  // the unrelated nearest-coordinate branch (which needs PostGIS) is omitted.
  const ctes = definition
    .slice(
      definition.indexOf('section_gauge AS ('),
      definition.indexOf('gauge_info AS ('),
    )
    .replace(/,\s*$/, '')
    .replace(
      /WHEN p_put_in_point IS NOT NULL THEN \([\s\S]*?\n\s*\)\n\s*ELSE/,
      'WHEN FALSE THEN NULL ELSE',
    )
    .replaceAll('p_river_id', '$1::uuid')
    .replaceAll('p_put_in_mile', '$2::numeric');
  assert.doesNotMatch(ctes, /p_put_in_point|ST_Distance/);
  const db = new PGlite();
  try {
    await db.exec(`create table gauge_stations(id uuid, active boolean);
      create table river_gauges(river_id uuid, gauge_station_id uuid, river_mile numeric, is_primary boolean);
      create table river_sections(id uuid, river_id uuid, sort_order int, river_mile_start numeric, river_mile_end numeric, primary_gauge_station_id uuid);`);
    for (const link of links) {
      await db.query('insert into gauge_stations values ($1,$2)', [
        link.gauge_station_id,
        link.gauge_station_id !== id(4),
      ]);
      await db.query('insert into river_gauges values ($1,$2,$3,$4)', [
        id(99),
        link.gauge_station_id,
        link.river_mile,
        link.is_primary,
      ]);
    }
    for (const r of reaches)
      await db.query('insert into river_sections values ($1,$2,$3,$4,$5,$6)', [
        r.id,
        id(99),
        r.sort_order,
        r.river_mile_start,
        r.river_mile_end,
        r.primary_gauge_station_id,
      ]);
    for (const mile of [-5, 0, 12, 15, 20, 24.9, 25, 39, 40, 55, 60]) {
      const result = await db.query<{ gauge_id: string }>(
        `with resolved_mile as (select $2::numeric as mile), ${ctes}
        select fg.gauge_id from fallback_gauge fg join gauge_stations gs on gs.id=fg.gauge_id where gs.active`,
        [id(99), mile],
      );
      assert.equal(
        screeningGauge(mile, links, reaches)?.gauge_station_id ?? null,
        result.rows[0]?.gauge_id ?? null,
        `mile ${mile}`,
      );
    }
  } finally {
    await db.close();
  }
});

test('dry upper reaches do not consume the shortlist; unknowns survive and candidates span put-ins', () => {
  const screen = {
    links,
    reaches: [],
    ratings: new Map([
      [id(1), 'too_low'],
      [id(2), 'good'],
      [id(3), 'unknown'],
    ]),
  };
  const result = screenCandidates(points, 3, 2.5, true, screen);
  assert.equal(result.candidates.length, 6);
  assert.ok(
    result.candidates.every((c) => Number(c.putIn.river_mile_downstream) >= 10),
  );
  assert.ok(new Set(result.candidates.map((c) => c.putIn.id)).size >= 3);
  assert.ok(result.coverage.unknownPutIns > 0);
  assert.ok(result.coverage.screenedOutPairs > 0);
  const unknown = screenCandidates(points, 3, 2.5, true, {
    ...screen,
    ratings: new Map(),
  });
  assert.equal(unknown.candidates.length, 6);
  assert.equal(unknown.coverage.screenedOutPairs, 0);
});

test('fresh unsuitable in-span gauges exclude crossing pairs and inactive gauges do not', () => {
  const result = screenCandidates(points, 3, 2.5, true, {
    links,
    reaches: [],
    ratings: new Map([
      [id(1), 'good'],
      [id(2), 'good'],
      [id(3), 'high'],
      [id(4), 'dangerous'],
    ]),
  });
  assert.ok(result.candidates.length > 0);
  assert.ok(
    result.candidates.every(
      (c) => Number(c.takeOut.river_mile_downstream) < 25,
    ),
  );
});

test('coverage excludes put-ins without any strictly downstream endpoint', () => {
  const duplicateMiles = points.slice(0, 4).map((p, index) => ({
    ...p,
    river_mile_downstream: index === 0 ? 0 : 4,
  }));
  const result = screenCandidates(duplicateMiles, 3, 2.5, true);
  assert.equal(result.coverage.eligiblePutIns, 1);
  assert.equal(result.coverage.unknownPutIns, 1);
  assert.equal(result.coverage.eligiblePairs, 3);
});


test('Cedar Grove to Akers survives shortlisting and matches the five-hour boundary', async () => {
  const { calculateTripDuration } = await import('../calculations/trip-duration');
  const { durationRelation } = await import('@shared/float-search');
  const aps = [0, 7.6, 10, 12.5, 14].map((mile, i) => ({ ...points[i], river_mile_downstream: mile }));
  const duration = (a: Access, b: Access) => calculateTripDuration({
    miles: Number(b.river_mile_downstream) - Number(a.river_mile_downstream),
    speeds: { speedLowWater: 2, speedNormal: 2.5, speedHighWater: 3.5 }, condition: 'good',
    published: a.id === aps[0].id && b.id === aps[1].id ? { min: 180, max: 300, minutes: 240 } : null,
  });
  const result = screenCandidates(aps, 5, 2.5, true, undefined, duration);
  const cedar = result.candidates.find(c => c.putIn.id === aps[0].id && c.takeOut.id === aps[1].id);
  assert.ok(cedar);
  assert.equal(durationRelation(cedar.duration.timeRange, 300), 'match');
  assert.equal(durationRelation({ min: 240, max: 420 }, 300), 'match');
  assert.equal(durationRelation({ min: 240, max: 420 }, 420), 'match');
  assert.equal(durationRelation({ min: 240, max: 420 }, 421), 'shorter');
  assert.equal(durationRelation({ min: 240, max: 420 }, 239), 'longer');
});

test('ranking separates matches, condition tiers, time buckets and proximity', async () => {
  const { compareFloatChoices } = await import('@shared/float-search');
  const base = { id: 'a', minutes: 300, timeRange: { min: 240, max: 420 }, conditionCode: 'good', nearbyMiles: 20 };
  assert.ok(compareFloatChoices(base, { ...base, minutes: 390, timeRange: { min: 360, max: 480 }, nearbyMiles: 1 }, 300) < 0);
  assert.ok(compareFloatChoices(base, { ...base, conditional: true, nearbyMiles: 1 }, 300) < 0);
  assert.ok(compareFloatChoices(base, { ...base, minutes: 365, nearbyMiles: 1 }, 300) < 0);
  assert.ok(compareFloatChoices({ ...base, nearbyMiles: 95 }, { ...base, minutes: 335, nearbyMiles: 10 }, 300) > 0, 'nearby 5:35 wins over distant 5:00 inside the same hour bucket');
  assert.ok(compareFloatChoices(base, { ...base, minutes: 310, nearbyMiles: 10 }, 300) > 0);
  assert.ok(compareFloatChoices(base, { ...base, timeRange: { min: 120, max: 540 } }, 300) < 0);
});

test('one timing function preserves boat, published-time and flow behavior in final plans', async () => {
  const { calculateTripDuration } = await import('../calculations/trip-duration');
  const { routeFixture } = await import('../calculations/route-estimate-fixture');
  for (const vessel of ['canoe', 'raft', 'tube'] as const) {
    const speeds = { canoe: [2, 2.5, 3.5], raft: [1.5, 2, 2.5], tube: [1, 1.5, 2] }[vessel];
    for (const published of [undefined, { min: 180, max: 300 }]) {
      const result = await routeFixture({ vessel, miles: 7.6, condition: 'low', discharge: 150, reference: 300, published }).estimate();
      const preliminary = calculateTripDuration({ miles: 7.6, condition: 'low',
        speeds: { speedLowWater: speeds[0], speedNormal: speeds[1], speedHighWater: speeds[2] },
        options: { dischargeCfs: 150, refCfs: 300 },
        published: published ? { ...published, minutes: 240 } : null });
      assert.deepEqual(preliminary?.timeRange, result.floatTime?.timeRange);
      assert.equal(preliminary?.minutes, result.floatTime?.minutes);
    }
  }
});

import { publishedTiming } from './candidate-duration';
import { approximateLocation } from '@shared/float-search';
import { floatSearchIsFresh, floatSearchEmptyMessage, floatSearchRecoveryOptions, FLOAT_SEARCH_MAX_AGE_MS } from '@shared/float-search';
import { scrubFloatSearchRequest, scrubFloatSearchBreadcrumb } from '@shared/float-search-privacy';
test('published timing keeps kayak on canoe times and follows reverse-route rules', () => {
  const rows = [{ put_in_id: 'a', take_out_id: 'b', canoe_time_min: 180, canoe_time_max: 300, raft_time_min: 240, raft_time_max: 360, tube_time_min: 360, tube_time_max: 480 }];
  for (const boat of ['canoe', 'kayak']) assert.deepEqual(publishedTiming(rows, 'a', 'b', boat), { min: 180, max: 300, minutes: 240 });
  assert.deepEqual(publishedTiming(rows, 'a', 'b', 'raft'), { min: 240, max: 360, minutes: 300 });
  assert.deepEqual(publishedTiming(rows, 'a', 'b', 'tube'), { min: 360, max: 480, minutes: 420 });
  assert.deepEqual(publishedTiming(rows, 'b', 'a', 'canoe'), { min: 270, max: 450, minutes: 360 });
  assert.equal(publishedTiming(rows, 'b', 'a', 'tube'), null);
});
test('search location is approximated and monitoring discards private inputs', () => {
  assert.deepEqual(approximateLocation({ lat: 37.123456, lng: -91.987654 }), { lat: 37.12, lng: -91.99 });
  assert.deepEqual(scrubFloatSearchRequest({ url: 'https://eddy.guide/api/float-search', data: { near: { lat: 37.12, lng: -91.99 } }, headers: { cookie: 'private' } }), { url: 'https://eddy.guide/api/float-search' });
  assert.deepEqual(scrubFloatSearchBreadcrumb({ message: 'private query', data: { url: 'https://api.mapbox.com/search/geocode/v6/forward?q=Town&access_token=private', request_body: 'private', method: 'GET', status_code: 200 } }), { data: { url: 'https://api.mapbox.com/search/geocode/v6/forward', method: 'GET', status_code: 200 } });
});

test('restored result freshness expires at thirty minutes and rejects invalid or future times', () => {
  const now = Date.parse('2026-10-11T12:00:00Z');
  const result = { estimatedAt: new Date(now).toISOString() };
  assert.equal(floatSearchIsFresh(result, now + FLOAT_SEARCH_MAX_AGE_MS - 1), true);
  assert.equal(floatSearchIsFresh(result, now + FLOAT_SEARCH_MAX_AGE_MS), false);
  assert.equal(floatSearchIsFresh(result, now - 1), false);
  assert.equal(floatSearchIsFresh({ estimatedAt: 'invalid' }, now), false);
});

test('empty copy distinguishes an unfinished search and withheld times from no matches', () => {
  const result = { matches: [], alternatives: [], partial: false, evaluated: 0, failed: 0, estimatedAt: '' };
  assert.match(floatSearchEmptyMessage(result), /No routes found/);
  assert.match(floatSearchEmptyMessage({ ...result, partial: true }), /could not finish/);
  assert.match(floatSearchEmptyMessage({ ...result, emptyReason: 'too_low' }), /Water is currently too low/);
  assert.match(floatSearchEmptyMessage({ ...result, alternatives: [{} as never] }), /No exact time match/);
  assert.equal(floatSearchEmptyMessage({ ...result, unavailableReason: 'Dam releases vary.' }), 'Dam releases vary.');
});

test('recovery searches preserve preferences and explicitly change scope using public river coordinates', () => {
  const input = { river: 'huzzah', targetHours: 6, vesselType: 'canoe' as const, publicOnly: true, radiusMiles: 100 };
  const result = { matches: [], alternatives: [], partial: false, evaluated: 0, failed: 0, estimatedAt: '', emptyReason: 'too_low' as const };
  const river = { name: 'Huzzah Creek', floatAccessCoordinates: [{ lat: 37.7203, lng: -91.2048 }, { lat: 38.0292, lng: -91.2130 }] };
  const options = floatSearchRecoveryOptions(input, result, river);
  assert.deepEqual(options, [{ label: 'Search nearby rivers', location: 'Near Huzzah Creek', input: { ...input, river: undefined, near: { lat: 37.87, lng: -91.21 } } }]);
  assert.equal(input.river, 'huzzah', 'building recovery options does not mutate the selected river');
  assert.deepEqual(floatSearchRecoveryOptions(input, { ...result, partial: true }, river), []);
  assert.deepEqual(floatSearchRecoveryOptions(input, { ...result, alternatives: [{} as never] }, river), []);
  assert.deepEqual(floatSearchRecoveryOptions(input, result), [], 'missing coordinates cannot invent a nearby origin');
  const privateOptions = floatSearchRecoveryOptions(input, { ...result, emptyReason: 'public_access' }, river);
  assert.equal(privateOptions[0].input.publicOnly, false);
  assert.equal(privateOptions[0].input.river, 'huzzah');
  assert.equal(privateOptions[1].input.publicOnly, true, 'nearby recovery keeps the public-only filter');
  const nearby = { ...input, river: undefined, near: { lat: 37.87, lng: -91.21 } };
  assert.deepEqual(floatSearchRecoveryOptions(nearby, result)[0].input, { ...nearby, radiusMiles: 200 });
  assert.equal(floatSearchRecoveryOptions({ ...nearby, radiusMiles: 200 }, result)[0].input.radiusMiles, 300);
  assert.deepEqual(floatSearchRecoveryOptions({ ...nearby, radiusMiles: 300 }, result), []);
});

test('public-access recovery remains available at the maximum nearby radius', () => {
  const input = { near: { lat: 37.87, lng: -91.21 }, targetHours: 6, vesselType: 'canoe' as const, publicOnly: true, radiusMiles: 300 };
  const result = { matches: [], alternatives: [], partial: false, evaluated: 0, failed: 0, estimatedAt: '', emptyReason: 'public_access' as const };
  assert.deepEqual(floatSearchRecoveryOptions(input, result), [
    { label: 'Include other accesses', input: { ...input, publicOnly: false } },
  ]);
  assert.equal(input.publicOnly, true, 'recovery requires an explicit new search');
  const noLaunches = { ...result, emptyReason: 'no_nearby_rivers' as const };
  assert.deepEqual(floatSearchRecoveryOptions(input, noLaunches), [], 'missing launch data must not imply private-access routes exist');
  assert.match(floatSearchEmptyMessage(noLaunches), /another location/, 'the radius cap still has a useful next step');
});

test('result cards never show a straight-line distance; the ordering note appears only when location was used', async () => {
  const { floatSearchUsedProximity } = await import('@shared/float-search');
  const option = { nearbyMiles: null } as { nearbyMiles: number | null };
  assert.equal(floatSearchUsedProximity({ matches: [option as never], alternatives: [] }), false);
  assert.equal(floatSearchUsedProximity({ matches: [], alternatives: [{ nearbyMiles: 12 } as never] }), true);
  for (const file of ['src/app/find-float/FindFloatClient.tsx', 'src/app/find-float/FloatResults.tsx', '../eddy-ios/app/(tabs)/(today,map,floats,favorites,alerts)/find-float.tsx', '../eddy-ios/src/components/FloatSearchCard.tsx']) {
    assert.doesNotMatch(readFileSync(file, 'utf8'), /nearbyMiles\}?\s*mi\b|mi away/, `${file} renders a put-in distance`);
  }
});
