import assert from 'node:assert/strict';
import test from 'node:test';
import { buildConditionSemantics } from './condition-semantics';
import type { RiverContext } from '@/lib/rivers/context';

// The Black River as it actually exists: one row, typed spring_fed_float for the
// Lesterville float, with per-river prose describing that spring-fed reach. The
// tailwater below Clearwater Dam is a river_sections row overriding the type.
const BLACK: RiverContext = {
  id: 'black-id',
  slug: 'black',
  name: 'Black River',
  region: 'Ozarks',
  state: 'MO',
  country: 'US',
  timezone: 'America/Chicago',
  riverType: 'spring_fed_float',
  parkCode: null,
  weatherCity: null,
  weatherLat: null,
  weatherLon: null,
  alertSearchTerms: null,
  characteristics: {
    isSpringFed: true,
    primaryHazards: [],
    lowWaterMeaning: 'scraping over the gravel bars between Lesterville and the lake.',
    risingWaterHazards: 'strainers in the shut-ins after a rain.',
    rainLagHours: null,
    rainLagNote: null,
    dropRateNote: null,
    riverNote: null,
    speedCurve: null,
  },
};

test('whole-river update keeps the river type and its curated prose', () => {
  const out = buildConditionSemantics(BLACK, null);

  assert.match(out, /scraping over the gravel bars/);
  assert.match(out, /strainers in the shut-ins/);
  assert.doesNotMatch(out, /release schedule/);
});

test('a reach that overrides the type gets that type\'s guidance', () => {
  const out = buildConditionSemantics(BLACK, 'dam_tailwater');

  assert.match(out, /release schedule/);
  assert.match(out, /never anchor or wade mid-channel during a rise/);
});

// The regression this whole change exists to prevent. river_characteristics
// prose describes the spring-fed upper river; if it survived onto the tailwater
// it would tell someone standing below a flood-control dam that low water means
// scraping gravel — while river_sections.river_type still read 'dam_tailwater'
// and everything looked correctly configured.
test('per-river prose does NOT leak onto a reach that overrides the type', () => {
  const out = buildConditionSemantics(BLACK, 'dam_tailwater');

  assert.doesNotMatch(out, /scraping over the gravel bars/);
  assert.doesNotMatch(out, /strainers in the shut-ins/);
});

test('the two reaches of one river get materially different guidance', () => {
  const above = buildConditionSemantics(BLACK, null);
  const below = buildConditionSemantics(BLACK, 'dam_tailwater');

  assert.notEqual(above, below);
  // Rain-driven framing above; release-driven framing below.
  assert.doesNotMatch(above, /Do not connect flow changes to rain/);
  assert.match(below, /Do not connect flow changes to rain/);
});

test('a river with no characteristics still falls back to type guidance', () => {
  const bare: RiverContext = { ...BLACK, characteristics: null };

  assert.match(buildConditionSemantics(bare, null), /Low water means scraping on gravel bars/);
  assert.match(buildConditionSemantics(bare, 'dam_tailwater'), /release schedule/);
});

test('a null context falls back to spring_fed_float, and an override still wins', () => {
  assert.match(buildConditionSemantics(null, null), /Low water means scraping on gravel bars/);
  assert.match(buildConditionSemantics(null, 'dam_tailwater'), /release schedule/);
});
