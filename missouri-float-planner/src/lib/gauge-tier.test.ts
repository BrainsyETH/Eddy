import assert from 'node:assert/strict';
import test from 'node:test';
import type { GaugeDetailThreshold } from '@eddy/types';
import {
  gaugeTier,
  seedFromMapGaugeLite,
  seedFromSearchResult,
  seedFromStar,
  type GaugeSeed,
} from '../../../eddy-ios/src/lib/gaugeSeed';

// The gauge screen speaks one of two vocabularies about a reading, and they
// contradict each other: a RATED station gets a ladder and a verdict, a
// REFERENCE station gets a comparison to its own history — or, having none,
// "No comparison" and "No historical comparison published for this gauge".
//
// It chose between them by asking whether the seed carried a ladder, and three
// of the five seeds cannot carry one: no list endpoint sends ladders. So
// opening a rated Eddy gauge from search, from Favorites, or from the national
// map tier printed the reference tier's answer in full confidence for the frame
// before /api/gauges/[siteId] landed.
//
// Reported from the field on the Eleven Point near Bardley — rated, laddered,
// and shown as an unrated creek on open. These tests are what stop a fourth
// seed reintroducing it.

/** The fields gaugeTier reads, with everything else at its emptiest. */
function seed(over: Partial<GaugeSeed>): GaugeSeed {
  return {
    id: null,
    siteId: '07071500',
    provider: null,
    publicUrl: null,
    stationNote: null,
    name: 'Eleven Point River near Bardley, MO',
    curated: null,
    coordinates: null,
    gaugeHeightFt: null,
    dischargeCfs: null,
    readingTimestamp: null,
    readingAgeHours: null,
    readingSuspect: false,
    qualifierNote: null,
    flowPercentile: null,
    thresholds: null,
    floodStages: null,
    ...over,
  };
}

const LADDER: GaugeDetailThreshold = {
  isPrimary: true,
  riverId: 'r1',
  riverSlug: 'eleven-point',
  riverName: 'Eleven Point River',
  thresholdUnit: 'cfs',
  floodStageFt: null,
  levelTooLow: 100,
  levelLow: 200,
  levelOptimalMin: 300,
  levelOptimalMax: 1200,
  levelHigh: 1800,
  levelDangerous: 3000,
};

/** Rated to a river, but with no rungs — the honest "reference" case. */
const NO_LADDER: GaugeDetailThreshold = {
  ...LADDER,
  levelTooLow: null,
  levelLow: null,
  levelOptimalMin: null,
  levelOptimalMax: null,
  levelHigh: null,
  levelDangerous: null,
};

test('a usable ladder is a rated station', () => {
  assert.equal(gaugeTier(seed({ thresholds: [LADDER] })), 'rated');
});

test('the PRIMARY ladder decides, not the first one', () => {
  // A station that rates two rivers must be graded on the one it is primary
  // for — the same rule gaugeLink() applies everywhere else in the app.
  const secondary = { ...NO_LADDER, isPrimary: false, riverSlug: 'other' };
  assert.equal(gaugeTier(seed({ thresholds: [secondary, LADDER] })), 'rated');
});

test('ladders on the wire with none usable is a reference station', () => {
  // An answer, not a silence: the endpoint that carries ladders carried this
  // station's, and it has none.
  assert.equal(gaugeTier(seed({ thresholds: [NO_LADDER] })), 'reference');
  assert.equal(gaugeTier(seed({ thresholds: [] })), 'reference');
});

test('a source that states the tier outright is believed', () => {
  // The national tier says `curated: false` and means it. Those stations get
  // their band immediately, with the percentile the lite seed already carries —
  // no placeholder frame for the case that was never ambiguous.
  assert.equal(gaugeTier(seed({ curated: false })), 'reference');
});

test('no ladders and no statement about the tier is UNKNOWN, not reference', () => {
  // The whole bug. Every one of these used to answer 'reference'.
  assert.equal(gaugeTier(seed({ curated: null })), 'unknown');
  assert.equal(gaugeTier(seed({ curated: true })), 'unknown');
});

test('the three seeds that cannot carry a ladder never claim the reference tier', () => {
  // Named individually because each one is a real route into the gauge screen
  // and each one was showing "No comparison" over rated water.

  // Favorites: the star store records no tier at all.
  const starred = seedFromStar({ entityId: 'g1', name: 'Eleven Point', usgsSiteId: '07071500' });
  assert.ok(starred);
  assert.equal(gaugeTier(starred), 'unknown');

  // Search: a row whose reading is absent says nothing about the tier, and
  // `?? false` used to turn that silence into a claim.
  const found = seedFromSearchResult({
    kind: 'gauge',
    id: 'g1',
    name: 'Eleven Point River near Bardley, MO',
    siteId: '07071500',
    coordinates: null,
  } as Parameters<typeof seedFromSearchResult>[0]);
  assert.ok(found);
  assert.equal(gaugeTier(found), 'unknown');

  // The map's national tier, when the lite row says the station IS curated.
  const lite = seedFromMapGaugeLite({
    id: 'g1',
    siteId: '07071500',
    name: 'Eleven Point River near Bardley, MO',
    curated: true,
    coordinates: { lng: -91.1, lat: 36.6 },
    gaugeHeightFt: null,
    dischargeCfs: 410,
    readingTimestamp: null,
    readingAgeHours: 0.5,
    readingSuspect: false,
    flowPercentile: null,
  } as Parameters<typeof seedFromMapGaugeLite>[0]);
  assert.equal(gaugeTier(lite), 'unknown');
});

test('a lite row that says it is NOT curated still resolves immediately', () => {
  // The other half of the previous test: withholding the band from the ~14,000
  // reference stations would trade one wrong frame for a slower right one on
  // every gauge in the country.
  const lite = seedFromMapGaugeLite({
    id: 'g2',
    siteId: '06818000',
    name: 'Missouri River at St Joseph, MO',
    curated: false,
    coordinates: { lng: -94.8, lat: 39.7 },
    gaugeHeightFt: 8.2,
    dischargeCfs: 41000,
    readingTimestamp: null,
    readingAgeHours: 0.4,
    readingSuspect: false,
    flowPercentile: 62,
  } as Parameters<typeof seedFromMapGaugeLite>[0]);
  assert.equal(gaugeTier(lite), 'reference');
});
