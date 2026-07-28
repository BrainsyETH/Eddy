import assert from 'node:assert/strict';
import test from 'node:test';
import { buildConditionSemantics } from './condition-semantics';
import type { RiverContext } from '@/lib/rivers/context';
import type { SectionCharacter } from './condition-semantics';

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

// A reach that overrides only the hydrology type, with no prose of its own --
// the state the Black's tailwater was in between migrations 00204 and 00205.
const TAILWATER_TYPE_ONLY: SectionCharacter = {
  riverType: 'dam_tailwater',
  lowWaterMeaning: null,
  risingWaterHazards: null,
};

test('whole-river update keeps the river type and its curated prose', () => {
  const out = buildConditionSemantics(BLACK, null);

  assert.match(out, /scraping over the gravel bars/);
  assert.match(out, /strainers in the shut-ins/);
  assert.doesNotMatch(out, /release schedule/);
});

test('a reach that overrides the type gets that type\'s guidance', () => {
  const out = buildConditionSemantics(BLACK, TAILWATER_TYPE_ONLY);

  assert.match(out, /release schedule/);
  assert.match(out, /never anchor or wade mid-channel during a rise/);
});

// The regression this whole change exists to prevent. river_characteristics
// prose describes the spring-fed upper river; if it survived onto the tailwater
// it would tell someone standing below a flood-control dam that low water means
// scraping gravel — while river_sections.river_type still read 'dam_tailwater'
// and everything looked correctly configured.
test('per-river prose does NOT leak onto a reach that overrides the type', () => {
  const out = buildConditionSemantics(BLACK, TAILWATER_TYPE_ONLY);

  assert.doesNotMatch(out, /scraping over the gravel bars/);
  assert.doesNotMatch(out, /strainers in the shut-ins/);
});

test('the two reaches of one river get materially different guidance', () => {
  const above = buildConditionSemantics(BLACK, null);
  const below = buildConditionSemantics(BLACK, TAILWATER_TYPE_ONLY);

  assert.notEqual(above, below);
  // Rain-driven framing above; release-driven framing below.
  assert.doesNotMatch(above, /Do not connect flow changes to rain/);
  assert.match(below, /Do not connect flow changes to rain/);
});

test('a river with no characteristics still falls back to type guidance', () => {
  const bare: RiverContext = { ...BLACK, characteristics: null };

  assert.match(buildConditionSemantics(bare, null), /Low water means scraping on gravel bars/);
  assert.match(buildConditionSemantics(bare, TAILWATER_TYPE_ONLY), /release schedule/);
});

test('a null context falls back to spring_fed_float, and an override still wins', () => {
  assert.match(buildConditionSemantics(null, null), /Low water means scraping on gravel bars/);
  assert.match(buildConditionSemantics(null, TAILWATER_TYPE_ONLY), /release schedule/);
});

// ---------------------------------------------------------------------------
// Reach prose (migration 00205) — the most specific layer
// ---------------------------------------------------------------------------

// The tailwater once it carries its own curated character.
const TAILWATER_CURATED: SectionCharacter = {
  riverType: 'dam_tailwater',
  lowWaterMeaning:
    'Clearwater Dam is releasing little or nothing, not that the river is drying up.',
  risingWaterHazards:
    'A scheduled release arriving as a wall of colder, faster water under a clear sky.',
};

test('reach prose outranks the reach type default', () => {
  const out = buildConditionSemantics(BLACK, TAILWATER_CURATED);

  assert.match(out, /Clearwater Dam is releasing little or nothing/);
  assert.match(out, /wall of colder, faster water/);
  // The generic dam_tailwater phrasing steps aside for the specific text.
  assert.doesNotMatch(out, /Low flow on a dam-controlled river usually reflects/);
});

test('reach prose still keeps the river prose out', () => {
  const out = buildConditionSemantics(BLACK, TAILWATER_CURATED);

  assert.doesNotMatch(out, /scraping over the gravel bars/);
  assert.doesNotMatch(out, /strainers in the shut-ins/);
});

// A tailwater at low flow may genuinely not be floatable — the dam is shut. The
// river-level preamble asserts the opposite, so it must not ride along with
// reach prose.
test('reach prose does not inherit the river preamble promising floatability', () => {
  const out = buildConditionSemantics(BLACK, TAILWATER_CURATED);

  assert.doesNotMatch(out, /The river IS floatable/);
});

test('a reach may carry prose for one field and inherit the type default for the other', () => {
  const partial: SectionCharacter = {
    riverType: 'dam_tailwater',
    lowWaterMeaning: 'The dam is shut.',
    risingWaterHazards: null,
  };
  const out = buildConditionSemantics(BLACK, partial);

  assert.match(out, /The dam is shut\./);
  // Rising water falls back to the dam_tailwater default, not the river's prose.
  assert.match(out, /scheduled release arriving as a fast-moving rise/);
  assert.doesNotMatch(out, /strainers in the shut-ins/);
});
