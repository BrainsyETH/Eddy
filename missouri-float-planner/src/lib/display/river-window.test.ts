import assert from 'node:assert/strict';
import test from 'node:test';
import type { RiverListItem } from '@/types/api';
import {
  parseRiverSelection,
  parseRiverSnapshot,
  selectWindowRivers,
  toWindowSign,
  scenePosition,
  SCENE_STRIDE,
  WINDOW_FRAMES,
} from './river-window';

const river: RiverListItem = {
  id: 'current',
  slug: 'current',
  name: 'Current River',
  state: 'MO',
  path: '/rivers/missouri/current',
  lengthMiles: 100,
  description: null,
  difficultyRating: null,
  region: 'Ozarks',
  riverType: 'spring_fed_float',
  accessPointCount: 10,
  currentCondition: {
    code: 'good',
    label: 'Good',
    thresholdUnit: 'cfs',
    gaugeHeightFt: 3.2,
    dischargeCfs: 1250,
    readingAgeHours: 0.25,
    trend: { direction: 'steady', label: 'Steady', windowHours: 6 },
  },
};

test('signs use the rated unit, never substitute a stage over a discharge rating', () => {
  assert.equal(toWindowSign(river, 0, 0).value, '1,250');
  assert.equal(toWindowSign(river, 0, 0).unit, 'cfs');
  const missing = {
    ...river,
    currentCondition: { ...river.currentCondition!, dischargeCfs: null },
  };
  assert.equal(toWindowSign(missing, 0, 0).value, '—');
  assert.equal(toWindowSign(missing, 0, 0).code, 'unknown');
});

test('last good readings age during a failed refresh and lose positive guidance', () => {
  const old = toWindowSign(river, 1000, 1000 + 7 * 3_600_000);
  assert.equal(old.value, '1,250');
  assert.equal(old.stale, true);
  assert.equal(old.code, 'unknown');
  assert.equal(old.condition, 'Last reported reading');
  assert.equal(old.trend, null);
  assert.equal(old.age, '7 hr ago');
  const unknownAge = toWindowSign(
    { ...river, currentCondition: { ...river.currentCondition!, readingAgeHours: null } },
    0,
    0
  );
  assert.equal(unknownAge.stale, true);
  assert.equal(unknownAge.age, 'Reading time unavailable');
});

test('explicit selections preserve order and do not silently fall back to other rivers', () => {
  assert.deepEqual(parseRiverSelection('current,current,jacks-fork,<bad>'), [
    'current',
    'jacks-fork',
  ]);
  assert.deepEqual(selectWindowRivers([river], ['missing']), []);
  assert.deepEqual(selectWindowRivers([river], []), [river]);
});

test('malformed snapshots cannot replace the last successful response', () => {
  assert.throws(() =>
    parseRiverSnapshot({
      rivers: [
        {
          slug: 'x',
          name: 'X',
          currentCondition: { code: 'good', thresholdUnit: 'ft', gaugeHeightFt: '3.2' },
        },
      ],
    })
  );
  assert.throws(() => parseRiverSnapshot({ rivers: null }));
  assert.deepEqual(parseRiverSnapshot({ rivers: [river] }), [river]);
});

test('the scenery closes its loop and tiles recycle only fully offscreen', () => {
  for (let slot = 0; slot < 6; slot++) {
    assert.equal(scenePosition(0, slot), scenePosition(WINDOW_FRAMES, slot));
    for (let f = 1; f <= WINDOW_FRAMES; f++) {
      const previous = scenePosition(f - 1, slot),
        current = scenePosition(f, slot);
      if (current - previous > 1) assert.ok(previous + 3240 <= 1 && current >= 1920);
      else assert.equal(current - previous, -1);
    }
  }
  // One kiosk per tile intentionally leaves a stretch with no reading.
  assert.ok(SCENE_STRIDE > 1920 + 325);
});
