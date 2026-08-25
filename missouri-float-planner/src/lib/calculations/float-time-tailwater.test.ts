import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { calculateFloatTime, floatTimeWithholding, DEFAULT_CANOE_SPEEDS } from './floatTime';

const MILES = 7.2;

// The float-time model takes ONE discharge and holds it for the whole trip.
// Below a hydro dam that assumption is false: Bull Shoals moves from a
// minimum-flow ~800 cfs to over 20,000 cfs in about an hour. These tests pin
// the refusal so a later change cannot quietly start quoting a number again.

test('a dam tailwater gets no float time at any condition', () => {
  for (const condition of ['too_low', 'low', 'good', 'flowing', 'high'] as const) {
    assert.equal(
      calculateFloatTime(MILES, DEFAULT_CANOE_SPEEDS, condition, {
        dischargeCfs: 800,
        refCfs: 4000,
        riverType: 'dam_tailwater',
      }),
      null,
      `expected no estimate on a tailwater at condition "${condition}"`,
    );
  }
});

test('the refusal does not depend on having flow inputs', () => {
  // The band-step fallback is the path a caller lands on when it forgets to
  // pass discharge. It must refuse too, or "forgot the flow args" becomes
  // "quoted a tailwater a float time".
  assert.equal(
    calculateFloatTime(MILES, DEFAULT_CANOE_SPEEDS, 'flowing', { riverType: 'dam_tailwater' }),
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
  assert.equal(floatTimeWithholding('dangerous', 'spring_fed_float'), 'dangerous');
  assert.equal(floatTimeWithholding('flowing', 'spring_fed_float'), null);
  assert.equal(floatTimeWithholding('flowing', null), null);
  assert.equal(floatTimeWithholding('flowing'), null);
});

test('dangerous outranks regulated when both apply', () => {
  // A tailwater in flood is dangerous first. "The release might change" is the
  // wrong thing to tell someone standing next to water that should not be
  // floated at all.
  assert.equal(floatTimeWithholding('dangerous', 'dam_tailwater'), 'dangerous');
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
