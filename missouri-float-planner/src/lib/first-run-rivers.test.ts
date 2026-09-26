import { firstRunPlaces, firstRunFavorites, visibleFirstRunPlaces, damPlaceholder } from '../../../eddy-ios/src/lib/firstRunPlaces';
import { createPreloadHandoff } from '../../../eddy-ios/src/lib/preloadHandoff';
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

// Combined onboarding keeps destination search independent of nearby suggestions.

const options = () => ({ rivers: catalog(), query: '', browseAll: false, selected: new Set<string>() });

test('first-run search finds a nonfeatured river and dams by lake name', () => {
  const riverHits = visibleFirstRunPlaces({ ...options(), query: 'bourbeuse' });
  assert.equal(riverHits.length, 1);
  assert.equal(riverHits[0].kind, 'river');
  const damHits = visibleFirstRunPlaces({ ...options(), query: 'lake of the ozarks' });
  assert.equal(damHits[0]?.key, 'dam:ameren-bagnell-dam');
  assert.equal(visibleFirstRunPlaces({ ...options(), query: 'not-a-real-place' }).length, 0);
});

test('nearby replacements retain selected dams and rivers', () => {
  const selected = new Set(['river:bourbeuse', 'dam:ameren-bagnell-dam']);
  const shown = visibleFirstRunPlaces({ ...options(), selected, damDistances: new Map([
    ['lrn-center-hill-dam', 1], ['lrn-dale-hollow-dam', 2], ['lrn-wolf-creek-dam', 3],
  ]) });
  assert.ok(shown.some(place => place.key === 'dam:lrn-center-hill-dam'));
  for (const key of selected) assert.ok(shown.some(place => place.key === key));
  assert.equal(new Set(shown.map(place => place.key)).size, shown.length);
});

test('river and dam favorites have distinct identities and preserve dam routing', () => {
  const places = firstRunPlaces([river('current', 'flowing', 'ameren-bagnell-dam')]);
  const favorites = firstRunFavorites(places, new Set(['river:ameren-bagnell-dam', 'dam:ameren-bagnell-dam']));
  assert.deepEqual(favorites.map(item => [item.kind, item.entityId, item.slug]), [
    ['river', 'ameren-bagnell-dam', 'current'], ['dam', 'ameren-bagnell-dam', ''],
  ]);
});

test('dam selection works when the river catalog is unavailable', () => {
  const shown = visibleFirstRunPlaces({ ...options(), rivers: [] });
  assert.equal(shown.length, 3);
  assert.ok(shown.every(place => place.kind === 'dam'));
});

test('onboarding preloads are shared, consumed once, and expire before stale reuse', async () => {
  let now = 100;
  let requests = 0;
  const handoff = createPreloadHandoff(() => now, 30);
  const fetcher = async () => { requests++; return ['conditions']; };
  const warm = handoff.warm('rivers', fetcher);
  assert.equal(handoff.warm('rivers', fetcher), warm);
  assert.deepEqual(await handoff.peek('rivers'), ['conditions']);
  assert.equal(handoff.take('rivers'), warm);
  assert.equal(handoff.take('rivers'), null);
  assert.equal(requests, 1);
  await handoff.warm('rivers', fetcher);
  now += 30;
  assert.equal(handoff.take('rivers'), null);
  await handoff.warm('rivers', fetcher);
  handoff.clear();
  assert.equal(handoff.peek('rivers'), null);
});

test('failed preloads are evicted and a late response cannot survive a refresh clear', async () => {
  const handoff = createPreloadHandoff();
  await assert.rejects(handoff.warm('rivers', async () => { throw new Error('offline'); }));
  assert.equal(handoff.peek('rivers'), null);
  let finish!: (value: number[]) => void;
  const pending = handoff.warm('rivers', () => new Promise<number[]>(resolve => { finish = resolve; }));
  await Promise.resolve();
  handoff.clear();
  finish([1]);
  await pending;
  assert.equal(handoff.peek('rivers'), null);
});


test('onboarding preserves known dam tailwater context and permits offline favorites', () => {
  const places = firstRunPlaces([]);
  const selected = new Set(['dam:swl-table-rock-dam']);
  const dams = [{ id: 'swl-table-rock-dam', tailwater: { riverSlug: 'taneycomo', gaugeSiteId: '07053600' } }];
  assert.equal(firstRunFavorites(places, selected, dams)[0].slug, 'taneycomo');
  assert.equal(firstRunFavorites(places, selected)[0].slug, '');
});

test('dam placeholders distinguish initial load, failure, retry, and missing observations', () => {
  assert.equal(damPlaceholder('idle'), 'Loading…');
  assert.equal(damPlaceholder('loading'), 'Loading…');
  assert.equal(damPlaceholder('error'), 'Couldn’t load readings');
  assert.equal(damPlaceholder('ready'), 'Reading unavailable');
});

test('slow preloads remain shared and receive a full freshness window after completion', async () => {
  let now = 0;
  let requests = 0;
  let finish!: (value: number[]) => void;
  const handoff = createPreloadHandoff(() => now, 30);
  const fetcher = () => { requests++; return new Promise<number[]>(resolve => { finish = resolve; }); };
  const first = handoff.warm('gauges', fetcher);
  await Promise.resolve();
  now = 100;
  assert.equal(handoff.warm('gauges', fetcher), first);
  assert.equal(requests, 1);
  finish([1]);
  await first;
  now = 129;
  // Nearby reads do not spend Today's handoff, even after the fetch settles.
  assert.equal(handoff.warm('gauges', fetcher), first);
  assert.equal(requests, 1);
  assert.equal(handoff.peek('gauges'), first);
  now = 130;
  assert.equal(handoff.take('gauges'), null);
});
