import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateFloatTime, DEFAULT_CANOE_SPEEDS } from './floatTime';

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
