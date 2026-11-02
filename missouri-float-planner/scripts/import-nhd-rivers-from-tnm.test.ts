import test from 'node:test';
import assert from 'node:assert/strict';
import { cutAtEnd } from './import-nhd-rivers-from-tnm';

// A west-flowing stem, ~0.1° (about 5.6 mi at 36°N) long, digitized downstream.
const stem = [
  [-94.0, 36.0],
  [-94.05, 36.0],
  [-94.1, 36.0],
];

test('cutAtEnd keeps the headwaters start and ends at the anchor', () => {
  const cut = cutAtEnd(stem, { label: 'midpoint', lon: -94.05, lat: 36.0005, source: 'test' }, 'demo');
  assert.deepEqual(cut[0], stem[0], 'river miles are measured from the untouched headwaters start');
  const [lon, lat] = cut[cut.length - 1];
  assert.ok(Math.abs(lon - -94.05) < 1e-6, `cut lon ${lon}`);
  assert.ok(Math.abs(lat - 36.0) < 1e-6, `cut lat ${lat} snaps onto the stem`);
});

test('cutAtEnd refuses an anchor that is not on the stem', () => {
  assert.throws(
    () => cutAtEnd(stem, { label: 'far away', lon: -94.05, lat: 36.01, source: 'test' }, 'demo'),
    /far away.*m from the stem/,
  );
});
