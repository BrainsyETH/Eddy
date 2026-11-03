import assert from 'node:assert/strict';
import test from 'node:test';
import type { CatalogStation } from './catalog';
import { buildFrame, decodeFrame, type LatestInput, type NwsInput } from './frame';
import { buildSites, type Site } from './marks';
import { calmSummary, chartStages, rankStories, seriesDevelopment, storyDetails, storyLead, storyStanding, type SeriesPoint } from './stories';

const NOW = Date.parse('2026-11-02T12:00:00Z');
const H = 3_600_000;
const PRIOR = NOW - 6 * H;

const station = (siteId: string, lng: number, lat: number): CatalogStation => ({
  siteId, lng, lat, stateCode: 'MO', curated: false, name: `Gauge ${siteId}`, waterbody: 'Test River',
});
const reading = (siteId: string, at: number, o: Partial<LatestInput> = {}): LatestInput => ({
  siteId, dischargeCfs: 100, gaugeHeightFt: 5, readingTimestamp: new Date(at - 0.5 * H).toISOString(), suspect: false, flowPercentile: 50, fetchedAt: new Date(at).toISOString(), ...o,
});
const point = (lid: string, observed: NwsInput['observed'], at: number): NwsInput => ({
  lid, lng: -95, lat: 35, observed, observedAt: Math.floor((at - 0.5 * H) / 1000), observedValue: 3, units: 'ft',
  forecast: 'unknown', forecastValidAt: null, forecastIssuedAt: null, name: '',
});

/** Sites for one capture: each gauge [id, lng, lat, NWS category, stage ft]. */
function capture(at: number, gauges: Array<[string, number, number, NwsInput['observed'], number]>): Site[] {
  const catalog = gauges.map(([id, lng, lat]) => station(id, lng, lat));
  const latest = gauges.map(([id, , , , ft]) => reading(id, at, { gaugeHeightFt: ft }));
  const nws = gauges.map(([id, , , cat]) => point(`L${id}`, cat, at));
  const frame = decodeFrame(buildFrame({ capturedAt: new Date(at), latest, nws, lidToSite: new Map(gauges.map(([id]) => [`L${id}`, id])), noaaOk: true }));
  return buildSites(catalog, frame);
}
const byKey = (sites: Site[]) => new Map(sites.map((s) => [s.key, s]));

test('a new flood-category crossing outranks an unchanged, more severe gauge', () => {
  const before = capture(PRIOR, [['10000001', -110, 34, 'major', 20], ['10000002', -90, 38, 'no_flooding', 3]]);
  const now = capture(NOW, [['10000001', -110, 34, 'major', 20], ['10000002', -90, 38, 'minor', 6]]);
  const ranked = rankStories({ sites: now, prior: { sites: byKey(before), capturedAt: PRIOR }, view: 'flooding', clock: NOW, noaaOk: true, recent: [] });
  assert.equal(ranked[0].site.siteId, '10000002');
  assert.equal(storyLead(ranked[0], null, 'flooding').kicker, 'Now in');
  assert.equal(storyLead(ranked[0], null, 'flooding').status, 'Minor flooding');
  assert.equal(ranked[1].site.siteId, '10000001', 'the unchanged major flood is still a story, just not first');
});

test('a gauge just shown steps back, so one extreme reading cannot win forever', () => {
  const now = capture(NOW, [['10000001', -110, 34, 'major', 20], ['10000002', -80, 40, 'moderate', 9]]);
  const first = rankStories({ sites: now, prior: null, view: 'flooding', clock: NOW, noaaOk: true, recent: [] })[0];
  assert.equal(first.site.siteId, '10000001');
  const next = rankStories({ sites: now, prior: null, view: 'flooding', clock: NOW, noaaOk: true, recent: [first.site.key] })[0];
  assert.equal(next.site.siteId, '10000002');
});

test('nearby gauges describing the same development are one story', () => {
  const gauges: Array<[string, number, number, NwsInput['observed'], number]> = Array.from({ length: 5 }, (_, i) => [`2000000${i}`, -112 + i * 0.05, 34, 'major', 20]);
  gauges.push(['30000001', -81, 28, 'minor', 6]);
  const ranked = rankStories({ sites: capture(NOW, gauges), prior: null, view: 'flooding', clock: NOW, noaaOk: true, recent: [] });
  assert.equal(ranked.length, 2, 'five clustered gauges fold into one story, plus the distant one');
  assert.equal(ranked[0].nearby, 4);
  assert.deepEqual(storyDetails(ranked[0]), ['4 nearby gauges too']);
});

test('back below flood stage comes only from the NWS categories in both frames', () => {
  const before = capture(PRIOR, [['10000003', -95, 36, 'moderate', 14]]);
  const now = capture(NOW, [['10000003', -95, 36, 'action', 9]]);
  const [s] = rankStories({ sites: now, prior: { sites: byKey(before), capturedAt: PRIOR }, view: 'flooding', clock: NOW, noaaOk: true, recent: [] });
  assert.equal(storyLead(s, null, 'flooding').kicker, 'Back below flood stage');
  // Without a prior frame there is no claim of recovery.
  const [plain] = rankStories({ sites: now, prior: null, view: 'flooding', clock: NOW, noaaOk: true, recent: [] });
  assert.equal(storyLead(plain, null, 'flooding').kicker, null);
});

test('a measured stage change between frames is reported with its size and span', () => {
  const before = capture(PRIOR, [['10000004', -95, 36, 'minor', 10]]);
  const now = capture(NOW, [['10000004', -95, 36, 'minor', 11.3]]);
  const [s] = rankStories({ sites: now, prior: { sites: byKey(before), capturedAt: PRIOR }, view: 'flooding', clock: NOW, noaaOk: true, recent: [] });
  assert.deepEqual(storyDetails(s), ['Up 1.3 ft in 6 h']);
});

const series = (vals: number[], hours = 24): SeriesPoint[] => vals.map((v, i) => ({ t: NOW - hours * H + (i * hours * H) / (vals.length - 1), v }));

test('"Still rising" and "Crest passed" need the series to support them', () => {
  assert.equal(seriesDevelopment(series([4, 4.2, 4.5, 5, 5.6, 6.3, 7.1, 7.9, 8.6]), 'ft'), 'rising');
  assert.equal(seriesDevelopment(series([4, 5, 6.5, 8, 9.2, 9.0, 8.6, 8.1, 7.6]), 'ft'), 'crest_passed');
  assert.equal(seriesDevelopment(series([5, 5.02, 4.98, 5.01, 5.03, 4.99, 5.0, 5.02, 5.01]), 'ft'), null, 'noise is not a story');
  assert.equal(seriesDevelopment(series([4, 5, 6, 7], 3), 'ft'), null, 'too short a record says nothing');
});

test('NWS flood stages join the USGS chart only when both measure on the same datum', () => {
  const stages = { action: 15, flood: 18, moderate: 22, major: 26 };
  const [same] = capture(NOW, [['10000009', -95, 36, 'minor', 3.2]]); // NWS value 3 ft, USGS 3.2 ft
  assert.deepEqual(chartStages({ ...same, stages }), stages);
  const [offset] = capture(NOW, [['10000010', -95, 36, 'minor', 103]]); // a different datum
  assert.equal(chartStages({ ...offset, stages }), null, 'lines would sit at the wrong height');
  assert.equal(chartStages({ ...same, stages: null }), null);
  assert.equal(chartStages({ ...same, nws: null, stages }), null);
});

test('the card leads with the map\'s own mark and words; the development sits above it', () => {
  const before = capture(PRIOR, [['10000011', -90, 38, 'no_flooding', 3]]);
  const now = capture(NOW, [['10000011', -90, 38, 'moderate', 6]]);
  const [s] = rankStories({ sites: now, prior: { sites: byKey(before), capturedAt: PRIOR }, view: 'flooding', clock: NOW, noaaOk: true, recent: [] });
  const lead = storyLead(s, null, 'flooding');
  assert.equal(lead.kicker, 'Now in');
  assert.equal(lead.status, 'Moderate flooding');
  assert.equal(lead.style?.shape, 'diamond', 'the moderate-flood mark, as on the map and legend');
  assert.equal(lead.style?.color, 'flood.moderate');
  assert.deepEqual(storyDetails(s), [], 'the status is not repeated below');
  // A series development leads when there is no category change.
  const [plain] = rankStories({ sites: now, prior: null, view: 'flooding', clock: NOW, noaaOk: true, recent: [] });
  assert.equal(storyLead(plain, 'rising', 'flooding').kicker, 'Still rising');
  assert.equal(storyLead(plain, null, 'flooding').kicker, null);
});

test('the reading stands against flood stage only where the datums agree and NWS agrees', () => {
  const stages = { action: 2, flood: 2.5, moderate: 4, major: 6 };
  const [g] = capture(NOW, [['10000012', -95, 36, 'minor', 3.2]]); // NWS 3 ft, USGS 3.2 ft: same datum
  assert.deepEqual(storyStanding({ ...g, stages }, 'flooding', 'minor'), { value: '3.2 ft', relation: '0.7 ft above flood stage (2.5 ft)' });
  // NWS says below flood stage while the stored threshold says above: say nothing about it.
  assert.deepEqual(storyStanding({ ...g, stages }, 'flooding', 'below'), { value: '3.2 ft', relation: null });
  assert.deepEqual(storyStanding({ ...g, stages: null }, 'flooding', 'minor'), { value: '3.2 ft', relation: null });
});

test('a calm place says so with its counts, never a forced event', () => {
  const flood = { nwsPoints: 40, assessed: 30, major: 0, moderate: 0, minor: 0, action: 0, noThreshold: 5, notCurrent: 5 };
  const calm = calmSummary('flooding', { flow: null, flood, change: null, window: null, place: 'Missouri' });
  assert.equal(calm?.title, 'No flooding in Missouri');
  assert.match(calm!.lines[0], /All 30 NWS forecast points/);
  assert.equal(calmSummary('flooding', { flow: null, flood: { ...flood, minor: 1 }, change: null, window: null, place: null }), null, 'flooding is a story, not calm');
  const flow = { stations: 100, live: 90, compared: 80, bands: { much_lower: 0, lower: 10, normal: 60, higher: 10, much_higher: 0 }, noComparison: 10, stale: 10, dormant: 0, extremeHigh: 0 };
  const f = calmSummary('flow', { flow, flood: null, change: null, window: null, place: null });
  assert.equal(f?.title, 'Rivers near usual for the date');
  assert.equal(f?.bands?.find((b) => b.key === 'normal')?.share, 0.75);
});
