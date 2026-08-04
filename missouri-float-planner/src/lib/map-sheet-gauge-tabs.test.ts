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

test('one river needs no Rivers tab', () => {
  // Levels already names it; a tab holding a single row visible above is a
  // wasted swipe.
  assert.ok(!keys(facts({ riverCount: 1 })).includes('rivers'));
});

test('a gauge grading several rivers gets the Rivers tab', () => {
  // Real: site 07014000 is primary for two rivers, which is why
  // pickPrimaryRiverLink exists rather than a find(isPrimary).
  assert.ok(keys(facts({ riverCount: 2 })).includes('rivers'));
});

test('Now and About are always there', () => {
  for (const f of [facts(), facts({ curated: false }), facts({ siteId: null, riverCount: 0 })]) {
    assert.ok(keys(f).includes('now'));
    assert.ok(keys(f).includes('about'));
  }
});

test('order is fixed across both tiers', () => {
  assert.deepEqual(keys(facts({ riverCount: 2 })), [
    'now',
    'levels',
    'history',
    'rivers',
    'about',
  ]);
  assert.deepEqual(keys(facts({ curated: false, riverCount: 0 })), ['now', 'history', 'about']);
});

test('the two tiers never produce the same tab set', () => {
  // The split is the point. If these ever coincide, one tier is being given
  // the other's vocabulary.
  const curated = keys(facts({ riverCount: 1 }));
  const national = keys(facts({ curated: false, riverCount: 0, code: null, codeLabel: null }));
  assert.notDeepEqual(curated, national);
});
