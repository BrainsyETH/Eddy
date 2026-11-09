import assert from 'node:assert/strict';
import test from 'node:test';
import {
  RAMP_CAUTION_COPY, REPORTED_STATUS_LABELS, levelChangeLabel, listingAge, poolPosition, poolPositionSentence,
  provenanceLine, rampCaution,
} from './lake-status';

const NOW = Date.parse('2026-11-09T19:00:00Z');

test('status labels keep the Corps vocabulary and provenance names the agency date or its absence', () => {
  assert.equal(REPORTED_STATUS_LABELS.partial, 'Limited access');
  assert.equal(REPORTED_STATUS_LABELS.open, 'Reported open');
  assert.equal(provenanceLine({ source_updated_at: '2026-04-28T00:00:00.000Z' }), 'Corps of Engineers listing, updated 2026-04-28');
  assert.equal(provenanceLine({ source_updated_at: null }), 'Corps of Engineers listing · update date unavailable');
});

test('a listing\'s age reads at a glance, and an unknown date says so', () => {
  assert.equal(listingAge('2026-04-28T00:00:00Z', NOW), 'updated 6 months ago');
  assert.equal(listingAge('2026-10-16T00:00:00Z', NOW), 'updated 3 weeks ago');
  assert.equal(listingAge('2026-11-08T12:00:00Z', NOW), 'updated yesterday');
  assert.equal(listingAge('2022-03-01T00:00:00Z', NOW), 'updated 5 years ago');
  assert.equal(listingAge(null, NOW), 'update date unavailable');
});

test('cautions come from thresholds in one datum and never say available, usable or open', () => {
  const ramp = { bottomFt: 704, closureFt: 724, datum: 'NGVD29' as const };
  assert.equal(rampCaution({ elevationFt: 703.5, datum: 'NGVD29' }, ramp), 'low_water');
  assert.equal(rampCaution({ elevationFt: 725, datum: 'NGVD29' }, ramp), 'high_water');
  assert.equal(rampCaution({ elevationFt: 706, datum: 'NGVD29' }, ramp), null);
  assert.equal(rampCaution({ elevationFt: 600, datum: 'NGVD29' }, { ...ramp, bottomFt: null }), null);
  assert.throws(() => rampCaution({ elevationFt: 706, datum: 'NAVD88' }, ramp), /different datums/);
  for (const copy of Object.values(RAMP_CAUTION_COPY)) {
    const all = `${copy.title} ${copy.body} ${copy.basis}`.toLowerCase().replace('or unavailable', '');
    assert.ok(!/\bavailable\b/.test(all) && !all.includes('usable') && !/\bopen\b/.test(all), `caution copy never promotes a status: ${all}`);
    assert.ok(all.includes('not an official closure report'));
  }
});

test('a level change is a signed number, and the pool position names the documented pools', () => {
  assert.equal(levelChangeLabel(0.42, 24), '+0.42 ft in 24h');
  assert.equal(levelChangeLabel(-1.26, 168), '−1.3 ft in 7d');
  assert.equal(levelChangeLabel(0.01, 24), 'no change in 24h');
  assert.equal(levelChangeLabel(null, 24), null);
  const range = { conservationFt: 915, floodFt: 931 };
  assert.equal(poolPosition(913.2, range), 'below_conservation');
  assert.equal(poolPosition(916.4, range), 'within_operating_range');
  assert.equal(poolPosition(932, range), 'above_flood');
  assert.equal(poolPosition(916.4, null), null);
  assert.equal(poolPositionSentence('below_conservation', 913.2, range), '1.8 ft below the 915 ft conservation pool.');
  assert.equal(poolPositionSentence('within_operating_range', 916.4, range), '1.4 ft above the 915 ft conservation pool, in the flood-control range.');
  assert.equal(poolPositionSentence(null, 916.4, null), 'Operating range not published.');
});
