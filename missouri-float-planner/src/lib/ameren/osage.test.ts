import assert from 'node:assert/strict';
import test from 'node:test';
import {
  centralWallClockToUtc,
  parseOsageRows,
  parseTrumanBlock,
} from './osage';

// Fixtures are verbatim shapes from the live API, 2026-08-15 — numbers as
// strings, Central wall-clock stamps. Every malformed case below is a way an
// uncontracted endpoint can drift, and each must fail closed.

test('a Central wall-clock stamp converts through both offsets correctly', () => {
  // Summer (CDT, UTC-5): 00:00 local on 2026-08-14 is 05:00Z — the exact pair
  // the SHEF feed confirmed against the JSON on the live probe.
  assert.equal(
    centralWallClockToUtc('2026-08-14T00:00:00'),
    Date.parse('2026-08-14T05:00:00Z')
  );
  // Winter (CST, UTC-6).
  assert.equal(
    centralWallClockToUtc('2026-01-14T00:00:00'),
    Date.parse('2026-01-14T06:00:00Z')
  );
});

test('the spring-forward gap fails closed and the fall-back repeat errs old', () => {
  // 2026-03-08 02:30 Central never happened — a stamp inside the gap is
  // broken input, not a puzzle, and the row carrying it gets dropped.
  assert.equal(centralWallClockToUtc('2026-03-08T02:30:00'), null);
  // 2026-11-01 01:30 Central happened twice. The EARLIER instant (CDT) wins:
  // reading the value as older understates freshness, the same direction the
  // SWPA retrieval timestamp errs, and the safe one for staleness banners.
  assert.equal(
    centralWallClockToUtc('2026-11-01T01:30:00'),
    Date.parse('2026-11-01T06:30:00Z')
  );
});

test('rows parse to numbers, sorted, with malformed rows dropped individually', () => {
  const rows = parseOsageRows([
    // Out of order on purpose — callers take "latest" from the tail.
    {
      dateTimeStamp: '2026-08-14T01:00:00',
      headWaterLevel: '659.32',
      tailWaterLevel: '555.19',
      discharge: '2569.74',
      intakeDO: '0.10',
      intakeTDG: '101.94',
    },
    {
      dateTimeStamp: '2026-08-14T00:00:00',
      headWaterLevel: '659.31',
      tailWaterLevel: '555.70',
      discharge: '1555.04',
    },
    // Each defect drops ITS row and no other:
    { dateTimeStamp: '2026-08-14T02:00:00', headWaterLevel: 'n/a', tailWaterLevel: '1', discharge: '1' },
    { dateTimeStamp: 'not a stamp', headWaterLevel: '1', tailWaterLevel: '1', discharge: '1' },
    { dateTimeStamp: '2026-08-14T03:00:00', headWaterLevel: '659', tailWaterLevel: '555', discharge: '-40' },
    'not even an object',
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].dischargeCfs, 1555.04);
  assert.equal(rows[1].headwaterFt, 659.32);
  assert.ok(rows[0].timestamp < rows[1].timestamp, 'sorted oldest first');
});

test('a body that is not an array is an empty answer, never a throw', () => {
  assert.deepEqual(parseOsageRows(null), []);
  assert.deepEqual(parseOsageRows({ dischargeData: [] }), []);
  assert.deepEqual(parseOsageRows('Service Unavailable'), []);
});

test('the Truman block parses whole or not at all', () => {
  const good = parseTrumanBlock({
    dischargeData: [],
    levelandFlowData: {
      dateTimeStamp: '2026-08-14T23:30:00',
      hstDamHeadLevelAtMidnight: '705.51',
      damOutflow: '1509.20',
      lakeOzarkInflowYesterday: '3227.00',
      prescribedMinFlow: '1142.00',
      bagnellDamAnticipatedDischargeToday: '8000.00',
    },
  });
  assert.ok(good);
  assert.equal(good.poolElevationFt, 705.51);
  assert.equal(good.outflowCfs, 1509.2);
  assert.equal(good.timestamp, Date.parse('2026-08-15T04:30:00Z'));

  // A partial block must not become a partial claim about a dam.
  assert.equal(
    parseTrumanBlock({
      levelandFlowData: { dateTimeStamp: '2026-08-14T23:30:00', damOutflow: '1509.20' },
    }),
    null
  );
  assert.equal(parseTrumanBlock({ levelandFlowData: null }), null);
  assert.equal(parseTrumanBlock(null), null);
});
