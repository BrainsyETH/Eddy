import assert from 'node:assert/strict';
import test from 'node:test';
import { riverStripLayout, riverStripSeed, type RiverStripInput, type RiverStripPoint } from './river-strip';

const POINTS: RiverStripPoint[] = [
  [0, 'Montauk'], [0.9, 'Tan Vat'], [2.1, 'Baptist Camp'], [9.0, 'Cedargrove'], [14.2, 'Welch Spring'],
  [16.7, 'Akers'], [26.3, 'Pulltite'], [33.8, 'Echo Bluff'], [35.2, 'Round Spring'], [52.5, 'Two Rivers'],
  [59.8, 'Hwy 106'], [85.9, 'Van Buren'], [90.2, 'Big Spring'], [124.8, 'Doniphan'],
].map(([mile, name]) => ({ id: String(name).toLowerCase().replace(/\s+/g, '-'), name: String(name), mile: Number(mile), endpoint: name !== 'Welch Spring' }));

const base: RiverStripInput = {
  seedKey: 'current',
  points: POINTS,
  routes: [
    { id: 'r1', number: 1, putInId: 'akers', takeOutId: 'pulltite' },
    { id: 'r2', number: 2, putInId: 'pulltite', takeOutId: 'round-spring' },
    { id: 'r3', number: 3, putInId: 'van-buren', takeOutId: 'big-spring' },
  ],
  selectedId: 'r1',
  view: 'whole',
  width: 1100,
  height: 250,
};

// Two label boxes intersect: the same width estimate the layout uses, 20px tall.
const overlaps = (labels: { x: number; y: number; name: string }[], charWidth: number) =>
  labels.some((l, i) =>
    labels.some((m, j) => j > i && Math.abs(l.y - m.y) < 20
      && Math.abs(l.x - m.x) < ((l.name.length + m.name.length) * charWidth + 28) / 2));

test('the seed is stable per river and differs between rivers', () => {
  assert.equal(riverStripSeed('current'), riverStripSeed('current'));
  assert.notEqual(riverStripSeed('current'), riverStripSeed('jacks-fork'));
  for (const key of ['', 'current', 'eleven-point']) {
    const s = riverStripSeed(key);
    assert.ok(s >= 0 && s < 2 * Math.PI);
  }
});

test('miles are to scale: the whole river spans the drawable width', () => {
  const layout = riverStripLayout(base)!;
  assert.deepEqual(layout.domain, { start: 0, end: 124.8 });
  const r1 = layout.routes.find((r) => r.id === 'r1')!;
  const r2 = layout.routes.find((r) => r.id === 'r2')!;
  // Akers (16.7) to Pulltite (26.3) and Pulltite to Round Spring (35.2): x is linear in miles.
  const perMile = (r1.takeOut.x - r1.putIn.x) / 9.6;
  assert.ok(Math.abs((r2.takeOut.x - r2.putIn.x) / 8.9 - perMile) < 0.05);
  assert.equal(r1.miles, 9.6);
  assert.equal(r1.takeOut.x, r2.putIn.x);
});

test('the selected route is flagged, not dotted, and named above and below', () => {
  const layout = riverStripLayout(base)!;
  assert.equal(layout.routes.find((r) => r.id === 'r1')!.state, 'selected');
  assert.ok(!layout.dots.some((d) => d.id === 'akers' || d.id === 'pulltite'));
  const akers = layout.labels.find((l) => l.id === 'akers')!;
  const pulltite = layout.labels.find((l) => l.id === 'pulltite')!;
  assert.equal(akers.emphasis, 'selected');
  assert.ok(akers.y < layout.routes[0].putIn.y, 'put-in named above');
  assert.ok(pulltite.y > layout.routes[0].takeOut.y, 'take-out named below');
});

test('labels never overlap on the same side, even where stops crowd together', () => {
  const layout = riverStripLayout(base)!;
  assert.ok(layout.labels.length > 4);
  assert.equal(overlaps(layout.labels, 7.2), false);
  // Montauk, Tan Vat and Baptist Camp sit within 2.1 miles: at least one is dropped.
  const upper = layout.labels.filter((l) => ['montauk', 'tan-vat', 'baptist-camp'].includes(l.id));
  assert.ok(upper.length < 3);
});

test('hovering marks a route without changing the selection', () => {
  const layout = riverStripLayout({ ...base, hoveredId: 'r3' })!;
  assert.deepEqual(layout.routes.map((r) => r.state), ['selected', 'other', 'hovered']);
  const same = riverStripLayout({ ...base, hoveredId: 'r1' })!;
  assert.equal(same.routes[0].state, 'selected');
});

test('the stretch view frames the selected route and reports its window', () => {
  const layout = riverStripLayout({ ...base, view: 'stretch' })!;
  assert.equal(layout.view, 'stretch');
  assert.ok(layout.window.start < 16.7 && layout.window.end > 26.3);
  assert.ok(layout.window.end - layout.window.start < 20);
  assert.ok(layout.overview.window);
  // Only stops in the window get dots; Van Buren's float has no number on screen.
  assert.ok(layout.dots.every((d) => d.mile >= layout.window.start && d.mile <= layout.window.end));
  assert.equal(layout.routes.find((r) => r.id === 'r3')!.chip, null);
  assert.ok(layout.ticks.length >= 3);
});

test('stretch without a selection falls back to the whole river', () => {
  const layout = riverStripLayout({ ...base, selectedId: null, view: 'stretch' })!;
  assert.equal(layout.view, 'whole');
  assert.equal(layout.overview.window, null);
  assert.ok(layout.routes.every((r) => r.state === 'other'));
});

test('a compact whole-river view names only the chosen put-in and take-out', () => {
  const layout = riverStripLayout({ ...base, width: 350, height: 190, compact: true })!;
  assert.deepEqual(layout.labels.map((l) => l.id).sort(), ['akers', 'pulltite']);
  const zoomed = riverStripLayout({ ...base, width: 350, height: 190, compact: true, view: 'stretch' })!;
  assert.ok(zoomed.labels.length >= 2);
  assert.equal(overlaps(zoomed.labels, 6.6), false);
});

test('labels stay inside the strip', () => {
  for (const view of ['whole', 'stretch'] as const) {
    for (const [width, height, compact] of [[1100, 250, false], [350, 190, true]] as const) {
      const layout = riverStripLayout({ ...base, view, width, height, compact })!;
      for (const l of layout.labels) {
        assert.ok(l.x >= 0 && l.x <= width, `${l.name} x in bounds`);
        assert.ok(l.y >= 8 && l.y <= height - 8, `${l.name} y in bounds`);
      }
    }
  }
});

test('routes that cannot be placed are left off rather than drawn wrong', () => {
  const layout = riverStripLayout({
    ...base,
    routes: [
      ...base.routes,
      { id: 'unknown', number: 4, putInId: 'nowhere', takeOutId: 'pulltite' },
      { id: 'upstream', number: 5, putInId: 'pulltite', takeOutId: 'akers' },
    ],
  })!;
  assert.deepEqual(layout.routes.map((r) => r.id), ['r1', 'r2', 'r3']);
  assert.equal(layout.overview.routes.length, 3);
});

test('too little to draw returns null', () => {
  assert.equal(riverStripLayout({ ...base, points: POINTS.slice(0, 1) }), null);
  assert.equal(riverStripLayout({ ...base, width: 0 }), null);
});

test('names stay clear of the route numbers and the end flags', () => {
  for (const view of ['whole', 'stretch'] as const) {
    const layout = riverStripLayout({ ...base, view })!;
    const selected = layout.routes.find((r) => r.state === 'selected')!;
    const marks = [
      ...layout.routes.flatMap((r) => (r.chip ? [{ ...r.chip, half: 16 }] : [])),
      { x: selected.putIn.x, y: selected.putIn.y, half: 18 },
      { x: selected.takeOut.x, y: selected.takeOut.y, half: 18 },
    ];
    for (const l of layout.labels.filter((label) => label.emphasis !== 'selected')) {
      const halfW = (l.name.length * 7.2 + 14) / 2;
      for (const m of marks) {
        const clear = Math.abs(l.x - m.x) >= halfW + m.half || Math.abs(l.y - m.y) >= 10 + m.half;
        assert.ok(clear, `${l.name} overlaps a mark in the ${view} view`);
      }
    }
  }
});
