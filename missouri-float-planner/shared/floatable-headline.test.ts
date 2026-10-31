// shared/floatable-headline.test.ts
//
// The load-bearing assertion is the all-unknown one: a failed conditions pull
// must not be reported as "0 of 24 rivers are floatable". The rest pin the
// numerator against the same bucket the "Floatable now" chip counts, and the
// grammar.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  READING_LAG_NOTE,
  floatableHeadline,
  floatableHeadlineParts,
  tailwaterNote,
} from './floatable-headline';
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

test('dam tailwaters leave the tally and get their own caveat', () => {
  // A tailwater is unrated by design, so counting it put a permanent
  // "not floatable" in the denominator. The note keeps every row accounted for.
  const parts = floatableHeadlineParts([
    { code: 'flowing', riverType: 'spring_fed_float' },
    { code: 'low', riverType: 'spring_fed_float' },
    { code: 'unknown', riverType: 'dam_tailwater' },
    { code: 'unknown', riverType: 'dam_tailwater' },
  ]);
  assert.equal(parts.headline, '1 of 2 rivers is floatable right now');
  assert.equal(parts.tailwaterNote, 'Plus 2 dam tailwaters, where flow depends on dam releases.');
});

test('a tailwater is never counted floatable, even if it carries a rating', () => {
  const parts = floatableHeadlineParts([
    { code: 'low' },
    { code: 'high' },
    { code: 'flowing', riverType: 'dam_tailwater' },
  ]);
  assert.equal(parts.headline, '0 of 2 rivers are floatable right now');
  assert.equal(parts.tailwaterNote, 'Plus 1 dam tailwater, where flow depends on dam releases.');
});

test('no tailwaters, no note', () => {
  const parts = floatableHeadlineParts([{ code: 'flowing', riverType: null }, { code: 'good' }]);
  assert.equal(parts.headline, '2 of 2 rivers are floatable right now');
  assert.equal(parts.tailwaterNote, null);
  assert.equal(tailwaterNote(0), null);
});

test('the tailwater note never stands without a headline', () => {
  // Only tailwaters, or a failed pull on every free-flowing river: the card
  // must not render on its footnote.
  assert.deepEqual(floatableHeadlineParts([{ code: 'unknown', riverType: 'dam_tailwater' }]), {
    headline: null,
    tailwaterNote: null,
  });
  assert.deepEqual(
    floatableHeadlineParts([{ code: 'unknown' }, { code: 'unknown', riverType: 'dam_tailwater' }]),
    { headline: null, tailwaterNote: null },
  );
});
