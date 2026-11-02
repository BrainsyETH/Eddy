import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { decodeGeometry, GEOMETRY_VERSION, type DecodedLine } from './geometry';
import { journeyCaption, journeyHead, journeyTiming, pickJourneys, traceDownstream } from './journeys';

const line = (name: string | null, length: number, down = -1, downAt = 0, component: DecodedLine['component'] = 'l48'): DecodedLine => ({
  component, order: 6, name, xy: new Float32Array([0, 0, length, 0]), length, down, downAt,
});

// 0 Upper → 1 Main (joins at its start) → 2 Trunk (joins 40% along) → outlet.
// 3 Side joins Main 50% along; 4 Early joins Trunk at 10% — BEFORE the
// journey arrives, so it is not a tributary of this journey.
const NET: DecodedLine[] = [
  line('Upper River', 100, 1, 0),
  line('Main River', 200, 2, 0.4),
  line('Trunk River', 300),
  line('Side River', 50, 1, 0.5),
  line('Early Creek', 60, 2, 0.1),
];

test('a journey walks downstream, entering each line where it joins', () => {
  const j = traceDownstream(NET, 0);
  assert.deepEqual(j.steps.map((s) => [s.line, s.t0]), [[0, 0], [1, 0], [2, 0.4]]);
  assert.equal(j.length, 100 + 200 + 300 * 0.6);
  assert.equal(j.outlet, 2);
  assert.deepEqual(j.names, ['Upper River', 'Main River', 'Trunk River']);
  assert.equal(journeyCaption(j), 'Upper → Main → Trunk');
});

test('tributaries light where they join, and only downstream of the head', () => {
  const j = traceDownstream(NET, 0);
  assert.deepEqual(j.tributaries, [{ line: 3, at: 100 + 0.5 * 200 }]);
});

test('a loop in the links cannot trap the walk', () => {
  const loop = [line('A', 10, 1, 0), line('B', 10, 0, 0)];
  assert.equal(traceDownstream(loop, 0).steps.length, 2);
});

test('the head eases from the source to the outlet and then holds', () => {
  const j = traceDownstream(NET, 0);
  const { travelMs, totalMs } = journeyTiming(j);
  assert.ok(travelMs >= 7000 && travelMs <= 17000 && totalMs > travelMs);
  assert.equal(journeyHead(j, 0), 0);
  assert.ok(journeyHead(j, travelMs / 4) < j.length / 4, 'eases in');
  assert.equal(journeyHead(j, travelMs), j.length);
  assert.equal(journeyHead(j, travelMs + 2000), j.length);
});

test('picked journeys are mostly new routes and open on different rivers', () => {
  const picks = pickJourneys(NET, { minLength: 0 });
  const firsts = picks.map((p) => p.names[0]);
  assert.equal(new Set(firsts).size, firsts.length);
  assert.equal(picks[0].names[0], 'Upper River', 'the longest walk comes first');
});

// ── The real network ────────────────────────────────────────────────────────
const asset = JSON.parse(
  readFileSync(path.join(process.cwd(), `public/river-map/geometry/base.v${GEOMETRY_VERSION}.json`), 'utf8'),
);
const rivers = decodeGeometry(asset).rivers;

test('the real network carries the Yellowstone through the Missouri to the Mississippi', () => {
  const start = rivers.findIndex((l) => l.name === 'Yellowstone River' && !rivers.some((u) => u.down === rivers.indexOf(l)));
  assert.ok(start >= 0);
  const j = traceDownstream(rivers, start);
  assert.deepEqual(j.names.slice(0, 3), ['Yellowstone River', 'Missouri River', 'Mississippi River'], 'Garrison Dam does not end the Missouri');
  assert.ok(!j.names.includes('Red River'), 'the main stem, not the Old River distributary');
});

test('the wall has journeys in the lower 48 and Alaska', () => {
  const picks = pickJourneys(rivers);
  assert.ok(picks.length >= 5, `${picks.length} journeys`);
  const comps = new Set(picks.map((p) => rivers[p.outlet].component));
  assert.ok(comps.has('l48') && comps.has('ak'));
  for (let i = 1; i < picks.length; i++) {
    if (new Set(picks.map((p) => p.outlet)).size > 1) assert.notEqual(picks[i].outlet, picks[i - 1].outlet, 'consecutive outlets differ');
  }
  for (const p of picks) assert.ok(p.tributaries.every((t) => t.at >= 0 && t.at <= p.length));
});
