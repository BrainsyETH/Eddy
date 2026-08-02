// shared/floatable-headline.test.ts
//
// The load-bearing assertion is the all-unknown one: a failed conditions pull
// must not be reported as "0 of 24 rivers are floatable". The rest pin the
// numerator against the same bucket the "Floatable now" chip counts, and the
// grammar.

import assert from 'node:assert/strict';
import test from 'node:test';
import { READING_LAG_NOTE, floatableHeadline } from './floatable-headline';
import { summarizeConditionCounts } from './condition-system';

test('counts flowing and good, and nothing else', () => {
  const codes = ['flowing', 'good', 'low', 'too_low', 'high', 'dangerous'];
  assert.equal(floatableHeadline(codes), '2 of 6 rivers are floatable right now');
  // Pinned to the shared bucket rather than restated, so the two cannot drift.
  assert.equal(summarizeConditionCounts(codes).floatableNow, 2);
});

test('the denominator is every river, including the ones Eddy could not read', () => {
  // A row is on screen whether or not its gauge answered, so the total has to
  // match what somebody can count with their eyes.
  assert.equal(
    floatableHeadline(['flowing', 'unknown', 'unknown']),
    '1 of 3 rivers is floatable right now',
  );
});

test('one floatable river takes a singular verb', () => {
  assert.equal(floatableHeadline(['flowing', 'low']), '1 of 2 rivers is floatable right now');
});

test('zero floatable is still a fact worth stating', () => {
  // Not null: "0 of 24" after a storm is the answer, and the most useful one
  // this line ever gives.
  assert.equal(floatableHeadline(['high', 'dangerous']), '0 of 2 rivers are floatable right now');
});

test('says nothing when every condition is unknown', () => {
  // The distinction the whole module exists for: this is a fact about the
  // request, not about the rivers.
  assert.equal(floatableHeadline(['unknown', 'unknown']), null);
  assert.equal(floatableHeadline([null, undefined]), null);
});

test('says nothing before anything has loaded', () => {
  assert.equal(floatableHeadline([]), null);
});

test('unrecognised codes count as unknown rather than throwing', () => {
  assert.equal(floatableHeadline(['flowing', 'banana']), '1 of 2 rivers is floatable right now');
});

test('the lag note states the lag and stops there', () => {
  // "Check again before getting on the water" belongs on a screen where
  // somebody is about to act on one river, not on a tally of all of them.
  assert.match(READING_LAG_NOTE, /trail the river/);
  assert.doesNotMatch(READING_LAG_NOTE, /before getting on the water/);
});
