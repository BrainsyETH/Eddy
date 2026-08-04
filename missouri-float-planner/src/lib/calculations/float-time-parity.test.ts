import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateFloatTime, DEFAULT_CANOE_SPEEDS } from './floatTime';
import { canoeHours } from '@/lib/social/post-types';

const MILES = 7.2;

// ── the divergence this file exists to pin down ──────────────────

test('the same trip gets the same answer from every surface given the same inputs', () => {
  // The regression: /api/plan fetched the daily statistics and passed
  // dischargeCfs + refCfs, while chat and social called the same function with
  // the same shared DEFAULT_CANOE_SPEEDS and passed neither. calculateFloatTime
  // degrades to the legacy band step when either is missing — silently, with a
  // plausible number — so the planner and the chat quoted different float times
  // for the same two access points and nothing anywhere reported a problem.
  const flow = { dischargeCfs: 240, refCfs: 180 };

  const plan = calculateFloatTime(MILES, DEFAULT_CANOE_SPEEDS, 'flowing', flow);
  const chat = calculateFloatTime(MILES, DEFAULT_CANOE_SPEEDS, 'flowing', flow);

  assert.notEqual(plan, null);
  assert.equal(plan!.minutes, chat!.minutes);
  assert.equal(plan!.speedMph, chat!.speedMph);
  assert.equal(plan!.model, 'flow');
});

test('omitting the flow inputs silently selects the other model', () => {
  // This is the trap, asserted so nobody has to rediscover it. Both calls are
  // well-formed and neither errors; only `model` distinguishes them.
  const withFlow = calculateFloatTime(MILES, DEFAULT_CANOE_SPEEDS, 'good', {
    dischargeCfs: 400,
    refCfs: 180,
  });
  const without = calculateFloatTime(MILES, DEFAULT_CANOE_SPEEDS, 'good');

  assert.equal(withFlow!.model, 'flow');
  assert.equal(without!.model, 'band');
  assert.notEqual(withFlow!.minutes, without!.minutes);
});

test('half the flow inputs is not enough, and falls back rather than guessing', () => {
  // A caller that has discharge but no reference flow — a gauge with no daily
  // statistics — must not be handed a ratio against an assumed Q_ref.
  assert.equal(
    calculateFloatTime(MILES, DEFAULT_CANOE_SPEEDS, 'flowing', { dischargeCfs: 240 })!.model,
    'band',
  );
  assert.equal(
    calculateFloatTime(MILES, DEFAULT_CANOE_SPEEDS, 'flowing', { refCfs: 180 })!.model,
    'band',
  );
});

// ── why social's typical figures were never actually wrong ───────

test('the two models agree exactly at typical flow', () => {
  // Arithmetic, not luck: at Q = Q_ref the flow factor is 1, so the flow model
  // returns speedNormal — exactly what bandSpeed() returns for 'flowing'. This
  // is why social's `hoursTypical` was model-independent all along, and it is
  // the reason the remaining gap is narrower than "social is wrong".
  const flowModel = calculateFloatTime(MILES, DEFAULT_CANOE_SPEEDS, 'flowing', {
    dischargeCfs: 180,
    refCfs: 180,
  });
  const bandModel = calculateFloatTime(MILES, DEFAULT_CANOE_SPEEDS, 'flowing');

  assert.equal(flowModel!.model, 'flow');
  assert.equal(bandModel!.model, 'band');
  assert.equal(flowModel!.minutes, bandModel!.minutes);
  assert.equal(flowModel!.speedMph, bandModel!.speedMph);
});

test('canoeHours at typical flow matches the planner regardless of model', () => {
  const social = canoeHours(MILES, 'flowing');
  const plan = calculateFloatTime(MILES, DEFAULT_CANOE_SPEEDS, 'flowing', {
    dischargeCfs: 180,
    refCfs: 180,
  });
  assert.equal(social, Math.round((plan!.minutes / 60) * 10) / 10);
});

test('canoeHours uses the flow model when a caller supplies flow', () => {
  // The parameter exists so the social render path can close its remaining gap
  // once RenderData carries dischargeCfs; this asserts the plumbing works today.
  const withFlow = canoeHours(MILES, 'good', { dischargeCfs: 400, refCfs: 180 });
  const without = canoeHours(MILES, 'good');
  assert.notEqual(withFlow, without);
});

// ── the guard that must never regress ────────────────────────────

test('dangerous water returns null under both models', () => {
  // floatTime.ts:145-148 and the endpoint guard at plan/route.ts:425. We never
  // print a float time next to "do not float", and adding a model must not open
  // a path around that.
  assert.equal(calculateFloatTime(MILES, DEFAULT_CANOE_SPEEDS, 'dangerous'), null);
  assert.equal(
    calculateFloatTime(MILES, DEFAULT_CANOE_SPEEDS, 'dangerous', {
      dischargeCfs: 2000,
      refCfs: 180,
    }),
    null,
  );
  assert.equal(canoeHours(MILES, 'dangerous'), 0);
});

test('the flow factor stays clamped at both extremes', () => {
  // A stuck sensor reading 20,000 cfs on a 180 cfs river must not produce a
  // two-hour float on a seven-mile stretch.
  const flood = calculateFloatTime(MILES, DEFAULT_CANOE_SPEEDS, 'high', {
    dischargeCfs: 20000,
    refCfs: 180,
  });
  const trickle = calculateFloatTime(MILES, DEFAULT_CANOE_SPEEDS, 'low', {
    dischargeCfs: 1,
    refCfs: 180,
  });

  assert.equal(flood!.speedMph <= DEFAULT_CANOE_SPEEDS.speedHighWater, true);
  assert.equal(trickle!.speedMph >= DEFAULT_CANOE_SPEEDS.speedLowWater * 0.5, true);
});
