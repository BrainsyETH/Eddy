import assert from 'node:assert/strict';
import test from 'node:test';
import { clampToBounds, fitBounds, frameBox, MAX_ZOOM, MIN_ZOOM, toLayout, toScreen, zoomAt, zoomFactor } from './camera';
import { DEFAULT_PREFS, parsePrefs, parseSharedView, PREFS_KEY, sharedViewQuery } from './prefs';
import { buildSearchIndex, search } from './search';
import { GridIndex } from './spatial-index';
import type { Site } from './marks';

const B = { minX: 0, minY: 0, maxX: 960, maxY: 500 };
const VP = { width: 1920, height: 1080 };

test('the camera fits the composition and zooms about the pointer', () => {
  const fit = fitBounds(B, VP, undefined, 0);
  assert.equal(fit.scale, 2);
  const z = zoomAt(fit, fit, 2, 500, 400);
  const before = toLayout(fit, 500, 400);
  const after = toLayout(z, 500, 400);
  assert.ok(Math.abs(before[0] - after[0]) < 1e-9 && Math.abs(before[1] - after[1]) < 1e-9, 'the point under the pointer stays put');
  assert.equal(zoomFactor(zoomAt(fit, fit, 1e6, 0, 0), fit), MAX_ZOOM);
  assert.equal(zoomFactor(zoomAt(fit, fit, 1e-6, 0, 0), fit), MIN_ZOOM);
  const [sx, sy] = toScreen(z, ...after);
  assert.ok(Math.abs(sx - 500) < 1e-9 && Math.abs(sy - 400) < 1e-9);
});

test('the country can never be flung off a wall display', () => {
  const fit = fitBounds(B, VP);
  const lost = clampToBounds({ ...fit, tx: -1e6 }, B, VP);
  assert.ok(B.maxX * lost.scale + lost.tx >= 80);
});

test('framing a small box stops at a sensible zoom', () => {
  const fit = fitBounds(B, VP);
  const cam = frameBox({ minX: 500, minY: 200, maxX: 500.01, maxY: 200.01 }, VP, fit, { top: 0, right: 0, bottom: 0, left: 0 }, 12);
  assert.ok(Math.abs(zoomFactor(cam, fit) - 12) < 1e-9);
});

test('preferences are scoped to this page and never restore fullscreen or a tour', () => {
  assert.equal(PREFS_KEY, 'eddy-river-map-prefs-v1');
  assert.ok(!PREFS_KEY.includes('gauge-layers') && !PREFS_KEY.includes('plan'), 'never the planner’s keys');
  assert.deepEqual(parsePrefs(null), DEFAULT_PREFS);
  assert.deepEqual(parsePrefs('{bad'), DEFAULT_PREFS);
  assert.deepEqual(parsePrefs(JSON.stringify({ view: 'flooding', appearance: 'dark', motion: false, wallText: 'none', fullscreen: true, tour: true })), {
    view: 'flooding', appearance: 'dark', motion: false, wallText: 'none', flowColors: 'eddy',
  });
  assert.equal(DEFAULT_PREFS.wallText, 'legend', 'fullscreen keeps a legend by default');
  assert.equal(parsePrefs(JSON.stringify({ displayDetails: true })).wallText, 'story', 'the old details choice carries over');
  assert.equal(parsePrefs(JSON.stringify({ displayDetails: false })).wallText, 'legend');
  assert.equal(DEFAULT_PREFS.flowColors, 'eddy', 'the vivid Flow colours are opt-in');
  assert.equal(parsePrefs(JSON.stringify({ flowColors: 'vivid' })).flowColors, 'vivid');
  assert.equal(parsePrefs(JSON.stringify({ flowColors: 'neon' })).flowColors, 'eddy');
  assert.equal(parsePrefs(JSON.stringify({ view: 'change' })).view, 'flow', 'unknown views fall back to Flow');
  assert.equal(DEFAULT_PREFS.appearance, 'system');
  assert.equal(DEFAULT_PREFS.view, 'flow');
});

test('share links carry geography and view only', () => {
  assert.deepEqual(parseSharedView('?view=flooding&at=-92.1,38.2,4.5'), { view: 'flooding', center: { lng: -92.1, lat: 38.2, zoom: 4.5 } });
  assert.deepEqual(parseSharedView('?at=999,0,2&view=x'), { view: null, center: null });
  assert.equal(sharedViewQuery('flow', { lng: -92.1, lat: 38.2, zoom: 1 }), '', 'the national overview needs no parameters');
  assert.equal(sharedViewQuery('flooding', { lng: -92.12345, lat: 38.2, zoom: 4.5 }), '?view=flooding&at=-92.123%2C38.200%2C4.5');
});

const site = (siteId: string, name: string, stateCode: string, waterbody: string | null, x = 0, y = 0): Site => ({
  key: `usgs:${siteId}`, kind: 'usgs', siteId, lid: null, name, stateCode, waterbody, curated: false,
  lng: 0, lat: 0, component: 'l48', x, y, reading: null, nws: null,
});

test('search finds stations by ID, states by name, rivers by waterbody', () => {
  const sites = [
    site('07019000', 'Meramec River near Eureka, MO', 'MO', 'Meramec River'),
    site('07014500', 'Meramec River near Sullivan, MO', 'MO', 'Meramec River'),
    site('03612600', 'Ohio River at Olmsted, IL', 'IL', 'Ohio River'),
  ];
  const index = buildSearchIndex(sites);
  assert.deepEqual(search(index, '0701').map((r) => r.kind === 'site' && r.index), [0, 1]);
  assert.deepEqual(search(index, 'USGS 07019000').map((r) => r.label), ['Meramec River near Eureka, MO']);
  const missouri = search(index, 'missouri');
  assert.equal(missouri[0].kind, 'state');
  const meramec = search(index, 'meramec');
  assert.equal(meramec[0].kind, 'river');
  assert.equal(meramec[0].kind === 'river' && meramec[0].siteIndices.length, 2);
  assert.ok(search(index, 'olmsted').some((r) => r.label.startsWith('Ohio River at Olmsted')));
  assert.deepEqual(search(index, '   '), []);
});

test('the grid index returns hits nearest first and honours the drawn filter', () => {
  const xs = [10, 10.5, 30];
  const ys = [10, 10, 30];
  const index = new GridIndex(xs, ys, 6);
  assert.deepEqual(index.near(10.4, 10, 2), [1, 0]);
  assert.deepEqual(index.near(10.4, 10, 2, (i) => i !== 1), [0]);
  assert.deepEqual(index.near(100, 100, 5), []);
});
