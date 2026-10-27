import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildConditionsDestinations, changeConditionsKind, conditionsParams, conditionsStates,
  featuredDestinations, matchConditionsDestination, parseConditionsState, selectConditionsDestinations,
} from './directory';
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
  const result = selectConditionsDestinations(destinations, state('q=Taneycomo'));
  assert.deepEqual(result.map(item => item.key), ['river:taneycomo', 'dam:swl-table-rock-dam']);
  assert.equal(matchConditionsDestination(result[1], 'Taneycomo')?.relatedLabel, 'Releases into Lake Taneycomo');
  assert.equal(matchConditionsDestination(result[0], 'Taneycomo')?.relatedLabel, undefined);
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
