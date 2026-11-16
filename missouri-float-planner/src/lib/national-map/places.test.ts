import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { decodeGeometry, GEOMETRY_VERSION, type DecodedLine } from './geometry';
import { buildLocator, locatorBox, locatorPoint } from './locator';
import type { Site } from './marks';
import { BASIN_NAMES, extentSpan, inPlace, inPolygons, lineRegions, parsePlace, placeExtent, placeMembers, placeOptions, placePolygons, STATE_NAMES } from './places';
import { project } from './projection';

const geometry = decodeGeometry(JSON.parse(readFileSync(path.join(process.cwd(), `public/river-map/geometry/base.v${GEOMETRY_VERSION}.json`), 'utf8')));

const site = (key: string, lng: number, lat: number, stateCode: string | null, huc2: string | null): Site => {
  const [x, y] = project(lng, lat);
  return { key, kind: 'usgs', siteId: key, lid: null, name: key, stateCode, waterbody: null, curated: false, lng, lat, component: 'l48', x, y, reading: null, nws: null, huc2 };
};

test('places parse from the share link: a state by postal code, a water-resources region by HUC', () => {
  assert.deepEqual(parsePlace('MO'), { kind: 'state', id: 'MO', name: 'Missouri', key: 'MO' });
  assert.deepEqual(parsePlace('mo')?.key, 'MO');
  assert.deepEqual(parsePlace('huc05'), { kind: 'basin', id: '05', name: 'Ohio region', key: 'huc05' });
  assert.equal(parsePlace('huc21'), null, 'the Caribbean region is outside the map');
  assert.equal(parsePlace('XX'), null);
  assert.equal(parsePlace(null), null);
  const { states, basins } = placeOptions();
  assert.equal(states.length, 51, '50 states and DC');
  assert.equal(basins.length, 20);
  assert.equal(Object.keys(STATE_NAMES).length, 51);
  assert.equal(Object.keys(BASIN_NAMES).length, 20);
});

test('membership: a gauge by its own state and HUC; an NWS-only point by NOAA state, never a region', () => {
  const gauge = site('a', -91, 38.5, 'MO', '07');
  assert.ok(inPlace(gauge, parsePlace('MO')!));
  assert.ok(inPlace(gauge, parsePlace('huc07')!));
  assert.ok(!inPlace(gauge, parsePlace('huc10')!));
  const nwsOnly = { ...site('b', -91, 38.5, 'MO', null), kind: 'nws' as const };
  assert.ok(inPlace(nwsOnly, parsePlace('MO')!));
  assert.ok(!inPlace(nwsOnly, parsePlace('huc07')!));
  assert.deepEqual([...placeMembers([gauge, site('c', -100, 40, 'KS', '10')], parsePlace('MO')!)], [1, 0]);
});

test('a state frames to its outline; a water-resources region to its gauges, ignoring a stray one', () => {
  const mo = parsePlace('MO')!;
  const ext = placeExtent(geometry, [], new Uint8Array(0), mo);
  assert.equal(ext.length, 1);
  assert.equal(ext[0].component, 'l48');
  const [sx, sy] = project(-92.3, 38.5); // Jefferson City-ish
  assert.ok(inPolygons(placePolygons(geometry, mo), 'l48', sx, sy), 'inside Missouri');
  const [kx, ky] = project(-98, 38.5); // Kansas
  assert.ok(!inPolygons(placePolygons(geometry, mo), 'l48', kx, ky), 'Kansas is not Missouri');

  const ohio = parsePlace('huc05')!;
  const sites = Array.from({ length: 200 }, (_, i) => site(`o${i}`, -86 + (i % 20) * 0.3, 38 + Math.floor(i / 20) * 0.3, null, '05'));
  sites.push(site('stray', -120, 45, null, '05')); // a mis-coded gauge in Oregon
  const b = placeExtent(geometry, sites, placeMembers(sites, ohio), ohio);
  const [ox] = project(-120, 45);
  assert.ok(b[0].bounds.minX > ox, 'the stray gauge does not stretch the frame across the country');
  assert.ok(extentSpan(b) > 0);
  assert.deepEqual(placePolygons(geometry, ohio), [], 'no outline for a region');
});

test('river lines take the region of the gauges along them', () => {
  const l: DecodedLine = { component: 'l48', order: 6, name: 'Test River', xy: new Float32Array([100, 100, 110, 100, 120, 100]), length: 20, down: -1, downAt: 0 };
  const far: DecodedLine = { ...l, xy: new Float32Array([400, 400, 410, 400]) };
  const mk = (x: number, huc: string): Site => ({ ...site('s', 0, 0, null, huc), x, y: 101 });
  assert.deepEqual(lineRegions([l, far], [mk(102, '05'), mk(110, '05'), mk(119, '07')]), ['05', null]);
});

test('the story locator draws every state and frames a region', () => {
  const loc = buildLocator(geometry);
  assert.equal(loc.states.length, geometry.states.length);
  assert.ok(loc.states.every((s) => s.d.startsWith('M')));
  const box = locatorBox(loc, ['MO']);
  assert.ok(box.maxX - box.minX < (loc.viewBox.maxX - loc.viewBox.minX) / 4, 'Missouri is a small part of the country');
  assert.deepEqual(locatorBox(loc, null), loc.viewBox);
  const [x, y] = locatorPoint(loc, 'l48', ...project(-92.3, 38.5));
  assert.ok(x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY, 'a Missouri gauge lands inside Missouri on the locator');
});
