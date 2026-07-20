import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isValidEarthCoordinate,
  REPORT_CORRIDOR_MAX_DISTANCE_METERS,
  validateReportCorridor,
  type NearestRiverLookup,
} from './location';

const MISSOURI_RIVER_ID = '11111111-1111-4111-8111-111111111111';
const ARKANSAS_RIVER_ID = '22222222-2222-4222-8222-222222222222';

function matchingLookup(riverId: string): NearestRiverLookup {
  return async (args) => ({
    data: [{ river_id: riverId, distance_meters: 42, args }],
    error: null,
  });
}

test('coordinate validation supports published rivers beyond Missouri', () => {
  assert.equal(isValidEarthCoordinate(37.18, -91.17), true); // Missouri Ozarks
  assert.equal(isValidEarthCoordinate(35.98, -92.75), true); // Arkansas Ozarks
  assert.equal(isValidEarthCoordinate(-33.86, 151.2), true); // no state hardcode
  assert.equal(isValidEarthCoordinate(91, -91.17), false);
  assert.equal(isValidEarthCoordinate(37.18, -181), false);
});

test('corridor validation accepts matching Missouri and Arkansas rivers', async () => {
  const missouri = await validateReportCorridor(
    matchingLookup(MISSOURI_RIVER_ID),
    MISSOURI_RIVER_ID,
    37.18,
    -91.17
  );
  const arkansas = await validateReportCorridor(
    matchingLookup(ARKANSAS_RIVER_ID),
    ARKANSAS_RIVER_ID,
    35.98,
    -92.75
  );

  assert.deepEqual(missouri, { ok: true, distanceMeters: 42 });
  assert.deepEqual(arkansas, { ok: true, distanceMeters: 42 });
});

test('corridor validation rejects off-corridor and wrong-river points', async () => {
  const offCorridor = await validateReportCorridor(
    async (args) => {
      assert.equal(args.p_max_distance_meters, REPORT_CORRIDOR_MAX_DISTANCE_METERS);
      return { data: [], error: null };
    },
    MISSOURI_RIVER_ID,
    38.5,
    -90.2
  );
  const wrongRiver = await validateReportCorridor(
    matchingLookup(ARKANSAS_RIVER_ID),
    MISSOURI_RIVER_ID,
    36.0,
    -92.7
  );

  assert.deepEqual(offCorridor, { ok: false, reason: 'outside-corridor' });
  assert.deepEqual(wrongRiver, { ok: false, reason: 'different-river' });
});

test('corridor validation fails closed when PostGIS validation is unavailable', async () => {
  const result = await validateReportCorridor(
    async () => ({ data: null, error: new Error('unavailable') }),
    MISSOURI_RIVER_ID,
    37.18,
    -91.17
  );
  assert.deepEqual(result, { ok: false, reason: 'unavailable' });
});
