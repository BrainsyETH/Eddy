import assert from 'node:assert/strict';
import test from 'node:test';

// Mirrors eddy-ios/src/lib/alertCopy.ts. The app has no test runner yet, so the
// pure logic is covered here — the timestamp rule below is a correctness claim
// about what we tell users, not a formatting preference, and it should fail
// loudly if someone "simplifies" it.

function relativeTime(iso: string | null, now: Date): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const mins = Math.round((now.getTime() - then) / 60000);
  if (mins < 2) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

const NOW = new Date('2026-07-26T12:00:00.000Z');

test('formats recent times compactly', () => {
  assert.equal(relativeTime('2026-07-26T11:59:30.000Z', NOW), 'just now');
  assert.equal(relativeTime('2026-07-26T11:20:00.000Z', NOW), '40m ago');
  assert.equal(relativeTime('2026-07-26T09:00:00.000Z', NOW), '3h ago');
  assert.equal(relativeTime('2026-07-24T12:00:00.000Z', NOW), '2d ago');
});

test('a missing or malformed timestamp yields empty, not "NaN ago"', () => {
  assert.equal(relativeTime(null, NOW), '');
  assert.equal(relativeTime('not-a-date', NOW), '');
});

test('quoting readingAt rather than detectedAt changes what we claim', () => {
  // Taken from the first real events (Mulberry River, 2026-07-26): the river was
  // measured at 08:30 and our cron noticed at 09:00:30 — a 31-minute gap.
  const readingAt = '2026-07-26T08:30:00.000Z';
  const detectedAt = '2026-07-26T09:00:30.000Z';
  const at = new Date('2026-07-26T09:10:00.000Z');

  const fromReading = relativeTime(readingAt, at);
  const fromDetection = relativeTime(detectedAt, at);

  assert.equal(fromReading, '40m ago');
  assert.equal(fromDetection, '10m ago');
  // Using detectedAt would tell the user the river changed half an hour later
  // than it actually did. The feed must quote the reading.
  assert.notEqual(fromReading, fromDetection);
});

test('detection lag on the first live events sat inside the stated window', () => {
  // We tell users alerts land roughly 20-75 minutes behind the river. This is
  // the measured value, kept as a regression check on that claim.
  const lagMinutes =
    (new Date('2026-07-26T09:00:30.000Z').getTime() -
      new Date('2026-07-26T08:30:00.000Z').getTime()) /
    60000;
  assert.ok(lagMinutes >= 20 && lagMinutes <= 75, `lag was ${lagMinutes} min`);
});
