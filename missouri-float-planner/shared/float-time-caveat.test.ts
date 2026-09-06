import assert from 'node:assert/strict';
import test from 'node:test';
import { REGULATED_SENTENCE, releaseCaveat } from './float-time-caveat';

test('no caveat unless the time is release-dependent', () => {
  assert.equal(releaseCaveat(null), null);
  assert.equal(releaseCaveat(undefined), null);
  assert.equal(releaseCaveat({ releaseDependent: false, model: 'flow', gaugeName: 'X' }), null);
});

test('the flow model names the gauge it read, never "the release"', () => {
  const text = releaseCaveat({
    releaseDependent: true,
    model: 'flow',
    gaugeName: 'Black River below Clearwater Dam',
  });
  assert.ok(text);
  assert.match(text, /Estimated from the flow at Black River below Clearwater Dam right now\./);
  assert.match(text, /If generation starts or stops mid-float/);
  assert.doesNotMatch(text, /current dam release/);
});

test('the flow model without a gauge name still says where the number came from', () => {
  const text = releaseCaveat({ releaseDependent: true, model: 'flow', gaugeName: null });
  assert.match(text ?? '', /the flow below the dam right now/);
});

test('a published time does not claim to have read any flow', () => {
  // The known branch scales an outfitter figure by condition band. No
  // discharge went into it; the caveat must say what it assumed instead.
  for (const model of ['known', 'band', null, undefined, 'something-new'] as const) {
    const text = releaseCaveat({ releaseDependent: true, model, gaugeName: 'X' });
    assert.ok(text);
    assert.match(text, /^Assumes the release stays as it is now\./);
    assert.doesNotMatch(text, /Estimated from/);
    assert.match(text, /If generation starts or stops mid-float/);
  }
});

test('the regulated sentence is uncertainty about when, not a verdict', () => {
  assert.match(REGULATED_SENTENCE, /Dam releases can change mid-float/);
  assert.doesNotMatch(REGULATED_SENTENCE, /dangerous|Wait for it to drop/);
});
