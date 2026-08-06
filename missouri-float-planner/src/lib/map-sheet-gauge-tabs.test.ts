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
    riverCount: 1,
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

test('a curated station still waiting for thresholds gets no Levels tab', () => {
  // Curated is a claim about intent; riverCount is the claim about data. An
  // empty ladder table is the present-and-empty this design avoids.
  assert.ok(!keys(facts({ riverCount: 0 })).includes('levels'));
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
  for (const count of [0, 1, 2, 5]) {
    assert.ok(!looseKeys(facts({ riverCount: count })).includes('rivers'));
  }
});

test('there is no Now tab, because the glance is now', () => {
  // A gauge's reading and its chip ride on the MapPin for BOTH tiers, so the
  // collapsed sheet paints them with nothing outstanding. A first tab whose job
  // was to repeat what is already on screen is a swipe charged for nothing.
  for (const f of [facts(), facts({ curated: false }), facts({ siteId: null, riverCount: 0 })]) {
    assert.ok(!looseKeys(f).includes('now'));
  }
});

test('About is always there', () => {
  // Load-bearing, and more so since Now went: PinSheet routes a non-access pin
  // with one tab or fewer to the single-page callout, so a station that could
  // qualify for NOTHING would swap its whole shell a moment after opening.
  // About is what guarantees the set is never empty.
  for (const f of [facts(), facts({ curated: false }), facts({ siteId: null, riverCount: 0 })]) {
    assert.ok(keys(f).includes('about'));
  }
});

test('a reference station with no id falls to About alone', () => {
  // The case the shell guard has to survive. It is reachable — a USACE row can
  // carry no site id — and PinSheet must keep it on the tabbed shell anyway.
  assert.deepEqual(keys(facts({ curated: false, siteId: null, riverCount: 0 })), ['about']);
});

test('order is fixed across both tiers', () => {
  assert.deepEqual(keys(facts({ riverCount: 2 })), ['levels', 'history', 'about']);
  assert.deepEqual(keys(facts({ curated: false, riverCount: 0 })), ['history', 'about']);
});

test('the two tiers never produce the same tab set', () => {
  // The split is the point. If these ever coincide, one tier is being given
  // the other's vocabulary.
  const curated = keys(facts({ riverCount: 1 }));
  const national = keys(facts({ curated: false, riverCount: 0, code: null, codeLabel: null }));
  assert.notDeepEqual(curated, national);
});
