import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// A static guard, in the style of scripts/security/segment-cache-policy.test.ts.
//
// The behaviour under test is three Supabase round-trips deep, and nothing in
// this repo mocks the Supabase client — so a behavioural test would mean
// inventing that harness for one call site. What actually needs protecting is
// narrower and static: the generator must ask for the REACH's gauge, not the
// river's.
//
// This matters because the failure is silent and reads as plausible. With the
// section dropped, an Eddy update for the Black's tailwater is built from the
// Annapolis gauge 20 miles above Clearwater Dam: it reported "good, 280 cfs"
// for water running high at 3,310, and the model — handed those numbers next to
// a section description naming the Poplar Bluff gauge — attributed Annapolis's
// reading to Poplar Bluff by name. Nothing errors. Nothing looks wrong.

const src = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');

const generateUpdate = src('src/lib/eddy/generate-update.ts');
const getGaugeConditions = src('src/lib/gauge/get-gauge-conditions.ts');

test('the update generator asks for the reach gauge, not the river gauge', () => {
  assert.match(
    generateUpdate,
    /getGaugeConditions\(\s*target\.riverSlug\s*,\s*target\.sectionSlug\s*\)/,
    'generate-update.ts must pass target.sectionSlug to getGaugeConditions',
  );
});

test('getGaugeConditions accepts a section and resolves its gauge', () => {
  // Signature keeps the section optional, so whole-river callers (chat handlers)
  // stay source-compatible.
  assert.match(
    getGaugeConditions,
    /export async function getGaugeConditions\(\s*riverSlug: string,\s*sectionSlug\?: string \| null,/,
  );
  // And it must actually read the reach's declared gauge from migration 00204.
  assert.match(getGaugeConditions, /river_sections/);
  assert.match(getGaugeConditions, /primary_gauge_station_id/);
});

test('a reach without its own gauge still falls back to the river primary', () => {
  // Returning null instead would drop the report entirely for a curation slip.
  assert.match(getGaugeConditions, /\.eq\('is_primary', true\)/);
});

test('the trajectory is read from the same site as the reading', () => {
  // buildGaugeTrajectory(riverSlug) is is_primary-only, so keying the trend off
  // the river while the reading comes from the reach would put two different
  // rivers in one paragraph -- the tailwater's level beside the upper river's
  // 24-hour movement.
  assert.match(
    generateUpdate,
    /buildGaugeTrajectoryForSite\(\s*gaugeResult\.usgsSiteId\s*\)/,
    'generate-update.ts must address the trajectory by site, not by river slug',
  );
  assert.doesNotMatch(
    generateUpdate,
    /buildGaugeTrajectory\(\s*target\.riverSlug\s*\)/,
    'generate-update.ts must not fall back to the river-level trajectory',
  );
});
