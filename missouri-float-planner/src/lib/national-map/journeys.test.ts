import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { decodeGeometry, GEOMETRY_VERSION, type DecodedLine } from './geometry';
import { clipFromStart, journeyCaption, journeyFromSite, journeyHead, journeyTiming, pickJourneys, routePoints, traceDownstream, visibleJourneys } from './journeys';
import { inRegion, project, type Bounds, type Region } from './projection';

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

// ── Regional displays ───────────────────────────────────────────────────────
// Reported: at 6× around the Meramec, five of the eight national journeys
// never enter the view. A regional wall must pick what it can see.
const EMPTY: Bounds = { minX: 1, minY: 1, maxX: 0, maxY: 0 };
const [mx, my] = project(-90.59, 38.51);
const MERAMEC_6X: Region = {
  l48: { minX: mx - 774 / 12, maxX: mx + 774 / 12, minY: my - 774 / 12 / 1.78, maxY: my + 774 / 12 / 1.78 },
  ak: EMPTY,
  hi: EMPTY,
};
const stretch = (j: ReturnType<typeof traceDownstream>) => routePoints(j, rivers).filter((p) => p.d >= j.start && p.d <= j.end);

test('the national selection mostly runs off a regional view (the reported case)', () => {
  const offscreen = pickJourneys(rivers).filter((j) => !routePoints(j, rivers).some((p) => inRegion(MERAMEC_6X, p.component, p.x, p.y)));
  assert.ok(offscreen.length >= 4, `${offscreen.length} national journeys never enter the view`);
});

test('a regional display runs only the stretch of river it can see', () => {
  const picks = visibleJourneys(rivers, MERAMEC_6X);
  assert.ok(picks.length >= 1, 'the Missouri / Mississippi near St. Louis are on screen');
  for (const j of picks) {
    assert.ok(j.end > j.start);
    for (const p of stretch(j)) assert.ok(inRegion(MERAMEC_6X, p.component, p.x, p.y), `${journeyCaption(j)} stays in view`);
    assert.ok(j.tributaries.every((t) => t.at >= j.start && t.at <= j.end));
    assert.equal(journeyHead(j, 0), j.start, 'the head enters where the river enters the view');
    assert.equal(journeyHead(j, journeyTiming(j).travelMs), j.end);
  }
  assert.ok(picks.some((j) => j.names.includes('Mississippi River') || j.names.includes('Missouri River')));
});

test('a region with no river in it has no journeys', () => {
  const [px, py] = project(-116.5, 43.5); // high desert, between base rivers
  const tiny: Region = { l48: { minX: px - 2, maxX: px + 2, minY: py - 2, maxY: py + 2 }, ak: EMPTY, hi: EMPTY };
  assert.deepEqual(visibleJourneys(rivers, tiny), []);
});

test('a walk can begin part-way along its first line (a gauge)', () => {
  const j = traceDownstream(NET, 1, 400, 0.6);
  assert.deepEqual(j.steps.map((s) => [s.line, s.t0]), [[1, 0.6], [2, 0.4]]);
  assert.ok(Math.abs(j.length - (80 + 300 * 0.6)) < 1e-9);
  assert.deepEqual(j.tributaries, [], 'Side River joins Main at 50%, upstream of the gauge: not on this walk');
});

test('a featured gauge on a national river is followed downstream from where it stands', () => {
  const mo = rivers.findIndex((l) => l.name === 'Missouri River' && l.length > 50);
  assert.ok(mo >= 0);
  const l = rivers[mo];
  const mid = Math.floor(l.xy.length / 4) * 2;
  const site = { component: l.component, x: l.xy[mid], y: l.xy[mid + 1], name: 'Missouri River at Somewhere, MO', waterbody: null };
  const j = journeyFromSite(rivers, site);
  assert.ok(j, 'a gauge on the Missouri gets a journey');
  assert.equal(j!.names[0], 'Missouri River');
  assert.ok(j!.names.includes('Mississippi River'), `the water reaches the Mississippi (${j!.names.join(' → ')})`);
  assert.ok(j!.steps[0].t0 > 0, 'the walk starts at the gauge, not at the headwater');
  // Off the network: a gauge far from any national river gets nothing, not a neighbour's river.
  const distTo = (x: number, y: number) => {
    let d = Infinity;
    for (const r of rivers) {
      if (r.component !== site.component) continue;
      for (let i = 0; i + 1 < r.xy.length; i += 2) d = Math.min(d, Math.hypot(r.xy[i] - x, r.xy[i + 1] - y));
    }
    return d;
  };
  let far: [number, number] | null = null;
  for (let dx = -60; dx <= 60 && !far; dx += 4) for (let dy = -60; dy <= 60 && !far; dy += 4) if (distTo(site.x + dx, site.y + dy) > 8) far = [site.x + dx, site.y + dy];
  assert.ok(far, 'found a point away from the national network');
  assert.equal(journeyFromSite(rivers, { ...site, x: far![0], y: far![1], name: 'Little Creek near Nowhere' }), null);
  // 3 px off the river, across it: unnamed, no journey; with the river's name, allowed.
  const dx = l.xy[mid + 2] - l.xy[mid];
  const dy = l.xy[mid + 3] - l.xy[mid + 1];
  const k = 3 / Math.hypot(dx, dy);
  const off = { x: site.x - dy * k, y: site.y + dx * k };
  if (distTo(off.x, off.y) > 1.5) {
    assert.equal(journeyFromSite(rivers, { ...site, ...off, name: 'Some Creek near Town' }), null);
    assert.ok(journeyFromSite(rivers, { ...site, ...off }));
  }
});

test('a regional display follows the water only as far as the region goes', () => {
  const j = traceDownstream(NET, 0);
  const clipped = clipFromStart(j, NET, (p) => p.line !== 2);
  assert.ok(clipped);
  assert.ok(clipped!.end <= 300 + 1e-6, `stops before Trunk (${clipped!.end})`);
  assert.deepEqual(clipped!.names, ['Upper River', 'Main River']);
  assert.equal(clipFromStart(j, NET, () => false), null);
});
