// src/lib/eddy/global-prose-gate.test.ts
//
// The load-bearing pair is the two "flood" cases: a flood that arrived AFTER
// the summary was written must hide it, and a flood the summary was written
// during must not. Getting that backwards either puts a cheerful statewide
// sentence over a flooding basin, or blanks the summary for every day of a long
// high-water spell.
//
// The second of those is not hypothetical. It is what shipped: the rule was
// expressed against the river's latest READING timestamp, a gauge reports every
// fifteen minutes, so "the summary predates the reading" was true of every
// flooded river within the quarter hour and the statewide summary went missing
// for as long as any one river stayed high. Hence `conditionWhenWritten`, and
// hence the fixture below where a flood has been running for days.

import assert from 'node:assert/strict';
import test from 'node:test';
import { GLOBAL_PROSE_STALE_HOURS, gateGlobalProse } from './global-prose-gate';

const WRITTEN = '2026-08-02T11:10:00.000Z'; // the 6:10am Central cron
const NOW = new Date('2026-08-02T17:00:00.000Z'); // just under six hours later

test('shows when everything is ordinary', () => {
  const verdict = gateGlobalProse({
    generatedAt: WRITTEN,
    live: [
      { conditionCode: 'flowing', conditionWhenWritten: 'flowing' },
      { conditionCode: 'low', conditionWhenWritten: 'low' },
    ],
    now: NOW,
  });
  assert.deepEqual(verdict, { show: true });
});

test('high water alone does not hide it', () => {
  // "Running high" is an ordinary Ozark condition the generator is told to
  // mention. Blanking on it would blank the summary for most of the spring.
  // Note this holds even when the river CHANGED into high after the prose: only
  // 'dangerous' is severe enough to contradict a summary outright.
  const verdict = gateGlobalProse({
    generatedAt: WRITTEN,
    live: [{ conditionCode: 'high', conditionWhenWritten: 'good' }],
    now: NOW,
  });
  assert.deepEqual(verdict, { show: true });
});

test('a flood the summary was written during does not hide it', () => {
  // The river was already in flood in the snapshot the generator read, so the
  // prose leads with safety. Suppressing here throws away prose doing its job.
  const verdict = gateGlobalProse({
    generatedAt: WRITTEN,
    live: [{ conditionCode: 'dangerous', conditionWhenWritten: 'dangerous' }],
    now: NOW,
  });
  assert.deepEqual(verdict, { show: true });
});

test('a long-running flood does not hide it either — the regression', () => {
  // The shipped bug, stated as a test. Big River had been in flood for days and
  // the 11:15 summary opened by saying so; because its gauge had reported again
  // at 11:51, the old rule read that as a flood the summary could not have
  // known about and withheld the statewide report from every client. Nothing
  // about "the river has been measured since" says anything about what the
  // prose knew.
  const verdict = gateGlobalProse({
    generatedAt: WRITTEN,
    live: [
      { conditionCode: 'flowing', conditionWhenWritten: 'flowing' },
      { conditionCode: 'dangerous', conditionWhenWritten: 'dangerous' },
    ],
    now: NOW,
  });
  assert.deepEqual(verdict, { show: true });
});

test('a flood that arrived AFTER the summary hides it', () => {
  // The whole point. A 6:10am summary written while the Meramec was merely
  // high cannot speak for the noon flood, and "warm and steady across the
  // eastern Ozarks" is then actively wrong.
  const verdict = gateGlobalProse({
    generatedAt: WRITTEN,
    live: [
      { conditionCode: 'flowing', conditionWhenWritten: 'flowing' },
      { conditionCode: 'dangerous', conditionWhenWritten: 'high' },
    ],
    now: NOW,
  });
  assert.deepEqual(verdict, { show: false, reason: 'flood-since-generation' });
});

test('a dangerous river we hold no prose-time condition for counts against it', () => {
  // No update row old enough to have been an input — generation failed for it,
  // or its only row postdates the summary. It cannot be shown that the prose
  // knew, and the one condition worth failing closed on is the one that means
  // "do not float".
  const verdict = gateGlobalProse({
    generatedAt: WRITTEN,
    live: [{ conditionCode: 'dangerous', conditionWhenWritten: null }],
    now: NOW,
  });
  assert.deepEqual(verdict, { show: false, reason: 'flood-since-generation' });
});

test('an unknown prose-time condition counts against it too', () => {
  // 'unknown' is what a row with no computable condition stores. It is not
  // evidence the generator saw a flood.
  const verdict = gateGlobalProse({
    generatedAt: WRITTEN,
    live: [{ conditionCode: 'dangerous', conditionWhenWritten: 'unknown' }],
    now: NOW,
  });
  assert.deepEqual(verdict, { show: false, reason: 'flood-since-generation' });
});

test('stale prose is hidden even with nothing wrong on the water', () => {
  const verdict = gateGlobalProse({
    generatedAt: WRITTEN,
    live: [{ conditionCode: 'flowing', conditionWhenWritten: 'flowing' }],
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
