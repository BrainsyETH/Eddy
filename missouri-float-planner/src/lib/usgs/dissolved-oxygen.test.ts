import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDissolvedOxygen, PARAM_DISSOLVED_OXYGEN } from './dissolved-oxygen';
import type { OgcFeature } from '@/lib/flow-providers/usgs';

const feature = (parameter_code: string, value: unknown, time: string | null): OgcFeature =>
  ({ properties: { parameter_code, value, time } }) as unknown as OgcFeature;

test('reads the 00300 value and its timestamp', () => {
  // The real reading below Norfork Dam on 2026-08-24.
  const got = parseDissolvedOxygen([feature(PARAM_DISSOLVED_OXYGEN, '3.2', '2026-08-24T21:15:00Z')]);
  assert.deepEqual(got, {
    valueMgL: 3.2,
    observedAt: '2026-08-24T21:15:00Z',
    source: 'usgs',
  });
});

test('ignores other parameters entirely', () => {
  // These sites publish 00010 alongside 00300, so picking the first feature
  // without checking the code would report a water temperature in mg/L.
  assert.equal(parseDissolvedOxygen([feature('00010', '11.8', '2026-08-24T21:15:00Z')]), null);

  const mixed = parseDissolvedOxygen([
    feature('00010', '11.8', '2026-08-24T21:15:00Z'),
    feature(PARAM_DISSOLVED_OXYGEN, '5.2', '2026-08-24T21:00:00Z'),
  ]);
  assert.equal(mixed?.valueMgL, 5.2);
});

test('rejects USGS sentinels and impossible water', () => {
  for (const bad of ['-999999', '-1', '25', 'n/a', '']) {
    assert.equal(
      parseDissolvedOxygen([feature(PARAM_DISSOLVED_OXYGEN, bad, '2026-08-24T21:15:00Z')]),
      null,
      `expected ${JSON.stringify(bad)} to be rejected`,
    );
  }
});

test('accepts the supersaturated end but not beyond it', () => {
  // Cold water below a spillway genuinely runs high; 20 is the ceiling.
  assert.equal(
    parseDissolvedOxygen([feature(PARAM_DISSOLVED_OXYGEN, '14.5', '2026-08-24T21:15:00Z')])?.valueMgL,
    14.5,
  );
  assert.equal(
    parseDissolvedOxygen([feature(PARAM_DISSOLVED_OXYGEN, '20.1', '2026-08-24T21:15:00Z')]),
    null,
  );
});

test('a reading with no timestamp is not a reading', () => {
  // The display rule is "always with its measurement age". A value with no
  // time cannot satisfy that, so it is dropped rather than shown bare.
  assert.equal(parseDissolvedOxygen([feature(PARAM_DISSOLVED_OXYGEN, '5.2', null)]), null);
});

test('no features means null, not a throw', () => {
  assert.equal(parseDissolvedOxygen([]), null);
});
