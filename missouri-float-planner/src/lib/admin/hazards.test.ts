import test from 'node:test';
import assert from 'node:assert/strict';
import { adminPermission } from './permissions';
import { ageLabel, daysSince, estimateRiverMile, parseHazardBody } from './hazards';

const river = '9b2f3c4d-1111-4222-8333-444455556666';
const base = { name: ' Marble Creek dam ', riverId: river, type: 'low_water_dam', latitude: 37.5, longitude: -90.5 };

test('creating a hazard needs a name, river, type and location', () => {
  const ok = parseHazardBody({ ...base, riverMileDownstream: '31.4', portageSide: '' }, 'create');
  assert.ok('write' in ok);
  assert.deepEqual(ok.write, {
    name: 'Marble Creek dam',
    river_id: river,
    type: 'low_water_dam',
    portage_side: null,
    river_mile_downstream: 31.4,
    location: 'SRID=4326;POINT(-90.5 37.5)',
  });
  for (const bad of [
    { ...base, name: ' ' },
    { ...base, riverId: null },
    { ...base, riverId: '' },
    { ...base, type: 'whirlpool' },
    { ...base, latitude: null },
    { ...base, latitude: 137 },
    { ...base, riverMileDownstream: -1 },
    { ...base, riverMileDownstream: 'far' },
    { ...base, severity: 'extreme' },
    { ...base, portageSide: 'up' },
    { ...base, active: 'yes' },
  ])
    assert.ok('error' in parseHazardBody(bad, 'create'), JSON.stringify(bad));
});

test('an update validates only what it is given, and keeps mile 0', () => {
  assert.deepEqual(parseHazardBody({ active: false }, 'update'), { write: { active: false } });
  assert.deepEqual(parseHazardBody({ riverMileDownstream: 0 }, 'update'), { write: { river_mile_downstream: 0 } });
  assert.deepEqual(parseHazardBody({ riverMileDownstream: null, seasonalNotes: ' ' }, 'update'), {
    write: { river_mile_downstream: null, seasonal_notes: null },
  });
  assert.deepEqual(parseHazardBody({ confirmCurrent: true }, 'update'), { write: {} });
  // A river can be changed but never cleared: public readers look hazards up by river.
  assert.ok('error' in parseHazardBody({ riverId: null }, 'update'));
  // Half a coordinate is not a location.
  assert.ok('error' in parseHazardBody({ latitude: 37.5 }, 'update'));
});

test('age reads in plain words', () => {
  const now = Date.parse('2026-11-12T12:00:00Z');
  assert.equal(daysSince('2026-11-12T01:00:00Z', now), 0);
  assert.equal(daysSince('2026-10-01T12:00:00Z', now), 42);
  assert.equal(daysSince('nonsense', now), null);
  assert.equal(ageLabel(0), 'Checked today');
  assert.equal(ageLabel(42), 'Checked 42 days ago');
  assert.equal(ageLabel(200), 'Checked 7 months ago');
  assert.equal(ageLabel(null), 'Never checked');
});

test('a river mile estimate interpolates between the nearest access points on the river’s own numbering', () => {
  // Miles here are NOT geometric: 10 miles of numbering over ~11 km of line.
  const controls = [
    { name: 'Upper', mile: 20, lat: 37.0, lng: -91.0 },
    { name: 'Middle', mile: 30, lat: 37.1, lng: -91.0 },
    { name: 'Lower', mile: 34, lat: 37.2, lng: -91.0 },
  ];
  const est = estimateRiverMile({ lat: 37.075, lng: -91.001 }, controls);
  assert.ok(est);
  assert.equal(est.mile, 27.5);
  assert.deepEqual(est.between.map((c) => c.name), ['Upper', 'Middle']);
  assert.ok(est.offLineMetres < 150);
  // Past the last access point it holds at that point's mile rather than extrapolating.
  assert.equal(estimateRiverMile({ lat: 37.25, lng: -91.0 }, controls)?.mile, 34);
});

test('no estimate without two usable access points, or far from the river', () => {
  const one = [{ name: 'Only', mile: 5, lat: 37, lng: -91 }];
  assert.equal(estimateRiverMile({ lat: 37, lng: -91 }, one), null);
  const two = [...one, { name: 'Next', mile: 9, lat: 37.05, lng: -91 }];
  assert.equal(estimateRiverMile({ lat: 38.5, lng: -93 }, two), null);
  assert.equal(estimateRiverMile({ lat: 37.02, lng: -91 }, [...one, { name: 'Bad', mile: NaN, lat: 37.05, lng: -91 }]), null);
});

test('editors can read the mile hint; moderators cannot', () => {
  assert.equal(adminPermission('editor', '/api/admin/hazards/mile-hint', 'GET'), true);
  assert.equal(adminPermission('moderator', '/api/admin/hazards/mile-hint', 'GET'), false);
});
