import assert from 'node:assert/strict';
import test from 'node:test';
import { CONDITION_SYSTEM } from './condition-system';
import { STALE_READING_HOURS } from './reading-staleness';
import {
  LAST_KNOWN_PREFIX,
  UNUSABLE_READING_HOURS,
  presentReading,
  readingBand,
} from './reading-presentation';

test('the bands share the six-hour line and add a 48-hour floor', () => {
  assert.equal(readingBand(0), 'fresh');
  assert.equal(readingBand(STALE_READING_HOURS - 0.1), 'fresh');
  assert.equal(readingBand(STALE_READING_HOURS), 'stale');
  assert.equal(readingBand(UNUSABLE_READING_HOURS - 0.1), 'stale');
  assert.equal(readingBand(UNUSABLE_READING_HOURS), 'expired');
});

test('an unknown age is expired, never fresh', () => {
  // Absence is not freshness. A null reaching `< threshold` would be false and
  // paint a confident chip over a gauge that has never reported.
  assert.equal(readingBand(null), 'expired');
  assert.equal(readingBand(undefined), 'expired');
  assert.equal(readingBand(Number.NaN), 'expired');
});

test('a fresh reading keeps its verdict, its colour, its otter and its trend', () => {
  const p = presentReading('good', 1);
  assert.equal(p.band, 'fresh');
  assert.equal(p.fresh, true);
  assert.equal(p.paintCode, 'good');
  assert.equal(p.label, CONDITION_SYSTEM.good.longLabel);
  assert.equal(p.showValue, true);
  assert.equal(p.showTrend, true);
  assert.equal(p.otter, CONDITION_SYSTEM.good.otter);
});

test('a stale reading is named, not instructed: "Last known: Good" in neutral', () => {
  const p = presentReading('good', 12);
  assert.equal(p.band, 'stale');
  assert.equal(p.fresh, false);
  // The paintable code is `unknown`, so every colour derived from it is grey
  // and the otter is the flag — never the green one beside a two-day-old chip.
  assert.equal(p.paintCode, 'unknown');
  assert.equal(p.otter, CONDITION_SYSTEM.unknown.otter);
  assert.equal(p.label, `${LAST_KNOWN_PREFIX}${CONDITION_SYSTEM.good.label}`);
  // The number stays: an old number with an honest age beats no number.
  assert.equal(p.showValue, true);
  // A trend is a claim about now.
  assert.equal(p.showTrend, false);
});

test('"Do Not Float" survives as a name once stale, never as an instruction', () => {
  const p = presentReading('dangerous', 30);
  assert.equal(p.label, `${LAST_KNOWN_PREFIX}${CONDITION_SYSTEM.dangerous.label}`);
  assert.equal(p.paintCode, 'unknown');
});

test('an expired reading withholds the number as well as the verdict', () => {
  const p = presentReading('flowing', 72);
  assert.equal(p.band, 'expired');
  assert.equal(p.showValue, false);
  assert.equal(p.showTrend, false);
  assert.equal(p.paintCode, 'unknown');
  assert.equal(p.label, `${LAST_KNOWN_PREFIX}${CONDITION_SYSTEM.flowing.label}`);
});

test('a code the system does not know resolves to unknown rather than throwing', () => {
  const p = presentReading('made_up', 1);
  assert.equal(p.paintCode, 'unknown');
  assert.equal(p.label, CONDITION_SYSTEM.unknown.longLabel);
});
