import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyReading, type ConditionThresholds } from '@shared/condition-ladder';
import { formatBand, highFieldIgnored, ladderBands, type Band, type BandKey } from './ladder-bands';

const CODE_TO_KEY: Record<string, BandKey> = {
  too_low: 'tooLow',
  low: 'low',
  good: 'good',
  flowing: 'flowing',
  high: 'high',
  dangerous: 'flood',
};
const FIELDS = ['levelTooLow', 'levelLow', 'levelOptimalMin', 'levelOptimalMax', 'levelHigh', 'levelDangerous'] as const;

const contains = (b: Band, v: number) =>
  (b.min === null || (b.minInclusive ? v >= b.min : v > b.min)) &&
  (b.max === null || (b.maxInclusive ? v <= b.max : v < b.max));

test('printed ranges agree with classifyReading for every mix of filled and blank thresholds', () => {
  // Values 1..6 in ladder order; each of the 64 subsets left blank in turn.
  for (let mask = 0; mask < 64; mask++) {
    const ladder = Object.fromEntries(
      FIELDS.map((f, i) => [f, mask & (1 << i) ? i + 1 : null]),
    ) as unknown as ConditionThresholds;
    const bands = ladderBands(ladder);
    for (let v = 0.5; v <= 7; v += 0.25) {
      const code = classifyReading(v, { ...ladder, thresholdUnit: 'ft' });
      const hits = (Object.entries(bands) as [BandKey, Band][]).filter(([, b]) => contains(b, v)).map(([k]) => k);
      if (code === 'unknown') {
        assert.deepEqual(hits, [], `mask ${mask}: an empty ladder has no bands`);
      } else {
        assert.deepEqual(hits, [CODE_TO_KEY[code]], `mask ${mask}, reading ${v}`);
      }
    }
  }
});

test('High starts at Optimal Max; the High field only counts when Optimal Max is blank', () => {
  const full = { levelTooLow: 1, levelLow: 2, levelOptimalMin: 3, levelOptimalMax: 4, levelHigh: 6, levelDangerous: 8 };
  assert.deepEqual(ladderBands(full).high, { min: 4, minInclusive: false, max: 8, maxInclusive: false });
  assert.equal(highFieldIgnored(full), true);
  const noMax = { ...full, levelOptimalMax: null };
  assert.equal(ladderBands(noMax).high?.min, 6);
  assert.equal(highFieldIgnored(noMax), false);
  assert.equal(highFieldIgnored({ ...full, levelHigh: 4 }), false);
});

test('ranges read plainly in both units', () => {
  const b = ladderBands({ levelTooLow: 1, levelLow: 2, levelOptimalMin: 3, levelOptimalMax: 4, levelHigh: null, levelDangerous: 1200 });
  assert.equal(formatBand(b.tooLow!, 'ft'), '< 1.00 ft');
  assert.equal(formatBand(b.low!, 'ft'), '1.00 to < 2.00 ft');
  assert.equal(formatBand(b.flowing!, 'ft'), '3.00 to 4.00 ft');
  assert.equal(formatBand(b.high!, 'cfs'), '> 4 to < 1,200 cfs');
  assert.equal(formatBand(b.flood!, 'cfs'), '≥ 1,200 cfs');
});
