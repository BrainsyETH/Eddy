import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSnooze, premiumExcerpt, snoozeDeadline } from '../../../eddy-ios/src/lib/todayPresentation';
const now = new Date(2026, 8, 16, 19, 30).getTime();
test('snooze all expires at the chosen deadline, including rest of today', () => {
  assert.equal(snoozeDeadline('hour', now), now + 3_600_000);
  assert.equal(snoozeDeadline('day', now), now + 24 * 3_600_000);
  assert.equal(snoozeDeadline('today', now), new Date(2026, 8, 17).getTime());
  for (const choice of ['hour', 'today', 'day'] as const) {
    const until = snoozeDeadline(choice, now);
    assert.equal(parseSnooze(String(until), until - 1), until);
    assert.equal(parseSnooze(String(until), until), 0);
  }
});
test('bad persisted snooze values cannot hide alerts indefinitely', () => {
  for (const value of [null, '', 'garbage', 'Infinity', '-1', String(now - 1), String(now + 26 * 3_600_000)]) assert.equal(parseSnooze(value, now), 0);
  assert.equal(parseSnooze('0', now), 0, 'Show alerts clears the deadline');
});
test('Premium excerpt keeps report words while removing presentation markup', () => {
  assert.equal(premiumExcerpt('## Eddy’s Read\n\n**Watch the rise.** Check [the gauge](https://example.com).'), 'Eddy’s Read Watch the rise. Check the gauge.');
  assert.equal(premiumExcerpt('   '), '');
  assert.equal(premiumExcerpt('Short report.'), 'Short report.');
  const report = 'Watch the rising water at the next access point. '.repeat(20);
  const excerpt = premiumExcerpt(report);
  assert.ok(excerpt.length <= 321);
  assert.ok(excerpt.endsWith('…'));
  assert.ok(report.startsWith(excerpt.slice(0, -1)));
});
