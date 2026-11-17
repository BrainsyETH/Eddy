// /api/conditions/[riverId] grades a live USGS reading itself when the
// database has no verdict. That path built its ladder by hand with no flood
// stage. These tests run the row it now loads through the grader it now calls.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { gradeReading } from '@/lib/conditions';
import { LIVE_FALLBACK_LINK_SELECT, loadLiveFallbackLink } from './live-fallback';

type Client = Parameters<typeof loadLiveFallbackLink>[0];

/** A river_gauges query double that records what was asked of it. */
function client(row: unknown) {
  const calls = { table: '', select: '', eq: [] as Array<[string, unknown]> };
  const q = {
    select(columns: string) { calls.select = columns; return q; },
    eq(column: string, value: unknown) { calls.eq.push([column, value]); return q; },
    limit: () => q,
    maybeSingle: async () => ({ data: row, error: null }),
  };
  const supabase = { from(table: string) { calls.table = table; return q; } } as unknown as Client;
  return { supabase, calls };
}

const BOAZ = {
  level_too_low: 80, level_low: null, level_optimal_min: 150, level_optimal_max: null,
  level_high: null, level_dangerous: null, threshold_unit: 'cfs', flood_stage_ft: '10.00',
  gauge_stations: { id: 'boaz', name: 'James River near Boaz, MO', usgs_site_id: '07052250', nwps_flood_stage_ft: null },
};

test('the fallback pairing carries both sources of the flood stage', () => {
  assert.match(LIVE_FALLBACK_LINK_SELECT, /\bflood_stage_ft\b/);
  assert.match(LIVE_FALLBACK_LINK_SELECT, /gauge_stations!inner \([^)]*nwps_flood_stage_ft/);
});

test('a selected gauge is looked up by site on this river; no site means the primary', async () => {
  const bySite = client(BOAZ);
  const found = await loadLiveFallbackLink(bySite.supabase, 'james-id', '07052250');
  assert.equal(bySite.calls.table, 'river_gauges');
  assert.deepEqual(bySite.calls.eq, [['river_id', 'james-id'], ['gauge_stations.usgs_site_id', '07052250']]);
  assert.equal(found?.usgsSiteId, '07052250');
  assert.equal(found?.gaugeName, 'James River near Boaz, MO');

  const primary = client(BOAZ);
  await loadLiveFallbackLink(primary.supabase, 'james-id', null);
  assert.deepEqual(primary.calls.eq, [['river_id', 'james-id'], ['is_primary', true]]);

  assert.equal(await loadLiveFallbackLink(client(null).supabase, 'james-id', null), null);
});

test('a live reading above flood stage is dangerous, not "Good - Floatable"', async () => {
  // James near Boaz at June 2026's peak. The hand-built ladder said good.
  const { supabase } = client(BOAZ);
  const found = await loadLiveFallbackLink(supabase, 'james-id', '07052250');
  assert.ok(found);
  const graded = gradeReading(found.link, 14.58, 16600);
  assert.equal(graded.code, 'dangerous');
  assert.doesNotMatch(graded.label, /Good/);
  // Below flood stage the ladder still answers.
  assert.equal(gradeReading(found.link, 3.1, 400).code, 'good');
});

test('a station-only flood stage reaches the fallback too, and an unrated gauge below it stays unknown', async () => {
  const calicoRock = {
    level_too_low: null, level_low: null, level_optimal_min: null, level_optimal_max: null,
    level_high: null, level_dangerous: null, threshold_unit: 'cfs', flood_stage_ft: null,
    gauge_stations: [{ id: 'clr', name: 'White River at Calico Rock, AR', usgs_site_id: '07060500', nwps_flood_stage_ft: '19.00' }],
  };
  const found = await loadLiveFallbackLink(client(calicoRock).supabase, 'white-id', '07060500');
  assert.ok(found);
  assert.equal(found.usgsSiteId, '07060500');
  assert.equal(gradeReading(found.link, 20, 60000).code, 'dangerous');
  assert.equal(gradeReading(found.link, 4.1, 4800).code, 'unknown');
});

test('the conditions route grades its live fallback through gradeReading, with no ladder built by hand', () => {
  const route = readFileSync('src/app/api/conditions/[riverId]/route.ts', 'utf8');
  assert.match(route, /loadLiveFallbackLink\(supabase, riverId, selectedGaugeUsgsSiteId\)/);
  assert.match(route, /gradeReading\(selectedLink, usgsReading\.gaugeHeightFt, usgsReading\.dischargeCfs\)/);
  assert.doesNotMatch(route, /\bcomputeCondition\(/);
});
