import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildLayout,
  componentOf,
  invertComponent,
  layoutKindFor,
  locate,
  project,
  projectComponent,
  type Bounds,
  type MapComponent,
} from './projection';

// Reference values from d3-geo 1.7.1's geoAlbersUsa() at its default scale and
// translate, pinned so a parameter typo cannot move the country. Attu (172.2°E)
// is included: the composition must not lose the western Aleutians.
const D3_REFERENCE: Array<[string, number, number, number, number]> = [
  ['St. Louis', -90.2, 38.63, 572.4062410849906, 248.791251215756],
  ['Seattle', -122.33, 47.6, 159.0970107420186, 37.20325671354885],
  ['Anchorage', -149.9, 61.2, 171.17122462409534, 447.062592258631],
  ['Adak', -176.6, 51.9, 68.46730538841227, 492.8699996491704],
  ['Attu', 173.2, 52.9, 33.78981605127143, 470.4058896087959],
  ['Honolulu', -157.86, 21.3, 298.44835693125003, 451.11532383404676],
];

test('the composite matches geoAlbersUsa, including across the antimeridian', () => {
  for (const [name, lng, lat, x, y] of D3_REFERENCE) {
    const [px, py] = project(lng, lat);
    assert.ok(Math.abs(px - x) < 1e-6 && Math.abs(py - y) < 1e-6, `${name}: ${px},${py} vs ${x},${y}`);
  }
});

test('points route to insets by geography, not by clip box', () => {
  assert.equal(componentOf(173.2, 52.9), 'ak'); // Attu, east of the antimeridian
  assert.equal(componentOf(-176.6, 51.9), 'ak'); // Adak
  assert.equal(componentOf(-134.4, 58.3), 'ak'); // Juneau, in the panhandle
  assert.equal(componentOf(-157.86, 21.3), 'hi');
  assert.equal(componentOf(-155.08, 19.72), 'hi');
  assert.equal(componentOf(-77.03, 38.9), 'l48'); // DC
  assert.equal(componentOf(-122.3, 48.99), 'l48'); // Blaine, WA — just under 49°N
});

test('the Aleutian chain projects continuously, without a tear across the frame', () => {
  const xs = [172.5, 175, 178, 179.9, -179.9, -178, -175, -170].map((lng) => project(lng, 52)[0]);
  for (let i = 1; i < xs.length; i++) {
    assert.ok(xs[i] > xs[i - 1], `x should increase eastward along the chain (${xs.join(', ')})`);
    assert.ok(xs[i] - xs[i - 1] < 30, 'neighbouring islands stay neighbours');
  }
});

test('inverting a projected point returns the original coordinate', () => {
  for (const [, lng, lat] of D3_REFERENCE) {
    const comp = componentOf(lng, lat);
    const [x, y] = projectComponent(comp, lng, lat);
    const [ilng, ilat] = invertComponent(comp, x, y);
    assert.ok(Math.abs(ilng - lng) < 1e-6 && Math.abs(ilat - lat) < 1e-6, `${lng},${lat} → ${ilng},${ilat}`);
  }
});

const COMPONENT_BOUNDS: Record<MapComponent, Bounds> = {
  l48: { minX: 93, minY: 9, maxX: 867, maxY: 499 },
  ak: { minX: 31, minY: 381, maxX: 246, maxY: 497 },
  hi: { minX: 256, minY: 433, maxX: 353, maxY: 496 },
};

function placed(b: Bounds, a: { s: number; dx: number; dy: number }): Bounds {
  return { minX: b.minX * a.s + a.dx, minY: b.minY * a.s + a.dy, maxX: b.maxX * a.s + a.dx, maxY: b.maxY * a.s + a.dy };
}

const overlaps = (a: Bounds, b: Bounds) => a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;

test('portrait moves the insets under the lower 48 without overlap or stretching', () => {
  assert.equal(layoutKindFor(390, 844), 'portrait');
  assert.equal(layoutKindFor(1920, 1080), 'landscape');
  assert.equal(layoutKindFor(3440, 1440), 'landscape');
  const layout = buildLayout('portrait', COMPONENT_BOUNDS);
  const l48 = placed(COMPONENT_BOUNDS.l48, layout.affine.l48);
  const ak = placed(COMPONENT_BOUNDS.ak, layout.affine.ak);
  const hi = placed(COMPONENT_BOUNDS.hi, layout.affine.hi);
  assert.ok(!overlaps(l48, ak) && !overlaps(l48, hi) && !overlaps(ak, hi));
  assert.ok(ak.minY >= l48.maxY && hi.minY >= l48.maxY, 'insets sit below the lower 48');
  // Alaska and Hawaii share one uniform scale, so neither is distorted relative to the other.
  assert.equal(layout.affine.ak.s, layout.affine.hi.s);
  assert.ok(layout.bounds.maxY - layout.bounds.minY > (l48.maxY - l48.minY) * 1.1);
});

test('wall enlarges Alaska and Hawaii into the Pacific corner, clear of the border', () => {
  const layout = buildLayout('wall', COMPONENT_BOUNDS);
  const ak = placed(COMPONENT_BOUNDS.ak, layout.affine.ak);
  const hi = placed(COMPONENT_BOUNDS.hi, layout.affine.hi);
  assert.deepEqual(layout.affine.l48, { s: 1, dx: 0, dy: 0 }, 'the lower 48 never moves');
  assert.ok(layout.affine.ak.s > 1.2 && layout.affine.hi.s > 1.2, 'both insets read larger than geoAlbersUsa’s');
  assert.ok(!overlaps(ak, hi));
  // No lower-48 border point may fall inside an inset box.
  const border: Array<[string, number, number]> = [
    ['San Diego', -117.16, 32.7], ['Yuma', -114.6, 32.7], ['Nogales', -110.9, 31.3], ['El Paso', -106.5, 31.8],
    ['Big Bend', -103.2, 29.2], ['Del Rio', -100.9, 29.4], ['Laredo', -99.5, 27.5], ['Brownsville', -97.5, 25.9],
  ];
  const inside = (b: Bounds, [x, y]: [number, number]) => x > b.minX && x < b.maxX && y > b.minY && y < b.maxY;
  for (const [name, lng, lat] of border) {
    const p = project(lng, lat);
    assert.ok(!inside(ak, p) && !inside(hi, p), `${name} stays clear of the insets`);
  }
  // Still a wide composition: a 16:9 wall fills by height, not by a sliver.
  const aspect = (layout.bounds.maxX - layout.bounds.minX) / (layout.bounds.maxY - layout.bounds.minY);
  assert.ok(aspect > 1.5 && aspect < 1.9, `wall aspect ${aspect.toFixed(2)}`);
});

test('landscape is geoAlbersUsa’s own composition', () => {
  const layout = buildLayout('landscape', COMPONENT_BOUNDS);
  for (const c of ['l48', 'ak', 'hi'] as MapComponent[]) assert.deepEqual(layout.affine[c], { s: 1, dx: 0, dy: 0 });
  assert.equal(layout.bounds.minX, 31);
});

test('a view is carried across layouts as a place, not a layout point', () => {
  // Reported: a centred Anchorage view, carried by layout coordinates into the
  // wall layout (where Alaska moves and enlarges), landed near 64.9°N 145.8°W.
  const land = buildLayout('landscape', COMPONENT_BOUNDS);
  const wall = buildLayout('wall', COMPONENT_BOUNDS);
  for (const [name, lng, lat] of [['Anchorage', -149.9, 61.2], ['Honolulu', -157.86, 21.3], ['St. Louis', -90.2, 38.63]] as const) {
    const comp = componentOf(lng, lat);
    const [fx, fy] = projectComponent(comp, lng, lat);
    const a = land.affine[comp];
    const [lx, ly] = [fx * a.s + a.dx, fy * a.s + a.dy];
    // The old carry: same layout point in the new layout.
    const wrong = locate(wall, lx, ly);
    const [wlng, wlat] = invertComponent(wrong.component, wrong.x, wrong.y);
    if (comp !== 'l48') assert.ok(Math.hypot(wlng - lng, wlat - lat) > 1, `${name}: the layout point is a different place in the wall`);
    // The carry now: locate the place, then lay it out with the new affine.
    const here = locate(land, lx, ly);
    assert.equal(here.component, comp);
    const b = wall.affine[here.component];
    const back = locate(wall, here.x * b.s + b.dx, here.y * b.s + b.dy);
    const [glng, glat] = invertComponent(back.component, back.x, back.y);
    assert.ok(Math.abs(glng - lng) < 1e-6 && Math.abs(glat - lat) < 1e-6, `${name} stays ${lng},${lat} (got ${glng},${glat})`);
  }
});
