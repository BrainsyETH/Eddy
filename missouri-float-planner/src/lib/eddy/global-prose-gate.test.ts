// src/lib/eddy/global-prose-gate.test.ts
//
// The load-bearing case is the last one in the first block: a flood measured
// AFTER the summary was written must hide it, and a flood the summary already
// knew about must not. Getting that backwards either puts a cheerful statewide
// sentence over a flooding basin, or blanks the summary for every day of a
// long high-water spell.

import assert from 'node:assert/strict';
import test from 'node:test';
import { GLOBAL_PROSE_STALE_HOURS, gateGlobalProse } from './global-prose-gate';

const WRITTEN = '2026-08-02T11:10:00.000Z'; // the 6:10am Central cron
const NOW = new Date('2026-08-02T17:00:00.000Z'); // just under six hours later

test('shows when everything is ordinary', () => {
  const verdict = gateGlobalProse({
    generatedAt: WRITTEN,
    live: [
      { conditionCode: 'flowing', readingTimestamp: '2026-08-02T16:45:00.000Z' },
      { conditionCode: 'low', readingTimestamp: '2026-08-02T16:45:00.000Z' },
    ],
    now: NOW,
  });
  assert.deepEqual(verdict, { show: true });
});

test('high water alone does not hide it', () => {
  // "Running high" is an ordinary Ozark condition the generator is told to
  // mention. Blanking on it would blank the summary for most of the spring.
  const verdict = gateGlobalProse({
    generatedAt: WRITTEN,
    live: [{ conditionCode: 'high', readingTimestamp: '2026-08-02T16:45:00.000Z' }],
    now: NOW,
  });
  assert.deepEqual(verdict, { show: true });
});

test('a flood the summary already knew about does not hide it', () => {
  // Measured before the prose was written, so the generator saw it and was
  // instructed to lead with safety. Suppressing here throws away prose that
  // is doing exactly its job.
  const verdict = gateGlobalProse({
    generatedAt: WRITTEN,
    live: [{ conditionCode: 'dangerous', readingTimestamp: '2026-08-02T10:00:00.000Z' }],
    now: NOW,
  });
  assert.deepEqual(verdict, { show: true });
});

test('a flood measured AFTER the summary hides it', () => {
  // The whole point. A 6:10am summary cannot have known about noon's flood,
  // and "warm and steady across the eastern Ozarks" is then actively wrong.
  const verdict = gateGlobalProse({
    generatedAt: WRITTEN,
    live: [
      { conditionCode: 'flowing', readingTimestamp: '2026-08-02T16:45:00.000Z' },
      { conditionCode: 'dangerous', readingTimestamp: '2026-08-02T16:50:00.000Z' },
    ],
    now: NOW,
  });
  assert.deepEqual(verdict, { show: false, reason: 'flood-since-generation' });
});

test('a dangerous river with no reading time counts against it', () => {
  // It cannot be shown to predate the prose, and the one condition worth
  // failing closed on is the one that means "do not float".
  const verdict = gateGlobalProse({
    generatedAt: WRITTEN,
    live: [{ conditionCode: 'dangerous', readingTimestamp: null }],
    now: NOW,
  });
  assert.deepEqual(verdict, { show: false, reason: 'flood-since-generation' });
});

test('an unparseable reading time counts against it too', () => {
  const verdict = gateGlobalProse({
    generatedAt: WRITTEN,
    live: [{ conditionCode: 'dangerous', readingTimestamp: 'not a date' }],
    now: NOW,
  });
  assert.deepEqual(verdict, { show: false, reason: 'flood-since-generation' });
});

test('stale prose is hidden even with nothing wrong on the water', () => {
  const verdict = gateGlobalProse({
    generatedAt: WRITTEN,
    live: [{ conditionCode: 'flowing', readingTimestamp: null }],
    now: new Date(Date.parse(WRITTEN) + (GLOBAL_PROSE_STALE_HOURS + 0.1) * 3_600_000),
  });
  assert.deepEqual(verdict, { show: false, reason: 'stale' });
});

test('prose dated in the future is treated as stale, not fresh', () => {
  // A clock disagreement is not freshness, and a negative age would otherwise
  // sail past the staleness ceiling.
  const verdict = gateGlobalProse({
    generatedAt: '2026-08-03T11:10:00.000Z',
    live: [],
    now: NOW,
  });
  assert.deepEqual(verdict, { show: false, reason: 'stale' });
});

test('undated prose is never shown', () => {
  // It cannot carry an honest "as of" stamp, and an undated claim about
  // today's water is the thing this gate exists to prevent.
  for (const generatedAt of [null, undefined, '', 'whenever']) {
    assert.deepEqual(gateGlobalProse({ generatedAt, live: [], now: NOW }), {
      show: false,
      reason: 'undated',
    });
  }
});

test('an empty live set does not by itself hide fresh prose', () => {
  // No gauges answering is a fact about the request. The reading-age caveat
  // the card carries covers it; blanking here would hide the summary during
  // any provider outage.
  assert.deepEqual(gateGlobalProse({ generatedAt: WRITTEN, live: [], now: NOW }), { show: true });
});
