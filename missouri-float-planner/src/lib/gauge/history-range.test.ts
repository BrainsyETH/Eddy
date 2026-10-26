import assert from 'node:assert/strict';
import test from 'node:test';
import {
  historyRangeDays,
  historyRequest,
  validateHistoryDates,
} from './history-range';

const now = new Date(2026, 9, 26, 12);
test('custom history rejects reversed, invalid, future and unsupported windows before requesting data', () => {
  assert.match(validateHistoryDates('', '', 366, now)!, /valid/);
  assert.match(
    validateHistoryDates('2026-02-30', '2026-03-01', 366, now)!,
    /valid/,
  );
  assert.match(
    validateHistoryDates('2026-10-05', '2026-10-04', 366, now)!,
    /on or after/,
  );
  assert.match(
    validateHistoryDates('2026-10-25', '2026-10-27', 366, now)!,
    /today/,
  );
  assert.match(
    validateHistoryDates('2025-01-01', '2026-10-01', 366, now)!,
    /366/,
  );
  assert.equal(
    validateHistoryDates('2026-10-26', '2026-10-26', 366, now),
    null,
  );
});
test('custom requests preserve picked local dates across DST without changing comparison eligibility', () => {
  const previous = process.env.TZ;
  try {
    process.env.TZ = 'America/Chicago';
    const range = {
      kind: 'custom' as const,
      from: '2026-03-08',
      to: '2026-03-08',
    };
    assert.equal(historyRangeDays(range), 1);
    assert.deepEqual(historyRequest(range), {
      days: 30,
      window: {
        from: '2026-03-08T06:00:00.000Z',
        to: '2026-03-09T04:59:59.999Z',
        resolution: 'auto',
      },
    });
    assert.equal(
      historyRangeDays({
        kind: 'custom',
        from: '2026-03-01',
        to: '2026-03-30',
      }),
      30,
    );
    assert.deepEqual(historyRequest({ kind: 'days', days: 365 }), {
      days: 365,
      window: null,
    });
  } finally {
    if (previous === undefined) delete process.env.TZ;
    else process.env.TZ = previous;
  }
});
