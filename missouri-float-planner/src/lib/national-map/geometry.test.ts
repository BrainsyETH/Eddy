import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { decodeDelta, decodeGeometry, GEOMETRY_VERSION } from './geometry';
import { NATIONAL_STATE_CODES } from './scope';

// The committed static assets the browser loads (scripts/build-national-map-geometry.ts).
const DIR = path.join(process.cwd(), 'public/river-map/geometry');
const load = (name: string) => JSON.parse(readFileSync(path.join(DIR, `${name}.v${GEOMETRY_VERSION}.json`), 'utf8'));

test('delta decoding restores frame coordinates', () => {
  assert.deepEqual([...decodeDelta([200, 400, 10, -20, -5, 5], 20)], [10, 20, 10.5, 19, 10.25, 19.25]);
});

test('the base asset holds all 50 states and DC, and no territory', () => {
  const g = decodeGeometry(load('base'));
  const codes = g.states.map((s) => s.code).sort();
  assert.deepEqual(codes, [...NATIONAL_STATE_CODES].sort());
  assert.equal(g.states.find((s) => s.code === 'AK')?.component, 'ak');
  assert.equal(g.states.find((s) => s.code === 'HI')?.component, 'hi');
});

test('the national network reaches Alaska and Hawaii, and lakes include the Great Lakes', () => {
  const g = decodeGeometry(load('base'));
  for (const comp of ['l48', 'ak', 'hi'] as const) {
    assert.ok(g.rivers.some((r) => r.component === comp), `rivers in ${comp}`);
  }
  assert.ok(g.rivers.some((r) => r.order === 7), 'the major trunk rivers are present');
  assert.ok(g.lakes.length > 100);
});

test('every vertex sits inside its component’s published bounds', () => {
  const g = decodeGeometry(load('base'));
  const slack = 2;
  for (const r of g.rivers) {
    const b = g.components[r.component];
    for (let i = 0; i + 1 < r.xy.length; i += 2) {
      assert.ok(
        r.xy[i] >= b.minX - slack && r.xy[i] <= b.maxX + slack && r.xy[i + 1] >= b.minY - slack && r.xy[i + 1] <= b.maxY + slack,
        `river vertex outside ${r.component} bounds`,
      );
    }
  }
});

test('the first-screen asset stays small; detail loads on zoom', () => {
  const base = readFileSync(path.join(DIR, `base.v${GEOMETRY_VERSION}.json`)).length;
  const detail = decodeGeometry(load('detail'));
  assert.ok(base < 400_000, `base asset is ${base} bytes`);
  assert.equal(detail.states.length, 0);
  assert.ok(detail.rivers.every((r) => r.order <= 4));
});
