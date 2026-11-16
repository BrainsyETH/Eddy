import assert from 'node:assert/strict';
import test from 'node:test';
import type { CatalogStation } from './catalog';
import { buildFrame, decodeFrame, type LatestInput, type NwsInput } from './frame';
import { buildSites, type Site } from './marks';
import { floodTransitions, flowTransitions, signed, transitionSentence } from './band';

const NOW = Date.parse('2026-11-03T12:00:00Z');
const H = 3_600_000;
const PRIOR = NOW - 6 * H;

const station = (siteId: string): CatalogStation => ({ siteId, lng: -92, lat: 38, stateCode: 'MO', curated: false, name: `Gauge ${siteId}`, waterbody: null });

/** One snapshot: [siteId, NWS category or null (no NWS reading), flow percentile or null]. */
function snapshot(at: number, gauges: Array<[string, NwsInput['observed'] | null, number | null]>): Site[] {
  const latest: LatestInput[] = gauges.map(([id, , pct]) => ({
    siteId: id, dischargeCfs: 100, gaugeHeightFt: 3, readingTimestamp: new Date(at - 0.5 * H).toISOString(), suspect: false, flowPercentile: pct, fetchedAt: new Date(at).toISOString(),
  }));
  const nws: NwsInput[] = gauges
    .filter(([, cat]) => cat !== null)
    .map(([id, cat]) => ({ lid: `L${id}`, lng: -92, lat: 38, observed: cat!, observedAt: Math.floor((at - 0.5 * H) / 1000), observedValue: 3, units: 'ft', forecast: 'unknown', forecastValidAt: null, forecastIssuedAt: null, name: '' }));
  const frame = decodeFrame(buildFrame({ capturedAt: new Date(at), latest, nws, lidToSite: new Map(gauges.map(([id]) => [`L${id}`, id])), noaaOk: true }));
  return buildSites(gauges.map(([id]) => station(id)), frame);
}
const prior = (sites: Site[], noaaOk = true) => ({ sites: new Map(sites.map((s) => [s.key, s])), capturedAt: PRIOR, noaaOk });

test('a flat flood total can hide churn: entered, left and reporting changes are counted apart', () => {
  const then = snapshot(PRIOR, [
    ['10000001', 'no_flooding', 50], // will enter flood
    ['10000002', 'minor', 50], // will leave flood
    ['10000003', null, 50], // not reporting NWS then; flooding now
    ['10000004', 'major', 50], // steady major
  ]);
  const now = snapshot(NOW, [
    ['10000001', 'moderate', 50],
    ['10000002', 'action', 50],
    ['10000003', 'minor', 50],
    ['10000004', 'major', 50],
  ]);
  // Gauge 3 had no NWS point then, so the comparison needs it present to count as "newly reporting".
  const t = floodTransitions(now, prior(then), NOW, true)!;
  assert.equal(t.entered, 1);
  assert.equal(t.left, 1);
  assert.equal(t.newlyReporting, 1, 'reporting coverage, not a river newly in flood');
  assert.equal(t.delta.flooding, 1);
  assert.deepEqual([t.delta.major, t.delta.moderate, t.delta.minor, t.delta.action], [0, 1, 0, 1], 'each severity keeps its own change');
  assert.equal(t.hours, 6);
  assert.equal(transitionSentence(t, 'flood'), 'Since 6 h ago: 1 entered flood · 1 left flood · 1 newly reporting');
});

test('no comparison without an earlier snapshot, or when NOAA could not be read either time', () => {
  const now = snapshot(NOW, [['10000001', 'minor', 50]]);
  assert.equal(floodTransitions(now, null, NOW, true), null);
  assert.equal(floodTransitions(now, prior(now, false), NOW, true), null);
  assert.equal(floodTransitions(now, prior(now), NOW, false), null);
  assert.equal(transitionSentence(floodTransitions(now, prior(snapshot(PRIOR, [['10000001', 'minor', 50]])), NOW, true)!, 'flood'), 'No change since 6 h ago');
});

test('flow: moving into an unusual band apart from newly compared gauges', () => {
  const then = snapshot(PRIOR, [['10000001', null, 50], ['10000002', null, 98], ['10000003', null, null]]);
  const now = snapshot(NOW, [['10000001', null, 97], ['10000002', null, 50], ['10000003', null, 99]]);
  const t = flowTransitions(now, prior(then), NOW)!;
  assert.equal(t.entered, 1, 'normal → much higher');
  assert.equal(t.left, 1, 'much higher → normal');
  assert.equal(t.newlyReporting, 1, 'no seasonal comparison then');
  assert.equal(t.delta.compared, 1);
  assert.equal(signed(3), '+3');
  assert.equal(signed(-2), '−2');
  assert.equal(signed(0), '±0');
});
