import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import type { GaugeStation } from '@/app/api/gauges/route';
import { findRiverGroupBySlug, groupGaugesByRiver } from '@/lib/river-groups';
import type { RiverReportSection } from '@/lib/river-report-sections';
import {
  SEEDED_READING_MAX_AGE_HOURS,
  buildRiverReadingSeed,
  formatObservedAt,
  freshRiverGauges,
} from './reading-seed';

const HOUR = 3_600_000;
const NOW = Date.parse('2026-11-16T23:00:00Z');

type Threshold = NonNullable<GaugeStation['thresholds']>[number];

function threshold(riverSlug: string, isPrimary: boolean): Threshold {
  return {
    riverId: `id-${riverSlug}`, riverName: riverSlug, riverSlug, riverState: 'MO', isPrimary,
    riverMile: null, distanceFromSectionMiles: 0, thresholdUnit: 'cfs',
    levelTooLow: 300, levelLow: 500, levelOptimalMin: 700, levelOptimalMax: 1190, levelHigh: 3000, levelDangerous: 5000,
    floodStageFt: null, altLevelTooLow: null, altLevelLow: null, altLevelOptimalMin: null,
    altLevelOptimalMax: null, altLevelHigh: null, altLevelDangerous: null,
  };
}

function gauge(id: string, ageHours: number | null, rivers: [string, boolean][], values: Partial<GaugeStation> = {}): GaugeStation {
  return {
    id, usgsSiteId: `site-${id}`, provider: 'usgs', name: `Gauge ${id}`, coordinates: { lng: -91, lat: 37 }, active: true,
    gaugeHeightFt: 2.57, dischargeCfs: 756,
    readingTimestamp: ageHours === null ? null : new Date(NOW - ageHours * HOUR).toISOString(),
    // Deliberately wrong: the seed measures age itself, against its own clock.
    readingAgeHours: 99,
    readingSuspect: false, qualifierNote: null, thresholdDescriptions: null,
    thresholds: rivers.map(([slug, primary]) => threshold(slug, primary)),
    ...values,
  };
}

const options = { riverSlug: 'current', now: NOW };

test('keeps only this river’s gauges and measures age at render time', () => {
  const fresh = freshRiverGauges([
    gauge('van-buren', 0.5, [['current', true]]),
    gauge('akers', 2, [['current', false]]),
    gauge('eminence', 0.5, [['jacks-fork', true]]),
  ], options);
  assert.deepEqual(fresh?.map((entry) => entry.id), ['van-buren', 'akers']);
  assert.equal(fresh?.[0].readingAgeHours, 0.5);
  assert.equal(fresh?.[1].readingAgeHours, 2);
});

test('a reading is kept at the cutoff and dropped just past it', () => {
  assert.equal(SEEDED_READING_MAX_AGE_HOURS, 6);
  assert.ok(freshRiverGauges([gauge('van-buren', 6, [['current', true]])], options));
  assert.equal(freshRiverGauges([gauge('van-buren', 6.01, [['current', true]])], options), null);
});

test('no seed when the lead gauge has nothing fresh, whatever the others have', () => {
  assert.equal(freshRiverGauges([
    gauge('van-buren', 9, [['current', true]]),
    gauge('akers', 0.2, [['current', false]]),
  ], options), null);
  assert.equal(freshRiverGauges([gauge('van-buren', null, [['current', true]])], options), null);
  assert.equal(freshRiverGauges([
    gauge('van-buren', 0.2, [['current', true]], { gaugeHeightFt: null, dischargeCfs: null }),
  ], options), null);
  assert.equal(freshRiverGauges([gauge('eminence', 0.2, [['jacks-fork', true]])], options), null);
});

test('an old reading on another tab is removed, not carried as a number', () => {
  const fresh = freshRiverGauges([
    gauge('van-buren', 0.5, [['current', true]]),
    gauge('akers', 30, [['current', false]], { readingSuspect: true, qualifierNote: 'Ice at the gauge.' }),
  ], options);
  const akers = fresh?.find((entry) => entry.id === 'akers');
  assert.ok(akers, 'the tab itself stays');
  assert.deepEqual(
    [akers.gaugeHeightFt, akers.dischargeCfs, akers.readingTimestamp, akers.readingAgeHours, akers.qualifierNote],
    [null, null, null, null, null],
  );
  assert.equal(akers.readingSuspect, false);
});

test('the lead gauge is the one the report opens on', () => {
  // Same primary the client derives from the full /api/gauges list.
  const all = [
    gauge('akers', 0.2, [['current', false]]),
    gauge('van-buren', 0.5, [['current', true]]),
    gauge('eminence', 0.5, [['jacks-fork', true]]),
  ];
  const fresh = freshRiverGauges(all, options);
  assert.equal(
    findRiverGroupBySlug(groupGaugesByRiver(fresh ?? []), 'current')?.primaryGauge.id,
    findRiverGroupBySlug(groupGaugesByRiver(all), 'current')?.primaryGauge.id,
  );

  // A sectioned river opens on its first section, not on the primary gauge.
  const sections: RiverReportSection[] = [
    { sectionSlug: 'upper', name: 'Upper', riverType: 'spring_fed_float', gaugeStationId: 'annapolis' },
    { sectionSlug: 'lower', name: 'Lower', riverType: 'dam_tailwater', gaugeStationId: 'poplar-bluff' },
  ];
  const black = (upperAge: number, lowerAge: number) => freshRiverGauges([
    gauge('annapolis', upperAge, [['black', false]]),
    gauge('poplar-bluff', lowerAge, [['black', true]]),
  ], { riverSlug: 'black', sections, now: NOW });
  assert.ok(black(1, 30), 'fresh first section, stale primary');
  assert.equal(black(30, 1), null, 'stale first section, fresh primary');
  assert.equal(freshRiverGauges([gauge('poplar-bluff', 1, [['black', true]])], { riverSlug: 'black', sections, now: NOW }), null,
    'first section’s gauge missing');
});

test('applying the cutoff again later drops a seed that sat in a cache', () => {
  const fresh = freshRiverGauges([gauge('van-buren', 0.5, [['current', true]])], options);
  assert.ok(fresh);
  assert.ok(freshRiverGauges(fresh, { riverSlug: 'current', now: NOW + 5 * HOUR }));
  assert.equal(freshRiverGauges(fresh, { riverSlug: 'current', now: NOW + 6 * HOUR }), null);
});

test('observation time is a date in the river’s zone, never an age', () => {
  assert.equal(formatObservedAt('2026-11-16T22:30:00+00:00', 'America/Chicago'), 'Nov 16, 2026, 4:30 PM CST');
  assert.equal(formatObservedAt('2026-07-04T05:05:00Z', 'America/Chicago'), 'Jul 4, 2026, 12:05 AM CDT');
  assert.equal(formatObservedAt('not a time', 'America/Chicago'), null);
  // Plain spaces only: this string is rendered by the server and the browser.
  assert.doesNotMatch(formatObservedAt('2026-11-16T22:30:00Z', 'America/Chicago') ?? '', /[  ]/);
});

test('the seed labels every gauge that still has a reading, and no other', () => {
  const seed = buildRiverReadingSeed([
    gauge('van-buren', 0.5, [['current', true]]),
    gauge('akers', 30, [['current', false]]),
  ], { ...options, timeZone: 'America/Chicago' });
  assert.deepEqual(seed?.observedAt, { 'van-buren': 'Nov 16, 2026, 4:30 PM CST' });
  assert.equal(buildRiverReadingSeed([gauge('van-buren', 9, [['current', true]])], { ...options, timeZone: 'America/Chicago' }), null);
});

// The seed is only worth having if it reaches the HTML and is replaced by the
// same data the browser fetches. These wiring facts have no runtime to test in.
test('the river page and /api/gauges read one gauge list', () => {
  const read = (path: string) => readFileSync(path, 'utf8');
  const route = read('src/app/api/gauges/route.ts');
  const pages = read('src/lib/data/public-pages.ts');
  const page = read('src/app/rivers/[state]/[slug]/page.tsx');
  assert.match(route, /loadGaugeStations\(createAdminClient\(\), \{ liveFallback: true \}\)/);
  assert.match(pages, /loadGaugeStations\(createAdminClient\(\), \{ liveFallback: false \}\)/,
    'public HTML must not wait on a live provider');
  assert.match(page, /buildRiverReadingSeed\(gaugeStations,/);
  assert.match(page, /initialReading=\{initialReading\}/);
  // Titles and descriptions stay timeless (docs/SHARING_PREVIEWS.md).
  const metadata = page.slice(page.indexOf('export async function generateMetadata'), page.indexOf('export default async function'));
  assert.doesNotMatch(metadata, /initialReading|pageGaugeStations|cfs/);
});

test('both gauge syncs refresh the river pages after writing', () => {
  for (const path of ['src/app/api/cron/update-gauges/route.ts', 'src/app/api/cron/sync-gauge-latest/route.ts']) {
    assert.match(readFileSync(path, 'utf8'), /refreshRiverPages\(\)/, path);
  }
});
