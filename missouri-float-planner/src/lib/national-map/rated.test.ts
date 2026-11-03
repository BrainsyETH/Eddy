import assert from 'node:assert/strict';
import test from 'node:test';
import type { DecodedGaugeReading } from './frame';
import type { DecodedLine } from './geometry';
import { project } from './projection';
import { flowDirection, gaugeCondition, orientRivers, parseRatedRivers, RATED_LEGEND, ratedCounts, ratedSections } from './rated';

const NOW = Date.parse('2026-11-03T12:00:00Z');
const reading = (siteId: string, ft: number | null, cfs: number | null, ageMin = 20, suspect = false): DecodedGaugeReading => ({
  siteId, gaugeHeightFt: ft, dischargeCfs: cfs, observedAt: NOW - ageMin * 60_000, suspect, flowPercentile: 50,
});
const gauge = (site_id: string, lon: number, o: Record<string, unknown> = {}) => ({
  site_id, lon, lat: 38, is_primary: false, threshold_unit: 'ft',
  level_too_low: 1, level_low: 2, level_optimal_min: 3, level_optimal_max: 5, level_high: 7, level_dangerous: 9, flood_stage_ft: 12, ...o,
});
// A west → east river with gauges at its west end, middle and east end.
const body = {
  rivers: [
    {
      id: 'r1', slug: 'test', name: 'Test River',
      geometry: { type: 'LineString', coordinates: [[-92, 38], [-91.5, 38], [-91, 38], [-90.5, 38], [-90, 38]] },
      gauges: [gauge('00000003', -90), gauge('00000001', -92), gauge('00000002', -91)],
    },
    { id: 'r2', slug: 'nogeom', name: 'No Geometry', geometry: null, gauges: [] },
  ],
};

test('rated rivers parse from the planner dataset; a river without a line is skipped', () => {
  const rivers = parseRatedRivers(body);
  assert.equal(rivers.length, 1);
  assert.equal(rivers[0].gauges.length, 3);
  assert.equal(rivers[0].gauges[0].unit, 'ft');
  assert.deepEqual(parseRatedRivers({}), []);
});

test('a gauge is graded the planner\'s way, and only on a current reading', () => {
  const [g] = parseRatedRivers(body)[0].gauges;
  assert.equal(gaugeCondition(g, reading(g.siteId, 4, null), NOW), 'flowing', '4 ft sits in the 3–5 ft optimal band');
  assert.equal(gaugeCondition(g, reading(g.siteId, 2.5, null), NOW), 'good', 'between low and the optimal band');
  assert.equal(gaugeCondition(g, reading(g.siteId, 12.5, null), NOW), 'dangerous', 'at flood stage');
  assert.equal(gaugeCondition(g, reading(g.siteId, 1.5, null), NOW), 'low');
  assert.equal(gaugeCondition(g, reading(g.siteId, 0.5, null), NOW), 'too_low');
  assert.equal(gaugeCondition(g, reading(g.siteId, 4, null, 60 * 30), NOW), 'unknown', 'a stale reading says nothing');
  assert.equal(gaugeCondition(g, reading(g.siteId, 4, null, 20, true), NOW), 'unknown', 'a flagged reading says nothing');
  assert.equal(gaugeCondition(g, null, NOW), 'unknown');
});

test('a river splits into one section per gauge, halfway between neighbours, each in its gauge\'s colour', () => {
  const rivers = parseRatedRivers(body);
  const readings = new Map([
    ['00000001', reading('00000001', 4, null)], // flowing
    ['00000002', reading('00000002', 8, null)], // high
  ]);
  const sections = ratedSections(rivers, readings, NOW);
  assert.deepEqual(sections.map((s) => [s.siteId, s.code]), [['00000001', 'flowing'], ['00000002', 'high'], ['00000003', 'unknown']], 'ordered west to east along the river');
  const xs = sections.map((s) => [s.xy[0], s.xy[s.xy.length - 2]]);
  // Boundaries halfway between gauges: section 1 ends where section 2 begins, near −91.5° and −90.5°.
  assert.ok(Math.abs(xs[0][1] - xs[1][0]) < 1e-3 && Math.abs(xs[1][1] - xs[2][0]) < 1e-3, 'sections meet');
  assert.ok(xs[0][1] > xs[0][0] && xs[2][1] > xs[2][0], 'drawn west to east');
  const noGauges = ratedSections([{ ...rivers[0], gauges: [] }], readings, NOW);
  assert.deepEqual(noGauges.map((s) => [s.siteId, s.code]), [[null, 'unknown']], 'a river without a rated gauge is one unknown section');
});

test('the legend uses Eddy\'s own condition colours', () => {
  assert.equal(RATED_LEGEND.find((r) => r.code === 'good')?.color, '#84cc16');
  assert.equal(RATED_LEGEND[RATED_LEGEND.length - 1].label, 'No current reading');
});

test('trails claim a direction only where the national network confirms it', () => {
  const [river] = parseRatedRivers(body);
  // A national line along the same path, digitized west → east (downstream).
  const pts = [-92, -91.5, -91, -90.5, -90].map((lng) => project(lng, 38));
  const net: DecodedLine = { component: 'l48', order: 6, name: 'Test River', xy: new Float32Array(pts.flat()), length: 1, down: -1, downAt: 0 };
  assert.equal(flowDirection(river, 'l48', [net]), 1, 'stored downstream');
  const reversed = { ...river, coords: [...river.coords].reverse() };
  assert.equal(flowDirection(reversed, 'l48', [net]), -1, 'stored upstream');
  const [oriented] = orientRivers([reversed], [net]);
  assert.equal(oriented.downstream, true);
  assert.deepEqual(oriented.coords[0], [-92, 38], 'turned to run downstream');
  const [unknown] = orientRivers([river], []);
  assert.equal(unknown.downstream, false, 'no network nearby: no direction claimed, no trails');
  const sections = ratedSections([unknown], new Map(), NOW);
  assert.ok(sections.every((s) => !s.downstream));
});

test('rated counts are per gauge, not per section', () => {
  const sections = ratedSections(parseRatedRivers(body), new Map([['00000001', reading('00000001', 4, null)]]), NOW);
  assert.deepEqual(ratedCounts(sections), { flowing: 1, unknown: 2 });
});
