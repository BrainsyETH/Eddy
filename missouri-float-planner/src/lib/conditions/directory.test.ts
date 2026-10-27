import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildConditionsDestinations, changeConditionsKind, conditionsParams, conditionsStates,
  featuredDestinations, matchConditionsDestination, parseConditionsState, selectConditionsDestinations,
  FEATURED_DESTINATIONS, DAM_DISCOVERY_ORDER,
} from './directory';
import { conditionsDamCatalogue } from './dam-catalogue';
import { USACE_DAMS } from '@/lib/flow-providers/usace-registry';
import riverConfig from '../../../scripts/config/nhd-rivers.json';
import { groupGaugesByRiver } from '@/lib/river-groups';
import type { GaugeStation } from '@/app/api/gauges/route';
import type { RiverListItem } from '@/types/api';
import type { DamSnapshot } from '@shared/dam-types';

const river = (slug: string, name: string, state = 'MO'): RiverListItem => ({
  id: slug, slug, name, state, path: `/rivers/${state === 'MO' ? 'missouri' : 'arkansas'}/${slug}`,
  lengthMiles: 100, description: null, difficultyRating: 'Class I', region: 'Ozarks',
  riverType: 'spring_fed_float', accessPointCount: 5,
  currentCondition: { code: 'good', label: 'Good', thresholdUnit: 'cfs', dischargeCfs: 400, gaugeHeightFt: 3, readingAgeHours: 1, trend: null },
});
const dam = (id: string, name: string, lakeName: string, state: string, lat = 36, lon = -93): DamSnapshot => ({
  id, name, lakeName, state, lat, lon, hasTurbines: true, generating: null, metrics: {}, schedule: [], sources: [],
});
const rivers = [river('current', 'Current River'), river('buffalo', 'Buffalo River', 'AR'), river('taneycomo', 'Lake Taneycomo')];
const dams = [
  dam('swl-clearwater-dam', 'Clearwater Dam', 'Clearwater Lake', 'MO'),
  dam('swl-table-rock-dam', 'Table Rock Dam', 'Table Rock Lake', 'MO'),
  dam('swl-bull-shoals-dam', 'Bull Shoals Dam', 'Bull Shoals Lake', 'AR'),
  dam('ameren-bagnell-dam', 'Bagnell Dam', 'Lake of the Ozarks', 'MO'),
  dam('swt-tenkiller-dam', 'Tenkiller Ferry Dam', 'Tenkiller Ferry Lake', 'OK', 35, -95),
  dam('swl-ozark-dam', 'Ozark Lock & Dam', 'Ozark Lake', 'AR'),
];
const destinations = buildConditionsDestinations(rivers, dams);
const state = (query = '', kind: 'all' | 'rivers' | 'dams' = 'all') => parseConditionsState(new URLSearchParams(query), kind);

test('editorial destination IDs exist in the dam registry and river import catalogue', () => {
  const keys = new Set([
    ...Object.values(USACE_DAMS).map(item => `dam:${item.id}`),
    ...riverConfig.rivers.map(item => `river:${item.slug}`),
  ]);
  for (const key of [...FEATURED_DESTINATIONS, ...DAM_DISCOVERY_ORDER.map(id => `dam:${id}`)]) assert.ok(keys.has(key), key);
});

test('a partial stored catalogue keeps individual missing readings without declaring a global outage', () => {
  const reading = { ...dams[1], generating: false, metrics: { release: { value: 200, unit: 'cfs' as const, at: '2026-10-27T12:00:00Z', staleness: 'fresh' as const } } };
  const partial = conditionsDamCatalogue([reading]);
  assert.equal(partial.damsUnavailable, false);
  assert.equal(partial.dams.length, Object.keys(USACE_DAMS).length);
  assert.equal(partial.dams.find(item => item.id === reading.id), reading);
  const missing = partial.dams.find(item => item.id === 'swl-bull-shoals-dam')!;
  assert.deepEqual(missing.metrics, {});
  assert.equal(missing.generating, null);
  assert.equal(conditionsDamCatalogue([]).damsUnavailable, true);
  assert.equal(conditionsDamCatalogue([{ ...reading, id: 'retired-id' }]).damsUnavailable, true);
});

test('a related gauge match explains why the river appears below a direct dam match', () => {
  const white = river('white', 'White River', 'AR');
  const gauge: GaugeStation = {
    id: 'gauge', usgsSiteId: '07054501', name: 'White River below Bull Shoals Dam', active: true,
    coordinates: { lat: 36.3, lng: -92.6 }, gaugeHeightFt: null, dischargeCfs: null,
    readingTimestamp: null, readingAgeHours: null, readingSuspect: false, qualifierNote: null, thresholdDescriptions: null,
    thresholds: [{ riverId: white.id, riverName: white.name, riverSlug: white.slug, isPrimary: true,
      riverState: 'AR', riverMile: null, distanceFromSectionMiles: null,
      thresholdUnit: 'cfs', levelTooLow: 50, levelLow: 100, levelOptimalMin: 200, levelOptimalMax: 800, levelHigh: 1000, levelDangerous: 2000,
      floodStageFt: null, altLevelTooLow: null, altLevelLow: null, altLevelOptimalMin: null, altLevelOptimalMax: null, altLevelHigh: null, altLevelDangerous: null }],
  };
  const items = buildConditionsDestinations([white], dams, groupGaugesByRiver([gauge]));
  const matches = selectConditionsDestinations(items, state('q=Bull+Shoals'));
  assert.deepEqual(matches.map(item => item.key), ['dam:swl-bull-shoals-dam', 'river:white']);
  assert.equal(matchConditionsDestination(matches[1], 'Bull Shoals')?.relatedLabel, 'Gauge: White River below Bull Shoals Dam');
});

test('legacy river filters select Rivers while explicit category always wins', () => {
  for (const filter of ['condition=good', 'floatable=1', 'diff=beginner', 'len=medium', 'type=flatwater', 'sort=length_desc']) {
    assert.equal(state(filter).kind, 'rivers');
    const explicit = state(`kind=dams&${filter}`);
    assert.equal(explicit.kind, 'dams');
    assert.equal(explicit.condition, 'all');
    assert.equal(explicit.floatable, false);
    assert.equal(explicit.diff, 'all');
    assert.equal(explicit.len, 'all');
    assert.equal(explicit.type, 'all');
    assert.equal(explicit.sort, 'featured');
    assert.equal(state(`kind=all&${filter}`).kind, 'all');
  }
  assert.equal(state('floatable=0&type=all').kind, 'all');
  assert.equal(state('', 'dams').kind, 'dams');
  assert.equal(state('kind=all', 'dams').kind, 'all');
  assert.equal(state('state=all').state, 'all');
});

test('URL round-trip preserves filters, sort and unrelated parameters without leaking incompatible filters', () => {
  const previous = new URLSearchParams('campaign=test&diff=advanced&type=flatwater');
  const value = state('kind=dams&q=Rock&state=MO&sort=name');
  const params = conditionsParams(value, previous);
  assert.deepEqual(parseConditionsState(params), value);
  assert.equal(params.get('campaign'), 'test');
  assert.equal(params.has('diff'), false);
  assert.equal(params.has('type'), false);
  assert.equal(params.has('lat'), false);
});

test('state options follow the category catalogue, and Oklahoma on All only returns dams', () => {
  assert.deepEqual(conditionsStates(destinations, 'rivers'), ['AR', 'MO']);
  assert.deepEqual(conditionsStates(destinations, 'all'), ['AR', 'MO', 'OK']);
  const result = selectConditionsDestinations(destinations, state('state=OK'));
  assert.equal(result.length, 1);
  assert.equal(result[0].kind, 'dams');
  const switched = changeConditionsKind(state('state=OK&q=ferry&sort=name'), 'rivers', destinations);
  assert.equal(switched.state, 'all');
  assert.equal(switched.q, 'ferry');
  assert.equal(switched.sort, 'name');
  assert.equal(changeConditionsKind(state('state=MO'), 'dams', destinations).state, 'MO');
});

test('featured destinations are the curated two dams and two rivers, across states', () => {
  assert.deepEqual(featuredDestinations(destinations).map(item => item.key), [
    'dam:swl-table-rock-dam', 'dam:swl-bull-shoals-dam', 'river:current', 'river:buffalo',
  ]);
  const missouri = selectConditionsDestinations(destinations, state('state=MO'));
  assert.deepEqual(featuredDestinations(missouri).map(item => item.key), ['dam:swl-table-rock-dam', 'river:current']);
  const ordered = selectConditionsDestinations(destinations, state('kind=dams'));
  assert.deepEqual(ordered.slice(0, 3).map(item => item.name), ['Table Rock Dam', 'Bull Shoals Dam', 'Bagnell Dam']);
  assert.equal(ordered.at(-1)?.name, 'Ozark Lock & Dam');
});

test('dam and lake names match one destination, case and punctuation are normalized', () => {
  for (const q of ['Bagnell Dam', 'Lake of the Ozarks', '  LAKE   OF THE OZARKS  ', 'LOTO']) {
    const result = selectConditionsDestinations(destinations, state(`q=${encodeURIComponent(q)}`));
    assert.equal(result.length, 1);
    assert.equal(result[0].key, 'dam:ameren-bagnell-dam');
  }
  assert.equal(selectConditionsDestinations(destinations, state('q=bull+ar'))[0].name, 'Bull Shoals Dam');
  assert.equal(selectConditionsDestinations(destinations, state('q=Oklahoma'))[0].name, 'Tenkiller Ferry Dam');
});

test('direct Taneycomo name contains ranks ahead of Table Rock as a related destination', () => {
  for (const query of ['Taneycomo', 'Lake Taneycomo']) {
    const result = selectConditionsDestinations(destinations, state(`q=${encodeURIComponent(query)}`));
    assert.deepEqual(result.map(item => item.key), ['river:taneycomo', 'dam:swl-table-rock-dam']);
    assert.equal(matchConditionsDestination(result[1], query)?.relatedLabel, 'Releases into Lake Taneycomo');
    assert.equal(matchConditionsDestination(result[0], query)?.relatedLabel, undefined);
  }
});

test('shared matching tiers favor exact, prefix, alias, name contains, then related', () => {
  const base = destinations[0];
  const items = [
    { ...base, key: 'related', names: ['Elsewhere'], related: [{ term: 'Rock', label: 'Related' }] },
    { ...base, key: 'contains', names: ['Table Rock'] },
    { ...base, key: 'alias', names: ['Other'], aliases: ['Rock'] },
    { ...base, key: 'prefix', names: ['Rock River'] },
    { ...base, key: 'exact', names: ['Rock'] },
  ];
  assert.deepEqual(selectConditionsDestinations(items, state('q=rock&sort=name')).map(item => item.key), ['exact', 'prefix', 'alias', 'contains', 'related']);
});

test('A–Z and nearest do not pin featured destinations; missing distances sort last', () => {
  const alphabetical = selectConditionsDestinations(destinations, state('sort=name'));
  assert.equal(alphabetical[0].name, 'Bagnell Dam');
  const nearest = selectConditionsDestinations(destinations, state('sort=nearest'), { lat: 35.01, lng: -95 });
  assert.equal(nearest[0].name, 'Tenkiller Ferry Dam');
  assert.equal(nearest.at(-1)?.kind, 'rivers');
  assert.equal(selectConditionsDestinations(destinations, state('sort=nearest'))[0].name, 'Table Rock Dam');
});

test('river-only predicates never hide dams in an explicit All or Dams view', () => {
  assert.equal(selectConditionsDestinations(destinations, state('kind=dams&diff=advanced')).length, dams.length);
  assert.equal(selectConditionsDestinations(destinations, state('kind=all&condition=dangerous')).length, destinations.length);
  assert.equal(selectConditionsDestinations(destinations, state('kind=rivers&condition=dangerous')).length, 0);
  assert.equal(selectConditionsDestinations(destinations, state('kind=rivers&floatable=1')).length, rivers.length);
});

test('a dam with no readings remains searchable without invented measurements', () => {
  const result = selectConditionsDestinations(destinations, state('q=Bull+Shoals'))[0];
  assert.equal(result.kind, 'dams');
  if (result.kind === 'dams') assert.deepEqual(result.dam.metrics, {});
});
