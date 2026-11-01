import assert from 'node:assert/strict';
import test from 'node:test';
import {
  boxesOverlap,
  CALLOUT_SIZE,
  FLAG_SIZE,
  riverStripLayout,
  riverStripPlaceable,
  riverStripSeed,
  type Box,
  type RiverStripInput,
  type RiverStripLayout,
  type RiverStripPoint,
  type RiverStripRoute,
} from './river-strip';

const POINTS: RiverStripPoint[] = [
  [0, 'Montauk'], [0.9, 'Tan Vat'], [2.1, 'Baptist Camp'], [9.0, 'Cedargrove'], [10, 'Mile Ten'], [12, 'Mile Twelve'],
  [14.2, 'Welch Spring'], [16.7, 'Akers'], [20, 'Mile Twenty'], [22, 'Mile Twenty-Two'], [26.3, 'Pulltite'],
  [33.8, 'Echo Bluff'], [35.2, 'Round Spring'], [52.5, 'Two Rivers'], [59.8, 'Hwy 106'], [85.9, 'Van Buren'],
  [90.2, 'Big Spring'], [124.8, 'Doniphan'],
].map(([mile, name]) => ({ id: String(name).toLowerCase().replace(/\s+/g, '-'), name: String(name), mile: Number(mile), endpoint: name !== 'Welch Spring' }));

const route = (id: string, number: number, putInId: string, takeOutId: string): RiverStripRoute => ({ id, number, putInId, takeOutId });
const ROUTES = [
  route('r1', 1, 'akers', 'pulltite'),
  route('r2', 2, 'pulltite', 'round-spring'),
  route('r3', 3, 'van-buren', 'big-spring'),
];

const base: RiverStripInput = { seedKey: 'current', points: POINTS, routes: ROUTES, selectedId: 'r1', view: 'all', width: 1100 };

const tapArea = (c: { x: number; y: number }): Box => {
  const h = CALLOUT_SIZE / 2;
  return { x0: c.x - h, x1: c.x + h, y0: c.y - h, y1: c.y + h };
};
const flagArea = (f: { x: number; y: number }): Box => {
  const h = FLAG_SIZE / 2;
  return { x0: f.x - h, x1: f.x + h, y0: f.y - h, y1: f.y + h };
};
const labelArea = (l: { x: number; y: number; name: string }, charWidth: number): Box => {
  const h = (l.name.length * charWidth + 14) / 2;
  return { x0: l.x - h, x1: l.x + h, y0: l.y - 10, y1: l.y + 10 };
};

/** Every callout's whole tap area is clear of every other one and of both flags, inside the strip. */
function assertTapAreasClear(layout: RiverStripLayout) {
  const areas = layout.callouts.map(tapArea);
  areas.forEach((a, i) => {
    assert.ok(a.x0 >= 0 && a.x1 <= layout.width && a.y0 >= 0 && a.y1 <= layout.height, `callout ${layout.callouts[i].number} inside the strip`);
    areas.forEach((b, j) => {
      if (j > i) assert.ok(!boxesOverlap(a, b), `callouts ${layout.callouts[i].number} and ${layout.callouts[j].number} share a tap area`);
    });
    if (layout.flags) {
      for (const f of [layout.flags.putIn, layout.flags.takeOut]) assert.ok(!boxesOverlap(a, flagArea(f)), `callout ${layout.callouts[i].number} covers a flag`);
    }
  });
}

test('the seed is stable per river and differs between rivers', () => {
  assert.equal(riverStripSeed('current'), riverStripSeed('current'));
  assert.notEqual(riverStripSeed('current'), riverStripSeed('jacks-fork'));
  for (const key of ['', 'current', 'eleven-point']) {
    const s = riverStripSeed(key);
    assert.ok(s >= 0 && s < 2 * Math.PI);
  }
});

test('only routes with both ends on the river, running downstream, are placeable', () => {
  const placeable = riverStripPlaceable(POINTS, [
    ...ROUTES,
    route('unknown', 4, 'nowhere', 'pulltite'),
    route('upstream', 5, 'pulltite', 'akers'),
  ]);
  assert.deepEqual([...placeable].sort(), ['r1', 'r2', 'r3']);
  const layout = riverStripLayout({ ...base, routes: [...ROUTES, route('upstream', 5, 'pulltite', 'akers')] })!;
  assert.deepEqual(layout.callouts.map((c) => c.id).sort(), ['r1', 'r2', 'r3']);
  assert.equal(layout.overview.routes.length, 3);
});

test('the overview fits the routes found, not the whole river', () => {
  const layout = riverStripLayout({ ...base, routes: ROUTES.slice(0, 2) })!;
  assert.equal(layout.view, 'all');
  assert.ok(layout.window.start <= 16.7 && layout.window.end >= 35.2);
  assert.ok(layout.window.end - layout.window.start < 25, 'Akers to Round Spring, not 125 miles');
  assert.deepEqual(layout.domain, { start: 0, end: 124.8 });
  assert.ok(layout.overview.window.start > 0 && layout.overview.window.end < 1);
});

test('miles are to scale along the strip', () => {
  const layout = riverStripLayout(base)!;
  const r1 = layout.routes.find((r) => r.id === 'r1')!;
  const r2 = layout.routes.find((r) => r.id === 'r2')!;
  const perMile = (r1.takeOut.x - r1.putIn.x) / 9.6;
  assert.ok(Math.abs((r2.takeOut.x - r2.putIn.x) / 8.9 - perMile) < 0.05);
  assert.equal(r1.miles, 9.6);
  assert.equal(r1.takeOut.x, r2.putIn.x);
});

test('routes with the same midpoint get separate callouts with their own tap areas', () => {
  const nested = [route('outer', 1, 'mile-ten', 'mile-twenty-two'), route('inner', 2, 'mile-twelve', 'mile-twenty')];
  for (const view of ['all', 'stretch'] as const) {
    const layout = riverStripLayout({ ...base, routes: nested, selectedId: 'outer', view })!;
    assert.equal(layout.callouts.length, 2);
    const [p, q] = layout.callouts;
    assert.deepEqual(p.anchor, q.anchor, 'both point at the shared midpoint');
    assertTapAreasClear(layout);
  }
});

test('crowded results spill into more lanes and still never share a tap area', () => {
  const many: RiverStripRoute[] = [];
  const ends = POINTS.filter((p) => p.endpoint);
  for (let i = 0; i + 1 < ends.length; i++) many.push(route(`m${i}`, i + 1, ends[i].id, ends[i + 1].id));
  for (let i = 0; i + 2 < ends.length; i += 2) many.push(route(`l${i}`, many.length + 1, ends[i].id, ends[i + 2].id));
  for (const width of [1100, 350, 300]) {
    for (const view of ['all', 'stretch'] as const) {
      const layout = riverStripLayout({ ...base, routes: many, selectedId: 'm6', view, width, compact: width < 560 })!;
      assertTapAreasClear(layout);
      if (view === 'all') assert.equal(layout.callouts.length, many.length, `${width}px shows every number`);
    }
  }
  const narrow = riverStripLayout({ ...base, routes: many, view: 'all', width: 300, compact: true })!;
  const wide = riverStripLayout({ ...base, routes: ROUTES, view: 'all', width: 1100 })!;
  assert.ok(narrow.height > wide.height, 'extra lanes make the strip taller');
});

test('the default strip is compact: one lane above the ribbon', () => {
  const layout = riverStripLayout(base)!;
  assert.ok(layout.height <= 180, `height ${layout.height}`);
  assert.ok(layout.callouts.every((c) => c.y < layout.routes[0].putIn.y), 'callouts sit above the ribbon');
});

test('names stay clear of each other, the callouts, their connectors and the flags', () => {
  for (const [width, compact] of [[1100, false], [350, true]] as const) {
    for (const view of ['all', 'stretch'] as const) {
      const charWidth = compact ? 6.6 : 7.2;
      const layout = riverStripLayout({ ...base, view, width, compact })!;
      const areas = layout.labels.map((l) => labelArea(l, charWidth));
      areas.forEach((a, i) => {
        areas.forEach((b, j) => { if (j > i) assert.ok(!boxesOverlap(a, b), `${layout.labels[i].name} overlaps ${layout.labels[j].name}`); });
        if (layout.labels[i].emphasis === 'selected') return;
        layout.callouts.forEach((c) => assert.ok(!boxesOverlap(a, tapArea(c)), `${layout.labels[i].name} under callout ${c.number}`));
        if (layout.flags) for (const f of [layout.flags.putIn, layout.flags.takeOut]) assert.ok(!boxesOverlap(a, flagArea(f)), `${layout.labels[i].name} under a flag`);
        assert.ok(a.x0 >= 0 && a.x1 <= width && a.y0 >= 0 && a.y1 <= layout.height, `${layout.labels[i].name} inside`);
      });
    }
  }
});

test('the selected route is flagged and named; the hovered one draws on top', () => {
  const layout = riverStripLayout({ ...base, selectedId: 'r1', hoveredId: 'r2' })!;
  assert.deepEqual(layout.routes.map((r) => r.state), ['other', 'selected', 'hovered']);
  assert.ok(layout.flags);
  assert.ok(!layout.dots.some((d) => d.id === 'akers' || d.id === 'pulltite'));
  const akers = layout.labels.find((l) => l.id === 'akers')!;
  const pulltite = layout.labels.find((l) => l.id === 'pulltite')!;
  assert.equal(akers.emphasis, 'selected');
  assert.ok(akers.y < layout.flags!.putIn.y && pulltite.y > layout.flags!.takeOut.y);
  // A float nested inside the selected one still draws above it.
  const nested = riverStripLayout({
    ...base,
    routes: [route('outer', 1, 'mile-ten', 'mile-twenty-two'), route('inner', 2, 'mile-twelve', 'mile-twenty')],
    selectedId: 'outer',
    hoveredId: 'inner',
  })!;
  assert.equal(nested.routes.at(-1)!.id, 'inner');
  assert.ok(nested.flags, 'the selected flags stay');
});

test('the stretch view frames the selected route; without one it shows all floats', () => {
  const layout = riverStripLayout({ ...base, view: 'stretch' })!;
  assert.equal(layout.view, 'stretch');
  assert.ok(layout.window.start < 16.7 && layout.window.end > 26.3 && layout.window.end - layout.window.start < 20);
  assert.ok(layout.dots.every((d) => d.mile >= layout.window.start && d.mile <= layout.window.end));
  assert.ok(!layout.callouts.some((c) => c.id === 'r3'), 'a float out of view has no callout');
  const none = riverStripLayout({ ...base, selectedId: null, view: 'stretch' })!;
  assert.equal(none.view, 'all');
  assert.equal(none.flags, null);
  const unplaceable = riverStripLayout({ ...base, selectedId: 'missing', view: 'stretch' })!;
  assert.equal(unplaceable.view, 'all');
});

test('on a phone, a short selected float keeps its names off its own flags', () => {
  const layout = riverStripLayout({ ...base, selectedId: 'r2', width: 330, compact: true })!;
  const flags = [layout.flags!.putIn, layout.flags!.takeOut].map(flagArea);
  for (const l of layout.labels.filter((label) => label.emphasis === 'selected')) {
    for (const f of flags) assert.ok(!boxesOverlap(labelArea(l, 6.6), f), `${l.name} covers a flag`);
  }
  assert.equal(layout.labels.filter((l) => l.emphasis === 'selected').length, 2, 'both ends still named');
});

test('a phone overview names only route ends', () => {
  const layout = riverStripLayout({ ...base, width: 350, compact: true })!;
  const routeEnds = new Set(['akers', 'pulltite', 'round-spring', 'van-buren', 'big-spring']);
  assert.ok(layout.labels.length > 0);
  assert.ok(layout.labels.every((l) => routeEnds.has(l.id)));
});

test('too little to draw returns null', () => {
  assert.equal(riverStripLayout({ ...base, points: POINTS.slice(0, 1) }), null);
  assert.equal(riverStripLayout({ ...base, width: 0 }), null);
  assert.equal(riverStripLayout({ ...base, routes: [route('x', 1, 'pulltite', 'akers')] }), null);
});
