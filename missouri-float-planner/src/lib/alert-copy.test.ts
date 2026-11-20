import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { CONDITION_KINDS } from '../../../eddy-ios/src/lib/alertKinds';

import { alertDetail, lastSentNote, relativeTime, staleReadingNote } from '../../../eddy-ios/src/lib/alertCopy';
import type { AlertFeedEntry } from '../../../packages/eddy-types';

const NOW = new Date('2026-07-26T12:00:00.000Z');

test('new alert flows present Safety as the default choice', () => {
  assert.equal(CONDITION_KINDS[0]?.value, 'safety');
  assert.deepEqual(
    CONDITION_KINDS.map((kind) => kind.value),
    ['safety', 'floatable', 'all'],
  );
});

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

test('the feed reports the observation age only when the gauge supplies it', () => {
  const entry = { readingValue: 3100, readingUnit: 'cfs', detectedAt: NOW.toISOString() } as AlertFeedEntry;
  assert.equal(alertDetail({ ...entry, readingAt: null }, NOW), '3,100 cfs');
  assert.equal(alertDetail({ ...entry, readingAt: '2026-07-26T11:20:00Z' }, NOW), '3,100 cfs 40m ago');
});

test('manage rows distinguish a notification from a gauge trigger and a missing reading', () => {
  const rule = { enabled: false, createdAt: '2026-07-01T12:00:00Z', lastTriggeredAt: '2026-07-26T11:20:00Z' };
  assert.equal(lastSentNote({ ...rule, source: 'river_condition' }, NOW), 'Paused. Last sent 40m ago.');
  assert.equal(lastSentNote({ ...rule, source: 'gauge' }, NOW), 'Paused. Met its trigger 40m ago.');
  assert.equal(staleReadingNote({ source: 'gauge', enabled: true, readingStale: true, lastReadingAt: null }, NOW, 'Sullivan'),
    'Waiting for a reading from Sullivan. No usable reading yet.');
});

test('alert surfaces explain observation lag without promising a delivery window', () => {
  const primer = readFileSync('../eddy-ios/src/components/PushPrimer.tsx', 'utf8');
  const tab = readFileSync('../eddy-ios/app/(tabs)/(alerts)/alerts.tsx', 'utf8');
  assert.match(primer, /second reading to confirm/i);
  assert.match(tab, /time on each reading/i);
});

test('the collapsed web alerts region keeps an accessible section heading', () => {
  const page = readFileSync('src/app/rivers/[state]/[slug]/page.tsx', 'utf8');
  assert.match(page, /<section id="alerts"[\s\S]*<h2 className="sr-only">Alerts<\/h2>/);
});
