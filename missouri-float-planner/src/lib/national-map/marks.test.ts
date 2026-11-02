import assert from 'node:assert/strict';
import test from 'node:test';
import type { CatalogStation } from './catalog';
import { buildFrame, decodeFrame, type LatestInput, type NwsInput } from './frame';
import { FLOW_BAND_SYSTEM } from '@shared/flow-band';
import { PALETTES, wallPalette, withFlowColors } from './theme';
import {
  buildSites,
  classifyFlood,
  classifyFlow,
  classifySites,
  curateHighlights,
  EXTREME_HIGH,
  floodStyle,
  flowStyle,
  HIGHLIGHT_SEPARATION,
  wallStyle,
  type FloodClass,
  type FlowClass,
  viewLiveState,
  summarizeFlood,
  summarizeFlow,
  type Site,
} from './marks';

const NOW = Date.parse('2026-11-02T05:15:00Z');
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();
const H = 3_600_000;

const station = (siteId: string, lng = -90, lat = 38): CatalogStation => ({
  siteId, lng, lat, stateCode: 'MO', curated: false, name: `Gauge ${siteId}`, waterbody: 'Test River',
});

const reading = (siteId: string, o: Partial<LatestInput> = {}): LatestInput => ({
  siteId, dischargeCfs: 100, gaugeHeightFt: 2, readingTimestamp: iso(H), suspect: false, flowPercentile: 50, fetchedAt: iso(0), ...o,
});

const point = (lid: string, o: Partial<NwsInput> = {}): NwsInput => ({
  lid, lng: -95, lat: 35, observed: 'no_flooding', observedAt: Math.floor((NOW - H) / 1000), observedValue: 3, units: 'ft',
  forecast: 'unknown', forecastValidAt: null, forecastIssuedAt: null, name: `Point ${lid}`, ...o,
});

function world(latest: LatestInput[], nws: NwsInput[], crosswalk: Array<[string, string]> = [], noaaOk = true) {
  const catalog = latest.map((r, i) => station(r.siteId, -90 + i * 0.01, 38));
  const frame = decodeFrame(buildFrame({ capturedAt: new Date(NOW), latest, nws, lidToSite: new Map(crosswalk), noaaOk }));
  return buildSites(catalog, frame);
}

const byKey = (sites: Site[], key: string) => sites.find((s) => s.key === key)!;

test('flow: stale, suspect, silent and uncompared readings never look normal', () => {
  const sites = world(
    [
      reading('00000001'),
      reading('00000002', { readingTimestamp: iso(8 * H) }),
      reading('00000003', { suspect: true }),
      reading('00000004', { readingTimestamp: iso(40 * 24 * H) }),
      reading('00000005', { flowPercentile: null }),
      reading('00000006', { flowPercentile: 95 }),
      reading('00000007', { flowPercentile: 5 }),
    ],
    [],
  );
  const c = (id: string) => classifyFlow(byKey(sites, `usgs:${id}`), NOW);
  assert.equal(c('00000001'), 'normal');
  assert.equal(c('00000002'), 'stale');
  assert.equal(c('00000003'), 'stale', 'a USGS-flagged reading gets no band');
  assert.equal(c('00000004'), 'dormant');
  assert.equal(c('00000005'), 'no_comparison', 'no percentile is not "normal"');
  assert.equal(c('00000006'), 'much_higher');
  assert.equal(c('00000007'), 'much_lower');
});

test('a reading ages against the wall clock, so an old snapshot goes neutral on its own', () => {
  const [site] = world([reading('00000001')], []);
  assert.equal(classifyFlow(site, NOW), 'normal');
  assert.equal(classifyFlow(site, NOW + 7 * H), 'stale');
});

test('flooding: action is not flooding, an undefined threshold is not "no flooding"', () => {
  const sites = world(
    [reading('00000001'), reading('00000002'), reading('00000003')],
    [
      point('AAAA1', { observed: 'major' }),
      point('BBBB1', { observed: 'action' }),
      point('CCCC1', { observed: 'not_defined' }),
      point('DDDD1', { observed: 'minor', observedAt: Math.floor((NOW - 9 * H) / 1000) }),
      point('EEEE1', { observed: 'out_of_service' }),
    ],
    [['AAAA1', '00000001'], ['BBBB1', '00000002']],
  );
  assert.equal(sites.filter((s) => s.kind === 'usgs').length, 3);
  assert.equal(sites.filter((s) => s.kind === 'nws').length, 3, 'matched points are not drawn twice');
  assert.equal(classifyFlood(byKey(sites, 'usgs:00000001'), NOW, true), 'major');
  assert.equal(classifyFlood(byKey(sites, 'usgs:00000002'), NOW, true), 'action');
  assert.equal(classifyFlood(byKey(sites, 'usgs:00000003'), NOW, true), 'no_nws');
  assert.equal(classifyFlood(byKey(sites, 'nws:CCCC1'), NOW, true), 'no_threshold');
  assert.equal(classifyFlood(byKey(sites, 'nws:DDDD1'), NOW, true), 'not_current', 'an old minor observation is not current flooding');
  assert.equal(classifyFlood(byKey(sites, 'nws:EEEE1'), NOW, true), 'not_current');

  const summary = summarizeFlood(sites, NOW, true);
  assert.deepEqual(
    { major: summary.major, minor: summary.minor, action: summary.action, noThreshold: summary.noThreshold, notCurrent: summary.notCurrent, assessed: summary.assessed },
    { major: 1, minor: 0, action: 1, noThreshold: 1, notCurrent: 2, assessed: 2 },
  );
  assert.deepEqual(curateHighlights(sites, 'flooding', NOW, true).map((s) => s.key), ['usgs:00000001']);
});

test('a NOAA outage hides flood categories instead of reporting none', () => {
  const sites = world([reading('00000001')], [point('AAAA1', { observed: 'major' })], [['AAAA1', '00000001']], false);
  assert.equal(classifyFlood(sites[0], NOW, false), 'no_nws');
  assert.equal(summarizeFlood(sites, NOW, false).major, 0);
});

test('the most severe mark always draws last, however dense its neighbourhood', () => {
  const latest = Array.from({ length: 200 }, (_, i) => reading(String(10000000 + i).padStart(8, '0')));
  const sites = world(latest, [point('AAAA1', { observed: 'major' })], [['AAAA1', latest[57].siteId]]);
  const order = classifySites(sites, 'flooding', NOW, true);
  assert.equal(sites[order[order.length - 1].index].siteId, latest[57].siteId);
  assert.equal(order.length, 200, 'nothing is aggregated away');
});

test('flow summary denominators count only current, comparable gauges', () => {
  const sites = world(
    [reading('00000001'), reading('00000002', { flowPercentile: null }), reading('00000003', { readingTimestamp: iso(30 * H) })],
    [point('ZZZZ1')],
  );
  const s = summarizeFlow(sites, NOW);
  assert.deepEqual({ stations: s.stations, live: s.live, compared: s.compared, stale: s.stale }, { stations: 3, live: 2, compared: 1, stale: 1 });
});

test('highlights are spread across the country, not one basin told six times', () => {
  // Ten much-higher gauges packed into one spot, plus three far-apart ones.
  const latest: LatestInput[] = [];
  for (let i = 0; i < 10; i++) latest.push(reading(String(20000000 + i), { flowPercentile: 99 }));
  latest.push(reading('30000001', { flowPercentile: 96 }));
  latest.push(reading('30000002', { flowPercentile: 4 }));
  latest.push(reading('30000003', { flowPercentile: 92 }));
  const catalog = latest.map((r, i) =>
    i < 10 ? station(r.siteId, -90 + i * 0.01, 38) : station(r.siteId, [-120, -75, -105][i - 10], [45, 42, 33][i - 10]),
  );
  const frame = decodeFrame(buildFrame({ capturedAt: new Date(NOW), latest, nws: [], lidToSite: new Map(), noaaOk: true }));
  const sites = buildSites(catalog, frame);
  const picks = curateHighlights(sites, 'flow', NOW, true, 6);
  const clustered = picks.filter((s) => s.siteId!.startsWith('2'));
  assert.equal(clustered.length, 1, 'one representative from the packed cluster');
  assert.ok(picks.some((s) => (s.reading?.flowPercentile ?? 50) < 50), 'the dry end is represented');
  for (let i = 0; i < picks.length; i++) {
    for (let j = i + 1; j < picks.length; j++) {
      const [a, b] = [picks[i], picks[j]];
      if (a.component === b.component) assert.ok(Math.hypot(a.x - b.x, a.y - b.y) >= HIGHLIGHT_SEPARATION);
    }
  }
});

test('liveness is judged for the view on screen', () => {
  const base = { capturedAt: NOW - 10 * 60_000, clock: NOW, refreshFailed: false, noaaOk: true, flowLive: 900, floodAssessed: 700 };
  assert.equal(viewLiveState({ ...base, view: 'flow' }), 'live');
  assert.equal(viewLiveState({ ...base, view: 'flooding' }), 'live');
  // The reported case: fresh USGS readings, failed NOAA capture.
  assert.equal(viewLiveState({ ...base, view: 'flooding', noaaOk: false }), 'flood_unavailable');
  assert.equal(viewLiveState({ ...base, view: 'flow', noaaOk: false }), 'live', 'Flow does not depend on NOAA');
  assert.equal(viewLiveState({ ...base, view: 'flooding', floodAssessed: 0 }), 'flood_not_current');
  assert.equal(viewLiveState({ ...base, view: 'flow', flowLive: 0 }), 'no_current_readings');
  assert.equal(viewLiveState({ ...base, view: 'flow', capturedAt: NOW - 3 * H }), 'snapshot_old');
  assert.equal(viewLiveState({ ...base, view: 'flow', refreshFailed: true }), 'refresh_failed');
  assert.equal(viewLiveState({ ...base, view: 'flow', capturedAt: null }), 'no_frame');
});

test('the rarest readings are drawn larger than the rest of their band', () => {
  const sites = world([reading('00000001', { flowPercentile: EXTREME_HIGH }), reading('00000002', { flowPercentile: 92 })], []);
  const out = classifySites(sites, 'flow', NOW, true);
  const extreme = out.find((c) => sites[c.index].siteId === '00000001')!;
  const plain = out.find((c) => sites[c.index].siteId === '00000002')!;
  assert.equal(extreme.cls, plain.cls, 'same band, same colour');
  assert.ok(extreme.style.radius > plain.style.radius);
  assert.ok(extreme.style.salience > plain.style.salience, 'drawn above the band');
});

test('the wall drops unknown and unavailable data; Explore keeps all of it', () => {
  const sites = world(
    [
      reading('00000001'),
      reading('00000002', { readingTimestamp: iso(8 * H) }),
      reading('00000003', { flowPercentile: null }),
      reading('00000004', { flowPercentile: 99 }),
    ],
    [point('AAAA1', { observed: 'major' }), point('BBBB1', { observed: 'not_defined' }), point('CCCC1', { observed: 'out_of_service' })],
    [['AAAA1', '00000001']],
  );
  const flowExplore = classifySites(sites, 'flow', NOW, true).map((c) => c.cls).sort();
  const flowWall = classifySites(sites, 'flow', NOW, true, true).map((c) => c.cls).sort();
  assert.deepEqual(flowExplore, ['much_higher', 'no_comparison', 'normal', 'stale']);
  assert.deepEqual(flowWall, ['much_higher', 'normal']);
  const floodWall = classifySites(sites, 'flooding', NOW, true, true).map((c) => c.cls);
  assert.ok(!floodWall.some((c) => c === 'no_threshold' || c === 'not_current' || c === 'no_nws'));
  assert.ok(floodWall.includes('major'));
});

test('wall styles change hierarchy, never meaning', () => {
  const flow: FlowClass[] = ['much_higher', 'higher', 'normal', 'lower', 'much_lower'];
  for (const c of flow) {
    const w = wallStyle('flow', c)!;
    assert.equal(w.color, flowStyle(c)!.color, `${c}: same colour as the legend`);
    assert.equal(w.shape, flowStyle(c)!.shape, `${c}: same shape as the legend`);
  }
  const flood: FloodClass[] = ['major', 'moderate', 'minor', 'action', 'below'];
  for (const c of flood) {
    const w = wallStyle('flooding', c)!;
    assert.equal(w.color, floodStyle(c)!.color);
    assert.equal(w.shape, floodStyle(c)!.shape);
  }
  // Flooding is bigger on the wall; routine is quieter; action is below minor.
  for (const c of ['major', 'moderate', 'minor'] as FloodClass[]) assert.ok(wallStyle('flooding', c)!.radius > floodStyle(c)!.radius);
  assert.ok((wallStyle('flooding', 'below')!.alpha ?? 1) < 1 && (wallStyle('flow', 'normal')!.alpha ?? 1) < 1);
  assert.ok(wallStyle('flooding', 'action')!.radius < wallStyle('flooding', 'minor')!.radius / 1.5);
  assert.equal(wallStyle('flooding', 'action')!.ring, false, 'action stage never pulses');
});

test('unavailable data is drawn as a cross, distinct from "no comparison"', () => {
  assert.equal(flowStyle('stale')!.shape, 'cross');
  assert.equal(floodStyle('not_current')!.shape, 'cross');
  assert.equal(flowStyle('no_comparison')!.shape, 'ring');
});

test('the vivid Flow colours are opt-in, keep the bands, and never touch flooding', () => {
  for (const theme of ['light', 'dark'] as const) {
    const eddy = PALETTES[theme];
    // The default set is the canonical flow-band system, unchanged.
    for (const b of Object.keys(FLOW_BAND_SYSTEM) as Array<keyof typeof FLOW_BAND_SYSTEM>) assert.equal(eddy.flow[b], FLOW_BAND_SYSTEM[b].solid);
    assert.equal(eddy.flowExtremeHigh, eddy.flow.much_higher, 'Eddy colours: size alone marks the rarest highs');
    assert.equal(withFlowColors(eddy, theme, 'eddy'), eddy);
    const vivid = withFlowColors(wallPalette(theme), theme, 'vivid');
    assert.deepEqual(Object.keys(vivid.flow).sort(), Object.keys(eddy.flow).sort(), 'same five bands');
    assert.notEqual(vivid.flowExtremeHigh, vivid.flow.much_higher, 'the rarest highs get their own colour');
    assert.deepEqual(vivid.flood, wallPalette(theme).flood, 'NWS categories keep NWS colours');
    assert.ok(!vivid.backed.some((k) => k.startsWith('flow')), 'vivid flow bands need no backing chip');
  }
});
