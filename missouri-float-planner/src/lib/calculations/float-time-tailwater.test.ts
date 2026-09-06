import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calculateFloatTime, floatTimeWithholding, DEFAULT_CANOE_SPEEDS } from './floatTime';

const MILES = 7.2;

// The float-time model takes ONE discharge and holds it for the whole trip.
// Below a hydro dam that assumption is false: Bull Shoals moves from a
// minimum-flow ~800 cfs to over 20,000 cfs in about an hour. A tailwater is
// therefore estimated only from a LIVE release, flagged releaseDependent so
// the card carries the caveat, and refused outright without flow inputs.
// These tests pin both halves.

test('a dam tailwater with a live release gets an estimate, flagged release-dependent', () => {
  for (const condition of ['too_low', 'low', 'good', 'flowing', 'high'] as const) {
    const result = calculateFloatTime(MILES, DEFAULT_CANOE_SPEEDS, condition, {
      dischargeCfs: 800,
      refCfs: 4000,
      riverType: 'dam_tailwater',
    });
    assert.ok(result, `expected an estimate on a tailwater at condition "${condition}"`);
    assert.equal(result.releaseDependent, true);
    assert.ok(result.minutes > 0);
  }
});

test('a rain-fed river is never marked release-dependent', () => {
  const result = calculateFloatTime(MILES, DEFAULT_CANOE_SPEEDS, 'flowing', {
    dischargeCfs: 240,
    refCfs: 180,
    riverType: 'spring_fed_float',
  });
  assert.equal(result?.releaseDependent, false);
});

test('a tailwater without flow inputs is still refused', () => {
  // The band-step fallback is the path a caller lands on when it forgets to
  // pass discharge. It must refuse, or "forgot the flow args" becomes "quoted a
  // tailwater a float time" — and there is no release to estimate from anyway.
  assert.equal(
    calculateFloatTime(MILES, DEFAULT_CANOE_SPEEDS, 'flowing', { riverType: 'dam_tailwater' }),
    null,
  );
  // Half the inputs is no inputs.
  assert.equal(
    calculateFloatTime(MILES, DEFAULT_CANOE_SPEEDS, 'flowing', {
      dischargeCfs: 800,
      riverType: 'dam_tailwater',
    }),
    null,
  );
});

test('every other river type still gets an estimate', () => {
  // The guard is narrow on purpose: it is about the water being regulated, not
  // about the river being unusual.
  for (const riverType of ['spring_fed_float', 'rain_flashy', 'snowmelt', 'flatwater'] as const) {
    const result = calculateFloatTime(MILES, DEFAULT_CANOE_SPEEDS, 'flowing', {
      dischargeCfs: 240,
      refCfs: 180,
      riverType,
    });
    assert.ok(result, `expected an estimate for ${riverType}`);
    assert.ok(result.minutes > 0);
  }
});

test('omitting riverType is unchanged from before the guard existed', () => {
  // Most callers do not pass it. Those must behave exactly as they did, so the
  // guard cannot become a silent behaviour change for rain-fed rivers.
  const withOut = calculateFloatTime(MILES, DEFAULT_CANOE_SPEEDS, 'flowing', {
    dischargeCfs: 240,
    refCfs: 180,
  });
  const withNull = calculateFloatTime(MILES, DEFAULT_CANOE_SPEEDS, 'flowing', {
    dischargeCfs: 240,
    refCfs: 180,
    riverType: null,
  });
  assert.ok(withOut);
  assert.deepEqual(withOut, withNull);
});

test('dangerous water still refuses even on a river type that would otherwise pass', () => {
  assert.equal(
    calculateFloatTime(MILES, DEFAULT_CANOE_SPEEDS, 'dangerous', {
      dischargeCfs: 240,
      refCfs: 180,
      riverType: 'spring_fed_float',
    }),
    null,
  );
});

// ── The reason, not just the refusal ────────────────────────────────────────

test('withholding names which of the two silences applies', () => {
  assert.equal(floatTimeWithholding('flowing', 'dam_tailwater'), 'regulated');
  assert.equal(floatTimeWithholding('flowing', 'dam_tailwater', { hasFlowInputs: false }), 'regulated');
  // With a live release there is something to estimate from, and no silence.
  assert.equal(floatTimeWithholding('flowing', 'dam_tailwater', { hasFlowInputs: true }), null);
  assert.equal(floatTimeWithholding('dangerous', 'spring_fed_float'), 'dangerous');
  assert.equal(floatTimeWithholding('flowing', 'spring_fed_float'), null);
  assert.equal(floatTimeWithholding('flowing', null), null);
  assert.equal(floatTimeWithholding('flowing'), null);
});

test('dangerous outranks regulated when both apply, with or without flow', () => {
  // A tailwater in flood is dangerous first. "The release might change" is the
  // wrong thing to tell someone standing next to water that should not be
  // floated at all — and a live release does not make flood water floatable.
  assert.equal(floatTimeWithholding('dangerous', 'dam_tailwater'), 'dangerous');
  assert.equal(floatTimeWithholding('dangerous', 'dam_tailwater', { hasFlowInputs: true }), 'dangerous');
});

// ── The fishing pace ─────────────────────────────────────────────────────────

test('the fishing pace starts where the relaxed float ends and runs to 2.5× moving time', () => {
  const result = calculateFloatTime(MILES, DEFAULT_CANOE_SPEEDS, 'flowing', {
    dischargeCfs: 240,
    refCfs: 180,
  });
  assert.ok(result);
  assert.equal(result.fishingMinMinutes, result.maxMinutes);
  assert.equal(result.fishingMaxMinutes, Math.round(result.movingMinutes * 2.5));
  assert.ok(result.fishingMaxMinutes > result.maxMinutes);
});

test('low water is disclosed as an adjustment, not hidden in a longer number', () => {
  const low = calculateFloatTime(MILES, DEFAULT_CANOE_SPEEDS, 'too_low');
  const fine = calculateFloatTime(MILES, DEFAULT_CANOE_SPEEDS, 'flowing');
  assert.ok(low && fine);
  assert.equal(low.lowWaterAdjusted, true);
  assert.equal(fine.lowWaterAdjusted, false);
  assert.ok(low.minutes > fine.minutes);
});

// ── Static ratchets on the call sites ───────────────────────────────────────
//
// These exist because the first version of this guard was tested ONLY as a
// pure function. Five tests passed while both call sites walked straight past
// it: /api/plan served published float_segments times without ever consulting
// the river type, and both sites resolved that type through a cached lookup
// behind a swallowed catch, so the refusal failed OPEN. A unit test of a
// predicate cannot see any of that. These read the sources.

const PLAN_ROUTE = readFileSync(
  join(process.cwd(), 'src/app/api/plan/route.ts'),
  'utf-8',
);
const CHAT_HANDLERS = readFileSync(
  join(process.cwd(), 'src/lib/chat/tool-handlers.ts'),
  'utf-8',
);

test('both call sites read river_type from the query that must already succeed', () => {
  // Not from getRiverContext: it is a 5-minute TTL cache, both sites wrapped
  // it in .catch(() => null), and `undefined` reads as "not a tailwater".
  assert.match(
    PLAN_ROUTE,
    /\.select\('id, name, slug, river_type'\)/,
    '/api/plan must select river_type on its rivers query',
  );
  assert.match(
    CHAT_HANDLERS,
    /\.select\('id, name, river_type'\)/,
    'chat get_float_route must select river_type on its rivers query',
  );
});

test('the published float_segments branch is gated, not just the estimate branch', () => {
  // The regression: `if (!isDangerous && segmentTime …)`. A tailwater with a
  // stored time served it straight past the refusal, permanently, because that
  // branch never calls calculateFloatTime at all.
  assert.match(
    PLAN_ROUTE,
    /if \(!withholdFloatTime && segmentTime/,
    'the known-times branch must be gated on withholdFloatTime',
  );
  assert.match(
    PLAN_ROUTE,
    /\} else if \(!withholdFloatTime\)/,
    'the estimate branch must be gated on the same value',
  );
  assert.doesNotMatch(
    PLAN_ROUTE,
    /if \(!isDangerous && segmentTime/,
    'the known-times branch must not be gated on danger alone',
  );
});

test('neither call site derives the withholding decision from the context cache', () => {
  for (const [name, src] of [
    ['/api/plan', PLAN_ROUTE],
    ['chat', CHAT_HANDLERS],
  ] as const) {
    assert.doesNotMatch(
      src,
      /riverType: riverCtx\?\.riverType/,
      `${name} must not take riverType from the cached context`,
    );
  }
});

test('chat does not report every withheld float time as dangerous water', () => {
  // It did. A 185 cfs catch-and-release tailwater was told "conditions are
  // dangerous", which is false and spends the credibility of the one sentence
  // that has to mean something when a river really is in flood.
  assert.match(
    CHAT_HANDLERS,
    /withholdReason === 'regulated'/,
    'chat must branch its note on the withholding reason',
  );
  assert.match(
    CHAT_HANDLERS,
    /dam-controlled river/,
    'chat must have distinct copy for regulated water',
  );
});

test('the reason travels with the absence, and the iOS plan card branches on it', () => {
  // Withholding was computed and enforced but never SAID: the response carried
  // one null for two silences, and the iOS card worded both as flood water —
  // "Wait for it to drop", on a tailwater at ordinary generation, where
  // dropping is not the problem and waiting will not help.
  assert.match(
    PLAN_ROUTE,
    /floatTimeWithheldReason: withholdReason/,
    '/api/plan must put the withholding reason on the wire',
  );

  // And the client actually reads it — a field nothing consumes is the same
  // wrong sentence with better provenance. Both the card and the share line.
  const planResult = readFileSync(
    join(process.cwd(), '../eddy-ios/src/components/PlanResult.tsx'),
    'utf-8',
  );
  assert.match(planResult, /floatTimeWithheldReason === 'regulated'/);
  assert.match(
    planResult,
    /Dam releases can change mid-float/,
    'the regulated branch must have its own sentence, not the flood one',
  );

  // The share line moved to src/lib/planCopy.ts so the sheet, the saved-float
  // screen and the card word one float time identically; the regulated branch
  // lives there now, and both share surfaces have to be reading it.
  const planCopy = readFileSync(join(process.cwd(), '../eddy-ios/src/lib/planCopy.ts'), 'utf-8');
  assert.match(planCopy, /floatTimeWithheldReason === 'regulated'/);
  assert.match(planCopy, /time depends on dam releases/);
  for (const surface of ['src/components/PlanSheet.tsx', 'app/float/[shortCode].tsx']) {
    const source = readFileSync(join(process.cwd(), '../eddy-ios', surface), 'utf-8');
    assert.match(source, /planShareSummary/, `${surface} must share through planCopy`);
  }
});

// ── The reach, not the river; the caveat, not a claim ───────────────────────
//
// Migration 00204 lets a river_sections row override rivers.river_type, and
// the Black is the live case: the reach below Clearwater Dam is a tailwater
// while the row says spring-fed. Both callers read the row, so the one
// tailwater with active access points got neither the refusal nor the caveat.
// And the caveat itself said "Built from the current dam release" about a
// number that read a downstream gauge, or — on the published-time branch — no
// flow at all. These ratchets pin the resolution and the wording.

test('both call sites resolve the river type at the put-in reach, with the row as fallback', () => {
  for (const [name, src] of [
    ['/api/plan', PLAN_ROUTE],
    ['chat', CHAT_HANDLERS],
  ] as const) {
    assert.match(
      src,
      /reachRiverTypeAtMile/,
      `${name} must resolve the reach type at the put-in mile`,
    );
    // The river row feeds the resolver as its fallback and nothing else: no
    // direct hand-off of `river.river_type` into the float-time decision.
    assert.doesNotMatch(
      src,
      /floatTimeWithholding\(\s*[^)]*river\.river_type/,
      `${name} must not pass river.river_type straight into floatTimeWithholding`,
    );
    assert.doesNotMatch(
      src,
      /riverType: river\.river_type/,
      `${name} must not pass river.river_type straight into calculateFloatTime`,
    );
  }
  assert.doesNotMatch(
    PLAN_ROUTE,
    /releaseDependent = river\.river_type/,
    '/api/plan must derive releaseDependent from the reach-resolved type',
  );
});

test('usedLiveDischarge means the flow model ran, not that a discharge was in hand', () => {
  // The published-time branch scales an outfitter figure by condition band and
  // never reads the flow; the card must not say "in today's water" under it.
  assert.match(PLAN_ROUTE, /usedLiveDischarge: floatTimeResult\.model === 'flow'/);
  assert.doesNotMatch(PLAN_ROUTE, /usedLiveDischarge: dischargeCfs != null/);
  // And the caveat can name the station it read.
  assert.match(PLAN_ROUTE, /gaugeName: condition\?\.gauge_name/);
});

test('every surface that prints a tailwater time prints the shared caveat', () => {
  // Chat: the note field carries the caveat when a time IS quoted, so the model
  // cannot hand an angler a number without the sentence that qualifies it.
  assert.match(CHAT_HANDLERS, /releaseCaveat\(/, 'chat must build the release caveat');
  assert.match(CHAT_HANDLERS, /from '@shared\/float-time-caveat'/);

  // iOS: the card no longer carries its own sentence.
  const planResult = readFileSync(
    join(process.cwd(), '../eddy-ios/src/components/PlanResult.tsx'),
    'utf-8',
  );
  assert.doesNotMatch(planResult, /Built from the current dam release/);
  assert.doesNotMatch(planResult, /Valid only at the current dam release/);
  assert.match(planResult, /floatTimeReleaseCaveat/);
  const planCopy = readFileSync(join(process.cwd(), '../eddy-ios/src/lib/planCopy.ts'), 'utf-8');
  assert.match(planCopy, /from '@eddy\/conditions\/float-time-caveat'/);

  // Web: the three plan surfaces that print the time mount the caveat. Before
  // this they printed the newly-unlocked tailwater number with nothing beside it.
  for (const surface of [
    'src/components/plan/FloatPlanCard.tsx',
    'src/components/plan/PlanSummary.tsx',
    'src/components/plan/PlanSidebar.tsx',
  ]) {
    const source = readFileSync(join(process.cwd(), surface), 'utf-8');
    assert.match(source, /<FloatTimeCaveat /, `${surface} must mount FloatTimeCaveat`);
  }
  const caveat = readFileSync(join(process.cwd(), 'src/components/plan/FloatTimeCaveat.tsx'), 'utf-8');
  assert.match(caveat, /from '@shared\/float-time-caveat'/);
  assert.match(caveat, /floatTimeWithheldReason === 'regulated'/);
});
