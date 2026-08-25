// Guards the two derivations a River Visual photo carries that nothing else in
// the app can re-check later: which way the river was going, and which side of
// the gauge the photo was taken on.
//
// Both fail SILENTLY and PLAUSIBLY when wrong — a reversed relation labels every
// photo backwards and still renders a confident sentence, and a trend measured
// forward in time describes water the photographer never saw. Neither shows up
// as an error anywhere.

import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  deriveRiverVisualGauge,
  GAUGE_AT_THRESHOLD_MILES,
  LIVE_READING_WINDOW_MS,
  resolveGaugeRelation,
  resolveReadingSource,
} from './gauge-derivation';
import { classifyTrend, TREND_FAST_PCT, TREND_STEADY_PCT } from '@shared/gauge-trend';

test('a photo further down the river than its gauge reads as downstream', () => {
  // snap_to_river: mile 0 is the headwaters and grows downstream, so the larger
  // mile is the lower one. This is the assertion that catches a sign flip.
  const result = resolveGaugeRelation(24.5, 18.0);
  assert.equal(result?.relation, 'downstream');
  assert.equal(result?.offsetMiles, 6.5);
});

test('a photo above its gauge reads as upstream', () => {
  const result = resolveGaugeRelation(12.0, 30.25);
  assert.equal(result?.relation, 'upstream');
  assert.equal(result?.offsetMiles, 18.25);
});

test('a photo within the threshold is "at" the gauge, in either direction', () => {
  const below = resolveGaugeRelation(10.0 + GAUGE_AT_THRESHOLD_MILES / 2, 10.0);
  const above = resolveGaugeRelation(10.0 - GAUGE_AT_THRESHOLD_MILES / 2, 10.0);
  assert.equal(below?.relation, 'at');
  assert.equal(above?.relation, 'at');
});

test('exactly at the threshold is a direction, not "at"', () => {
  const result = resolveGaugeRelation(10 + GAUGE_AT_THRESHOLD_MILES, 10);
  assert.equal(result?.relation, 'downstream');
});

test('a missing mile on either side yields no relation rather than a guess', () => {
  // A river without a curated gauge mile must print nothing, not "0 mi at".
  assert.equal(resolveGaugeRelation(null, 12), null);
  assert.equal(resolveGaugeRelation(12, null), null);
  assert.equal(resolveGaugeRelation(undefined, undefined), null);
  assert.equal(resolveGaugeRelation(NaN, 12), null);
});

test('a submitter reading is always labelled manual, whatever its age', () => {
  const now = Date.now();
  assert.equal(resolveReadingSource('manual', 'manual', null, now), 'manual');
  assert.equal(resolveReadingSource('manual', 'manual', new Date(now), now), 'manual');
  assert.equal(
    resolveReadingSource('manual', 'manual', new Date(now - 5 * 365 * 24 * 3600_000), now),
    'manual',
  );
});

test('a client reading keeps the provenance the client declared', () => {
  // The regression this pins: the website posts AUTO-POPULATED stage and flow
  // with readingSource live|historical. Labelling those 'manual' tells a
  // moderator a submitter read them off a staff gauge. Nobody did.
  const now = Date.now();
  assert.equal(resolveReadingSource('client', 'live', null, now), 'live');
  assert.equal(
    resolveReadingSource('client', 'historical', new Date(now - 400 * 24 * 3600_000), now),
    'historical',
  );
});

test('no reading means no source, not a plausible-looking one', () => {
  // USGS answering with nothing used to leave a row reading "Live reading at
  // submit" beside two empty number fields.
  const now = Date.now();
  assert.equal(resolveReadingSource('none', null, null, now), null);
  assert.equal(resolveReadingSource('none', 'live', new Date(now), now), null);
  assert.equal(resolveReadingSource('none', 'manual', null, now), null);
});

test('a photo with no capture time is filed against the live reading', () => {
  const now = Date.now();
  assert.equal(resolveReadingSource('derived', null, null, now), 'live');
});

test('capture time decides live vs historical at the window boundary', () => {
  const now = Date.now();
  const justInside = new Date(now - LIVE_READING_WINDOW_MS + 60_000);
  const justOutside = new Date(now - LIVE_READING_WINDOW_MS - 60_000);
  assert.equal(resolveReadingSource('derived', null, justInside, now), 'live');
  assert.equal(resolveReadingSource('derived', null, justOutside, now), 'historical');
});

test('trend classification splits rising, falling and steady on percent change', () => {
  // Percent, not absolute — the same rule has to serve 3 ft and 900 cfs.
  assert.equal(classifyTrend(0.5, 10).direction, 'rising');
  assert.equal(classifyTrend(-0.5, 10).direction, 'falling');
  assert.equal(classifyTrend(TREND_STEADY_PCT * 10 * 0.9, 10).direction, 'steady');
  assert.equal(classifyTrend(TREND_FAST_PCT * 10, 10).qualifier, 'fast');
  assert.equal(classifyTrend(TREND_STEADY_PCT * 10 * 1.1, 10).qualifier, 'slowly');
});

test('a zero reading is steady, not a division blow-up', () => {
  const result = classifyTrend(0, 0);
  assert.equal(result.direction, 'steady');
  assert.ok(Number.isFinite(result.qualifier === null ? 0 : 1));
});

test('a hung upstream cannot take the submission down with it', async () => {
  // The failure this guards is not USGS returning an error — that is caught —
  // but USGS never answering. Unbounded, that becomes a platform timeout on
  // POST /api/reports, and the submitter loses an already-uploaded photo over a
  // reading the report did not need.
  const neverResolves = {
    rpc: () => new Promise(() => {}),
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: () => new Promise(() => {}) }),
          maybeSingle: () => new Promise(() => {}),
        }),
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  const started = Date.now();
  const result = await deriveRiverVisualGauge(
    neverResolves,
    {
      riverId: '00000000-0000-0000-0000-000000000000',
      latitude: 37.4,
      longitude: -91.5,
      capturedAt: null,
      providedGaugeHeightFt: 2.75,
      declaredReadingSource: 'manual',
    },
    150,
  );

  assert.ok(Date.now() - started < 3_000, 'the derivation must give up on its own');
  // What the submitter told us survives the giveup — nothing is invented.
  assert.equal(result.gaugeHeightFt, 2.75);
  assert.equal(result.readingSource, 'manual');
  assert.equal(result.trend, null);
  assert.equal(result.gaugeRelation, null);
  assert.equal(result.readingObservedAt, null);
});

test('giving up does not relabel a website reading as the submitter’s own', async () => {
  const neverResolves = {
    rpc: () => new Promise(() => {}),
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: () => new Promise(() => {}) }),
          maybeSingle: () => new Promise(() => {}),
        }),
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  // Exactly what RiverVisualSubmitForm posts: both numbers, auto-populated,
  // declared live.
  const result = await deriveRiverVisualGauge(
    neverResolves,
    {
      riverId: '00000000-0000-0000-0000-000000000000',
      latitude: 37.4,
      longitude: -91.5,
      capturedAt: null,
      providedGaugeHeightFt: 2.75,
      providedDischargeCfs: 310,
      declaredReadingSource: 'live',
    },
    150,
  );

  assert.equal(result.readingSource, 'live', 'an auto-populated reading is not manual');
  assert.equal(result.gaugeHeightFt, 2.75);
  assert.equal(result.dischargeCfs, 310);
  // No USGS observation backs these numbers on this path, so none is claimed.
  assert.equal(result.readingObservedAt, null);
});

test('a submission with nothing to store names no reading source', async () => {
  const neverResolves = {
    rpc: () => new Promise(() => {}),
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({ maybeSingle: () => new Promise(() => {}) }),
          maybeSingle: () => new Promise(() => {}),
        }),
      }),
    }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  // The iOS shape: no gauge fields at all. With the lookup timed out there is
  // no reading, so the row must not claim one was taken.
  const result = await deriveRiverVisualGauge(
    neverResolves,
    {
      riverId: '00000000-0000-0000-0000-000000000000',
      latitude: 37.4,
      longitude: -91.5,
      capturedAt: new Date('2024-06-01T15:00:00Z'),
    },
    150,
  );

  assert.equal(result.gaugeHeightFt, null);
  assert.equal(result.dischargeCfs, null);
  assert.equal(result.readingSource, null);
});

// ── Static guards ─────────────────────────────────────────────────────────
// The behaviour below is three Supabase round-trips deep and nothing in this
// repo mocks the Supabase client (see reach-gauge-wiring.test.ts), so what gets
// protected is the wiring rather than the result.

const src = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

test('the reports route derives gauge context instead of trusting the client', () => {
  const route = src('src/app/api/reports/route.ts');
  assert.match(
    route,
    /deriveRiverVisualGauge\(/,
    'POST /api/reports must derive the gauge context — iOS sends none',
  );
});

test('the route hands the declared provenance to the derivation', () => {
  const route = src('src/app/api/reports/route.ts');
  // Without this the derivation cannot tell an auto-populated website reading
  // from one a submitter typed, and labels both manual.
  assert.match(route, /declaredReadingSource: readingSource \?\? null/);
});

test('the route leaves reading_source unset when no reading was obtained', () => {
  const route = src('src/app/api/reports/route.ts');
  assert.match(route, /if \(derived\.readingSource\) baseData\.reading_source =/);
});

test('only a declared manual reading outranks the server', () => {
  const lib = src('src/lib/reports/gauge-derivation.ts');
  assert.match(
    lib,
    /declaredManual = input\.declaredReadingSource === 'manual'/,
    'presence of a number must not be read as a submitter claim',
  );
});

test('the derivation asks for the REACH gauge, not the river primary', () => {
  const lib = src('src/lib/reports/gauge-derivation.ts');
  assert.match(
    lib,
    /get_river_condition_segment/,
    'a photo must be filed against the gauge the rest of the app names for that spot',
  );
  assert.match(lib, /snap_to_river/, 'the photo needs its own river mile to place it');
});

test('the iOS sheet no longer asserts a provenance it cannot know', () => {
  const sheet = readFileSync(
    join(process.cwd(), '../eddy-ios/src/components/PhotoSubmitSheet.tsx'),
    'utf8',
  );
  assert.doesNotMatch(
    sheet,
    /readingSource: manual \? 'manual' : photo\.capturedAt \? 'historical' : 'live'/,
    "the phone cannot claim 'historical' — only the server performs that lookup",
  );
  assert.match(sheet, /readingSource: 'manual' as const/);
});

test('the trend and relation columns the derivation writes actually exist', () => {
  const migration = src(
    'supabase/migrations/20260817210000_community_report_gauge_context.sql',
  );
  for (const column of [
    'gauge_trend',
    'gauge_trend_delta',
    'gauge_trend_window_hours',
    'gauge_trend_unit',
    'gauge_relation',
    'gauge_offset_miles',
    'reading_observed_at',
  ]) {
    assert.match(migration, new RegExp(`ADD COLUMN IF NOT EXISTS ${column}\\b`));
  }
  // The CHECK values must match what the derivation can emit, or every insert
  // carrying a trend fails at the database with a constraint violation.
  assert.match(migration, /IN \('rising', 'falling', 'steady'\)/);
  assert.match(migration, /IN \('upstream', 'downstream', 'at'\)/);
});
