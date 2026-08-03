import assert from 'node:assert/strict';
import test from 'node:test';
import type { RiverListItem } from '../../../packages/eddy-types/index';
import {
  FEATURED_RIVER_SLUGS,
  FIRST_RUN_RIVER_COUNT,
  pickFirstRunRivers,
} from '../../../eddy-ios/src/lib/firstRunRivers';
import {
  riverDistanceLabel,
  riverMilesByGauge,
} from '../../../eddy-ios/src/lib/riverDistance';

function river(slug: string, code: string | null = 'flowing', id = slug): RiverListItem {
  return {
    id,
    slug,
    name: slug.replace(/-/g, ' '),
    accessPointCount: 4,
    state: 'MO',
    riverType: 'spring_fed_float',
    path: `/rivers/missouri/${slug}`,
    currentCondition: code
      ? {
          label: code,
          code,
          thresholdUnit: 'cfs',
          gaugeHeightFt: null,
          dischargeCfs: 200,
          readingAgeHours: 1,
          trend: null,
        }
      : null,
  } as unknown as RiverListItem;
}

/** The six named in the design, plus enough filler to test gap-filling. */
function catalog(): RiverListItem[] {
  return [
    river('meramec'),
    river('eleven-point'),
    river('current'),
    river('big-piney'),
    river('jacks-fork'),
    river('huzzah'),
    river('gasconade', 'good'),
    river('black', 'low'),
    river('bourbeuse', 'too_low'),
  ];
}

test('the featured six lead, in the order the design names them', () => {
  const picked = pickFirstRunRivers(catalog());
  assert.deepEqual(
    picked.map((r) => r.slug),
    [...FEATURED_RIVER_SLUGS],
  );
});

test('the grid is filled floatable-first when a featured river is missing', () => {
  const thin = catalog().filter((r) => r.slug !== 'huzzah' && r.slug !== 'meramec');
  const picked = pickFirstRunRivers(thin);

  assert.equal(picked.length, FIRST_RUN_RIVER_COUNT);
  // 'good' outranks 'low', which outranks 'too_low' — see floatableRank.
  assert.deepEqual(picked.slice(4).map((r) => r.slug), ['gasconade', 'black']);
});

test('a catalog smaller than the grid returns what exists rather than padding', () => {
  const picked = pickFirstRunRivers([river('current'), river('huzzah')]);
  assert.equal(picked.length, 2);
});

test('an empty catalog picks nothing rather than throwing', () => {
  assert.deepEqual(pickFirstRunRivers([]), []);
});

test('rivers with no condition still sort deterministically', () => {
  const picked = pickFirstRunRivers([river('zulu', null), river('alpha', null)]);
  assert.deepEqual(picked.map((r) => r.slug), ['alpha', 'zulu']);
});

test('duplicate rivers appear once', () => {
  const picked = pickFirstRunRivers([river('current'), river('current')]);
  assert.equal(picked.length, 1);
});

// ── With a location fix ─────────────────────────────────────────────────────
//
// Location REPLACES the featured set rather than reordering it. That is the
// picker's answer to "my river isn't here" — somebody in Springfield has no use
// for a hand centred on the Current, and the alternative was a searchable
// catalog in front of an app they have not opened yet.

test('a location fix replaces the featured set with the nearest rivers', () => {
  const distances = new Map([
    ['gasconade', 3],
    ['black', 8],
    ['bourbeuse', 11],
    ['current', 90],
    ['jacks-fork', 95],
    ['meramec', 99],
    ['huzzah', 120],
  ]);
  const picked = pickFirstRunRivers(catalog(), distances);

  assert.deepEqual(
    picked.map((r) => r.slug),
    ['gasconade', 'black', 'bourbeuse', 'current', 'jacks-fork', 'meramec'],
  );
});

test('a river with no known distance never outranks one that has a distance', () => {
  // Absent from the map means "we do not know", which is a different claim from
  // "it is far away" — so it fills the grid only after every known river.
  const picked = pickFirstRunRivers(catalog(), new Map([['bourbeuse', 40]]));
  assert.equal(picked[0]?.slug, 'bourbeuse');
  assert.equal(picked.length, FIRST_RUN_RIVER_COUNT);
});

test('an empty distance map falls back to the featured set', () => {
  const picked = pickFirstRunRivers(catalog(), new Map());
  assert.deepEqual(picked.map((r) => r.slug), [...FEATURED_RIVER_SLUGS]);
});

// ── Distance to the river's gauge ───────────────────────────────────────────

function gauge(id: string, lat: number, lng: number, links: Array<[string, boolean]>) {
  return {
    id,
    coordinates: { lat, lng },
    thresholds: links.map(([riverId, isPrimary]) => ({ riverId, isPrimary })),
  } as never;
}

test('a river is measured to its primary gauge', () => {
  const here = { lat: 37.8, lng: -91.5 };
  const miles = riverMilesByGauge([gauge('g1', 37.9, -91.5, [['r1', true]])], here);
  assert.ok((miles.get('r1') ?? 0) > 6 && (miles.get('r1') ?? 0) < 8);
});

test('a shared gauge measures the river it actually rates', () => {
  const here = { lat: 37.0, lng: -91.0 };
  const miles = riverMilesByGauge(
    [
      gauge('far', 38.0, -91.0, [['r1', true]]),
      gauge('near', 37.1, -91.0, [['r1', false]]),
    ],
    here,
  );
  // The near gauge is only a secondary association for r1, so it fills a gap
  // rather than winning outright — the primary is the point ON that river.
  assert.ok((miles.get('r1') ?? 0) > 60);
});

test('a gauge at null island contributes no distance at all', () => {
  // (0, 0) is what /api/gauges emits for an unparseable location. Measuring to
  // it would put a river in the Gulf of Guinea at the top of "nearest", so the
  // river must be ABSENT from the map rather than present with a huge number.
  const miles = riverMilesByGauge([gauge('g1', 0, 0, [['r1', true]])], { lat: 37, lng: -91 });
  assert.equal(miles.has('r1'), false);
});

test('a gauge with a non-finite coordinate contributes no distance at all', () => {
  const miles = riverMilesByGauge([gauge('g1', Number.NaN, -91, [['r1', true]])], {
    lat: 37,
    lng: -91,
  });
  assert.equal(miles.has('r1'), false);
});

test('the distance label always says it is a proxy', () => {
  // The "≈" and "to its gauge" are what make showing this legitimate at all:
  // it is a straight line to a measuring station, not a drive.
  assert.equal(riverDistanceLabel(28.4), '≈ 28 mi to its gauge');
  assert.equal(riverDistanceLabel(4.26), '≈ 4.3 mi to its gauge');
  assert.match(riverDistanceLabel(50), /^≈ /);
  assert.match(riverDistanceLabel(50), /to its gauge$/);
});
