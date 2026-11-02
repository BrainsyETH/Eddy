import assert from 'node:assert/strict';
import test from 'node:test';
import type { CatalogStation } from './catalog';
import { buildFrame, decodeFrame, type LatestInput, type NwsInput } from './frame';
import { buildSites, type Site } from './marks';
import { availableWindows, changeSentence, changeStyle, classifyChange, summarizeChange, type ChangeContext, type ChangeWindow } from './change';

const NOW = Date.parse('2026-11-03T12:00:00Z');
const H = 3_600_000;

type G = { id: string; q?: number | null; ft?: number | null; suspect?: boolean; nws?: NwsInput['observed']; age?: number };

function capture(at: number, gauges: G[]): Site[] {
  const catalog: CatalogStation[] = gauges.map((g, i) => ({ siteId: g.id, lng: -90 + i * 0.5, lat: 38, stateCode: 'MO', curated: false, name: `Gauge ${g.id}`, waterbody: null }));
  const latest: LatestInput[] = gauges.map((g) => ({
    siteId: g.id, dischargeCfs: g.q === undefined ? 100 : g.q, gaugeHeightFt: g.ft === undefined ? 5 : g.ft,
    readingTimestamp: new Date(at - (g.age ?? 0.3 * H)).toISOString(), suspect: g.suspect ?? false, flowPercentile: 50, fetchedAt: new Date(at).toISOString(),
  }));
  const nws: NwsInput[] = gauges.filter((g) => g.nws).map((g) => ({
    lid: `L${g.id}`, lng: -95, lat: 35, observed: g.nws!, observedAt: Math.floor((at - 0.3 * H) / 1000), observedValue: 3, units: 'ft',
    forecast: 'unknown', forecastValidAt: null, forecastIssuedAt: null, name: '',
  }));
  const frame = decodeFrame(buildFrame({ capturedAt: new Date(at), latest, nws, lidToSite: new Map(nws.map((p) => [p.lid, p.lid.slice(1)])), noaaOk: true }));
  return buildSites(catalog, frame);
}

function compare(then: G[], now: G[], window: ChangeWindow = '24h') {
  const priorAt = NOW - (window === '24h' ? 24 : 6) * H;
  const ctx: ChangeContext = { prior: new Map(capture(priorAt, then).map((s) => [s.key, s])), priorCapturedAt: priorAt, priorNoaaOk: true, window };
  return capture(NOW, now).map((s) => classifyChange(s, ctx, NOW, true));
}

test('flood crossings come from NWS categories in both frames and win over flow', () => {
  const [up, down, same] = compare(
    [{ id: '07000001', nws: 'no_flooding', q: 100 }, { id: '07000002', nws: 'moderate', q: 900 }, { id: '07000003', nws: 'minor', q: 400 }],
    [{ id: '07000001', nws: 'minor', q: 900 }, { id: '07000002', nws: 'action', q: 300 }, { id: '07000003', nws: 'minor', q: 410 }],
  );
  assert.equal(up.cls, 'flood_up');
  assert.equal(up.floodNow, 'minor');
  assert.equal(down.cls, 'flood_down');
  assert.equal(same.cls, 'steady', 'no crossing: the flow comparison decides');
  assert.match(changeSentence(down, '24h'), /Fell from moderate flooding to action stage/);
});

test('a move within action stage and below is not a flood crossing', () => {
  const [c] = compare([{ id: '07000001', nws: 'no_flooding', q: 100 }], [{ id: '07000001', nws: 'action', q: 104 }]);
  assert.equal(c.cls, 'steady');
});

test('discharge ratios classify rising and falling, symmetric in log space', () => {
  const cls = compare(
    [{ id: '07000001', q: 100 }, { id: '07000002', q: 100 }, { id: '07000003', q: 100 }, { id: '07000004', q: 300 }, { id: '07000005', q: 400 }],
    [{ id: '07000001', q: 160 }, { id: '07000002', q: 350 }, { id: '07000003', q: 120 }, { id: '07000004', q: 150 }, { id: '07000005', q: 90 }],
  ).map((c) => c.cls);
  assert.deepEqual(cls, ['rising', 'rising_fast', 'steady', 'falling', 'falling_fast']);
});

test('a trickle is not "tripled", and an implausible jump is unverified', () => {
  const [trickle, spike] = compare([{ id: '07000001', q: 0.2 }, { id: '07000002', q: 10 }], [{ id: '07000001', q: 0.6 }, { id: '07000002', q: 900 }]);
  assert.equal(trickle.cls, 'steady');
  assert.equal(spike.cls, 'unverified');
  assert.equal(changeStyle(spike, true), null, 'the wall never shows an unverified change');
});

test('no comparison from a flagged, stale or missing earlier reading', () => {
  const cls = compare(
    [{ id: '07000001', q: 100, suspect: true }, { id: '07000002', q: 100, age: 5 * H }, { id: '07000003', q: null, ft: null }],
    [{ id: '07000001', q: 400 }, { id: '07000002', q: 400 }, { id: '07000003', q: 400 }],
  ).map((c) => c.cls);
  assert.deepEqual(cls, ['no_compare', 'no_compare', 'no_compare']);
});

test('stage-only gauges compare in feet; the 6 h window is more sensitive', () => {
  const [d24] = compare([{ id: '07000001', q: null, ft: 5 }], [{ id: '07000001', q: null, ft: 5.4 }], '24h');
  const [d6] = compare([{ id: '07000001', q: null, ft: 5 }], [{ id: '07000001', q: null, ft: 5.4 }], '6h');
  assert.equal(d24.cls, 'steady');
  assert.equal(d6.cls, 'rising');
  assert.match(changeSentence(d6, '6h'), /5 → 5.4 ft \(\+0.4 ft\) since 6 h ago/);
});

test('windows are offered only once recorded history reaches that far back', () => {
  assert.deepEqual(availableWindows(null, null), []);
  assert.deepEqual(availableWindows(NOW - 4.7 * H, NOW), []);
  assert.deepEqual(availableWindows(NOW - 6 * H, NOW), ['6h']);
  assert.deepEqual(availableWindows(NOW - 26 * H, NOW), ['6h', '24h']);
});

test('the summary counts only real comparisons as compared', () => {
  const s = summarizeChange(compare([{ id: '07000001', q: 100 }, { id: '07000002', q: 100, suspect: true }], [{ id: '07000001', q: 400 }, { id: '07000002', q: 100 }]));
  assert.equal(s.compared, 1);
  assert.equal(s.counts.rising_fast, 1);
  assert.equal(s.counts.no_compare, 1);
});

test('a crossing takes the colour of the highest flood category involved', () => {
  const [up, down] = compare(
    [{ id: '07000001', nws: 'no_flooding' }, { id: '07000002', nws: 'moderate' }],
    [{ id: '07000001', nws: 'major' }, { id: '07000002', nws: 'no_flooding' }],
  );
  assert.equal(changeStyle(up)!.color, 'flood.major');
  assert.equal(changeStyle(down)!.color, 'flood.moderate', 'fell FROM moderate: red, never the falling-river tone');
  assert.equal(changeStyle(down)!.shape, 'down');
});
