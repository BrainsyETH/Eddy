import assert from 'node:assert/strict';
import test from 'node:test';
import type { DamSnapshot } from '@shared/dam-types';
import type { RiverListItem } from '@/types/api';
import { USACE_DAMS } from '@/lib/flow-providers/usace-registry';
import { LAKES } from './registry';
import { buildSnapshot, refreshStaleness } from '@/lib/data/dams';
import { publishedLakes } from './public-pages';
import { buildLakeSystem } from './system';
import { lakeWeatherFrom, loadLakeWeather } from './weather';
import { createBoundedReader } from './bounded-reader';

const AT = '2026-11-19T17:00:00.000Z';
const metric = (value: number, extra: Record<string, unknown> = {}) => ({ value, unit: 'cfs', at: AT, staleness: 'fresh' as const, ...extra });

function dam(id: string, metrics: DamSnapshot['metrics'], generating: boolean | null = null): DamSnapshot {
  const entry = USACE_DAMS[id];
  return { id, name: entry.name, lakeName: entry.lakeName, state: entry.state, lat: entry.lat, lon: entry.lon, hasTurbines: true, metrics, generating, schedule: [], sources: [] };
}

function river(slug: string, name: string, state: string, condition: Partial<NonNullable<RiverListItem['currentCondition']>> | null): RiverListItem {
  return {
    slug, name, state,
    currentCondition: condition && { label: 'Good', code: 'good', thresholdUnit: 'cfs', gaugeHeightFt: 3.1, dischargeCfs: 640, readingAgeHours: 1, readingTimestamp: AT, trend: null, ...condition },
  } as unknown as RiverListItem;
}

const rivers = new Map([
  ['james', river('james', 'James River', 'MO', {})],
  ['kings-river', river('kings-river', 'Kings River', 'AR', { code: 'unknown', label: 'Unknown', thresholdUnit: 'ft' })],
  ['taneycomo', river('taneycomo', 'Lake Taneycomo', 'MO', { dischargeCfs: 7200 })],
]);

test('Table Rock reads upstream to downstream: inflow, Beaver, its rivers, its own dam, then Taneycomo', () => {
  const rows = buildLakeSystem({
    lake: LAKES['table-rock'],
    dam: dam('swl-table-rock-dam', { inflow: metric(8200), release: metric(7200), generationFlow: metric(7000) }, true),
    dams: new Map([['swl-beaver-dam', dam('swl-beaver-dam', { release: metric(3900), generationFlow: metric(0) }, false)]]),
    rivers,
  });
  assert.deepEqual(rows.map((r) => `${r.stage}:${r.kind}:${r.kind === 'river' ? r.slug : r.kind === 'dam' ? r.damId : 'inflow'}`), [
    'coming_in:inflow:inflow',
    'coming_in:dam:swl-beaver-dam',
    'coming_in:river:james',
    'coming_in:river:kings-river',
    'dam:dam:swl-table-rock-dam',
    'below:river:taneycomo',
  ]);
  assert.deepEqual(rows[1], { kind: 'dam', stage: 'coming_in', damId: 'swl-beaver-dam', name: 'Beaver Dam', via: 'White River', release: { cfs: 3900, at: AT }, generation: { on: false, at: AT } });
  assert.deepEqual(rows[2], { kind: 'river', stage: 'coming_in', slug: 'james', state: 'MO', name: 'James River', condition: { code: 'good', label: 'Good' }, reading: { value: 640, unit: 'cfs', at: AT } });
  assert.deepEqual(rows[3], { kind: 'river', stage: 'coming_in', slug: 'kings-river', state: 'AR', name: 'Kings River', reading: { value: 3.1, unit: 'ft', at: AT } }, 'an unknown rating is not a rating; the reading still shows in the river\'s own unit');
  assert.deepEqual(rows[4], { kind: 'dam', stage: 'dam', damId: 'swl-table-rock-dam', name: 'Table Rock Dam', release: { cfs: 7200, at: AT }, generation: { on: true, at: AT } });
});

test('a turbine state with no turbine reading behind it, and a river reading with no time, are left unsaid', () => {
  const rows = buildLakeSystem({
    lake: LAKES['table-rock'],
    // `generating` is set but the reading it would be dated by is absent: an undated present-tense claim.
    dam: dam('swl-table-rock-dam', { release: metric(7200) }, true),
    dams: new Map(),
    rivers: new Map([['james', river('james', 'James River', 'MO', { readingTimestamp: null })], ['taneycomo', river('taneycomo', 'Lake Taneycomo', 'MO', {})]]),
  });
  assert.deepEqual(rows[0], { kind: 'river', stage: 'coming_in', slug: 'james', state: 'MO', name: 'James River' }, 'no time, no rating and no number: the row is only a door');
  assert.deepEqual(rows[1], { kind: 'dam', stage: 'dam', damId: 'swl-table-rock-dam', name: 'Table Rock Dam', release: { cfs: 7200, at: AT } });
});

test('with every reading missing, the lake still names its dam and where the release goes', () => {
  const rows = buildLakeSystem({ lake: LAKES['table-rock'], dam: null, dams: new Map(), rivers: new Map([['taneycomo', river('taneycomo', 'Lake Taneycomo', 'MO', null)]]) });
  assert.deepEqual(rows, [
    { kind: 'dam', stage: 'dam', damId: 'swl-table-rock-dam', name: 'Table Rock Dam' },
    { kind: 'river', stage: 'below', slug: 'taneycomo', state: 'MO', name: 'Lake Taneycomo' },
  ]);
  assert.deepEqual(buildLakeSystem({ lake: LAKES['table-rock'], dam: null, dams: new Map(), rivers: new Map() }).map((r) => r.stage), ['dam'], 'an inactive tailwater river gets no row and no dead link');
});

test('Truman carries a daily release, no feeders Eddy has, and releases into Lake of the Ozarks', () => {
  const rows = buildLakeSystem({
    lake: LAKES.truman,
    dam: dam('nwk-truman-dam', { release: metric(12000) }),
    dams: new Map([['ameren-bagnell-dam', dam('ameren-bagnell-dam', { poolElevation: metric(658.92, { unit: 'ft' }), release: metric(20000) })]]),
    rivers,
  });
  assert.deepEqual(rows, [
    { kind: 'dam', stage: 'dam', damId: 'nwk-truman-dam', name: 'Harry S. Truman Dam', release: { cfs: 12000, at: AT, daily: true } },
    { kind: 'dam', stage: 'below', damId: 'ameren-bagnell-dam', name: 'Bagnell Dam', lakeName: 'Lake of the Ozarks', pool: { valueFt: 658.92, at: AT } },
  ]);
});

test('every neighbour a lake names exists in the dam registry, and no lake lists itself', () => {
  for (const lake of Object.values(LAKES)) {
    const own = lake.controllingDams.map((d) => d.damId);
    for (const { damId, via } of lake.system?.upstreamDams ?? []) {
      assert.ok(USACE_DAMS[damId], `${lake.slug} names unknown upstream dam ${damId}`);
      assert.ok(!own.includes(damId) && via.length > 0);
    }
    if (lake.system?.releasesInto) {
      assert.ok(USACE_DAMS[lake.system.releasesInto]?.lakeName, `${lake.slug} releases into a dam with no lake`);
      assert.ok(!own.includes(lake.system.releasesInto));
    }
    for (const slug of lake.system?.feederRivers ?? []) assert.match(slug, /^[a-z0-9-]+$/);
  }
});

test('lake weather keeps the place with the number and drops a gust that is not one', () => {
  const base = { temp: 58, condition: 'Clouds', conditionIcon: '04d', windSpeed: 12, windDirection: 225, humidity: 60, city: 'Branson', rain1hInches: 0, rain3hInches: 0 };
  assert.deepEqual(lakeWeatherFrom({ ...base, windGust: 22, observedAt: AT }, 'Near Table Rock Dam'), {
    place: 'Near Table Rock Dam', windMph: 12, windGustMph: 22, windFrom: 'SW', tempF: 58, condition: 'Clouds', conditionIcon: '04d', observedAt: AT,
  });
  const steady = lakeWeatherFrom({ ...base, windGust: 12 }, 'Near Table Rock Dam');
  assert.equal(steady.windGustMph, undefined);
  assert.equal(steady.observedAt, undefined);
});

test('a dam snapshot names its lake only when that lake\'s page is published', () => {
  const published = new Map(publishedLakes().map((lake) => [lake.pool.damId, lake]));
  for (const entry of Object.values(USACE_DAMS)) {
    const snapshot = buildSnapshot(entry, {}, []);
    const lake = published.get(entry.id);
    // What the iOS dam screen keys its lake button on: absent means no screen to open.
    assert.deepEqual(snapshot.lake, lake ? { slug: lake.slug, name: lake.name } : undefined, entry.id);
  }
  assert.ok(published.size > 0, 'the check is vacuous with no published lake');
});

test('a stored snapshot is served with the lake gate as it stands now, not as it stood at assembly', () => {
  const tableRock = buildSnapshot(USACE_DAMS['swl-table-rock-dam'], {}, []);
  // Assembled before the lake was published: the stored row has no `lake`.
  const assembledBefore = { ...tableRock };
  delete assembledBefore.lake;
  assert.deepEqual(refreshStaleness(assembledBefore).lake, { slug: 'table-rock', name: 'Table Rock Lake' });
  // Assembled while a lake was published that no longer is: the row still names it.
  const stale = { ...buildSnapshot(USACE_DAMS['swl-bull-shoals-dam'], {}, []), lake: { slug: 'bull-shoals', name: 'Bull Shoals Lake' } };
  assert.equal('lake' in refreshStaleness(stale), false, 'an unpublished lake is never offered: the button would open a 404');
});

test('a cached wind already past the outdated line is asked for again, uncached, once', async () => {
  const NOW = Date.parse('2026-11-19T18:00:00Z');
  const weather = (hoursAgo: number) => ({ temp: 58, condition: 'Clouds', conditionIcon: '04d', windSpeed: 12, windDirection: 225, humidity: 60, city: 'Branson', rain1hInches: 0, rain3hInches: 0, observedAt: new Date(NOW - hoursAgo * 3_600_000).toISOString() });
  const calls: Array<boolean | undefined> = [];
  const fetchStaleThenFresh = async (_lat: number, _lon: number, _key: string, options?: { fresh?: boolean }) => { calls.push(options?.fresh); return weather(options?.fresh ? 0.2 : 9); };
  const result = await loadLakeWeather(LAKES['table-rock'], { apiKey: 'k', now: NOW, fetch: fetchStaleThenFresh });
  assert.deepEqual(calls, [undefined, true]);
  assert.equal(result?.observedAt, weather(0.2).observedAt, 'the reader gets the fresh observation, not last night\'s');
  assert.equal(result?.place, 'Near Table Rock Dam');

  calls.length = 0;
  await loadLakeWeather(LAKES['table-rock'], { apiKey: 'k', now: NOW, fetch: async (_a: number, _b: number, _c: string, options?: { fresh?: boolean }) => { calls.push(options?.fresh); return weather(0.5); } });
  assert.deepEqual(calls, [undefined], 'a current cached answer costs no second call');

  // A station that is itself behind: the second answer is kept and the card says outdated.
  const behind = await loadLakeWeather(LAKES['table-rock'], { apiKey: 'k', now: NOW, fetch: async () => weather(5) });
  assert.equal(behind?.observedAt, weather(5).observedAt);
  // An outage, or no key, draws no card and throws nothing.
  assert.equal(await loadLakeWeather(LAKES['table-rock'], { apiKey: 'k', now: NOW, fetch: async () => { throw new Error('down'); } }), undefined);
  assert.equal(await loadLakeWeather(LAKES['table-rock'], { apiKey: '', now: NOW, fetch: async () => weather(0) }), undefined);
});

test('a bounded reader never serves a value older than its limit, shares a read in flight, and does not cache a failure', async () => {
  let clock = 0;
  let reads = 0;
  let fail = false;
  const reader = createBoundedReader(async () => { reads += 1; if (fail) throw new Error('down'); return reads; }, 60_000, () => clock);
  assert.deepEqual(await Promise.all([reader(), reader()]), [1, 1], 'two requests arriving together share one read');
  clock = 59_999;
  assert.equal(await reader(), 1);
  clock = 60_000;
  assert.equal(await reader(), 2, 'at the limit the value is read again, not served and refreshed behind the reader');
  clock = 200_000;
  fail = true;
  await assert.rejects(reader(), /down/);
  fail = false;
  assert.equal(await reader(), 4, 'the failure was not kept; the next request reads');
});

test('the lake loader answers only for a published lake, before reading anything', async () => {
  const { loadLakePage } = await import('./page-data');
  // No database, weather key or network is configured in this suite: reaching any read would throw or hang.
  for (const slug of ['nowhere', 'bull-shoals', 'constructor', '__proto__', '']) {
    assert.equal(await loadLakePage(slug, Date.parse('2026-11-19T18:00:00Z')), null, `${slug}: what GET /api/lakes/[slug] turns into a 404`);
  }
});
