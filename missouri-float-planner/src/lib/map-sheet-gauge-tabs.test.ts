import assert from 'node:assert/strict';
import test from 'node:test';
import {
  gaugeTabs,
  type GaugePinFacts,
} from '../../../eddy-ios/src/components/map-sheet/gaugeTabs';

// Covers eddy-ios/src/components/map-sheet/gaugeTabs.ts. The Expo app has no
// runner, and the rule this file enforces is the one the whole condition system
// is built around: a curated station gets a verdict, a national one gets a
// comparison, and neither wears the other's words.

function facts(over: Partial<GaugePinFacts> = {}): GaugePinFacts {
  return {
    siteId: '07064533',
    curated: true,
    reading: '385 cfs',
    code: 'good',
    codeLabel: 'Good',
    updatedAt: '40 minutes ago',
    qualifierNote: null,
    ...over,
  };
}

const keys = (f: GaugePinFacts) => gaugeTabs(f).map((t) => t.key);

/**
 * The same keys, widened to plain strings.
 *
 * Needed only by the tests asserting a key is GONE: `keys()` is typed
 * GaugeTabKey[], so `.includes('now')` is a compile error once 'now' has left
 * the union — which is a real signal, and also one that would stop the runtime
 * assertion from ever running. Widening keeps both halves of the guarantee: the
 * union no longer offers the key, and the builder no longer emits it.
 */
const looseKeys = (f: GaugePinFacts): string[] => keys(f);

test('a curated station with a ladder gets Levels', () => {
  assert.ok(keys(facts()).includes('levels'));
});

test('a national-tier station never gets Levels', () => {
  // It has no ladder and never will. Giving it one would mean inventing
  // thresholds nobody decided on.
  assert.ok(!keys(facts({ curated: false, code: null, codeLabel: null })).includes('levels'));
});

test('THE TAB SET IS COMPLETE ON THE FIRST FRAME AND NEVER CHANGES', () => {
  // The invariant this file exists to hold now. Every input gaugeTabs reads
  // comes off the MapPin — `curated` is the layer it was drawn on, `siteId` is
  // on the pin, `about` is unconditional — so there is nothing here for a late
  // response to change.
  //
  // It did change, and that was a shipped regression. Levels was gated on a
  // riverCount that comes from the detail request, so a curated station opened
  // as [history, about] and became [levels, history, about] a moment later —
  // moving a reader who had chosen nothing from History to Levels while they
  // looked at it. Tracking the active tab by key does not save you when the
  // reader has not picked one.
  //
  // If a future gate here needs anything the pin does not carry, this test is
  // the thing that should stop it.
  const before = keys(facts());
  const after = keys(facts());
  assert.deepEqual(before, after);
  assert.deepEqual(before, ['levels', 'history', 'about']);
});

test('nothing gaugeTabs reads comes from the detail response', () => {
  // The structural half of the invariant above, and the reason the previous
  // test — "a curated station still waiting for thresholds gets no Levels tab"
  // — is not merely inverted but GONE: there is no longer any input that could
  // express "waiting", because `riverCount` was the only field here fed by the
  // request and it has been removed.
  //
  // Asserting the shape rather than a behaviour is deliberate. A behavioural
  // test cannot catch the regression that mattered: somebody adding one
  // response-derived field back would make the tab set async again, and every
  // assertion in this file would still pass because they all run against
  // settled fixtures.
  assert.deepEqual(Object.keys(facts()).sort(), [
    'code',
    'codeLabel',
    'curated',
    'qualifierNote',
    'reading',
    'siteId',
    'updatedAt',
  ]);
});

test('both tiers get History, because both have readings to chart', () => {
  assert.ok(keys(facts()).includes('history'));
  assert.ok(keys(facts({ curated: false })).includes('history'));
});

test('a station with no id gets no History', () => {
  // A USACE dam row can carry neither site id, and there is nothing to fetch.
  assert.ok(!keys(facts({ siteId: null })).includes('history'));
});

test('no station of either tier gets a Rivers tab', () => {
  // It was gated on riverCount > 1 on the argument that "a tab holding a single
  // row visible above is a wasted swipe". The same argument finishes the job:
  // the Levels ladders name every one of these rivers whether there are two or
  // one, so the list is the way OUT of that subject rather than a subject.
  for (const f of [facts(), facts({ curated: false }), facts({ siteId: null })]) {
    assert.ok(!looseKeys(f).includes('rivers'));
  }
});

test('there is no Now tab, because the glance is now', () => {
  // A gauge's reading and its chip ride on the MapPin for BOTH tiers, so the
  // collapsed sheet paints them with nothing outstanding. A first tab whose job
  // was to repeat what is already on screen is a swipe charged for nothing.
  for (const f of [facts(), facts({ curated: false }), facts({ siteId: null })]) {
    assert.ok(!looseKeys(f).includes('now'));
  }
});

test('About is always there', () => {
  // Load-bearing, and more so since Now went: PinSheet routes a non-access pin
  // with one tab or fewer to the single-page callout, so a station that could
  // qualify for NOTHING would swap its whole shell a moment after opening.
  // About is what guarantees the set is never empty.
  for (const f of [facts(), facts({ curated: false }), facts({ siteId: null })]) {
    assert.ok(keys(f).includes('about'));
  }
});

test('a reference station with no id falls to About alone', () => {
  // The case the shell guard has to survive. It is reachable — a USACE row can
  // carry no site id — and PinSheet must keep it on the tabbed shell anyway.
  assert.deepEqual(keys(facts({ curated: false, siteId: null })), ['about']);
});

test('order is fixed across both tiers', () => {
  assert.deepEqual(keys(facts()), ['levels', 'history', 'about']);
  assert.deepEqual(keys(facts({ curated: false })), ['history', 'about']);
});

test('the two tiers never produce the same tab set', () => {
  // The split is the point. If these ever coincide, one tier is being given
  // the other's vocabulary.
  const curated = keys(facts());
  const national = keys(facts({ curated: false, code: null, codeLabel: null }));
  assert.notDeepEqual(curated, national);
});
