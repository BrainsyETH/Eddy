import assert from 'node:assert/strict';
import test from 'node:test';

import { HOUR_MS } from './rule';
import { describeCollection, trialMode, type PassMark, type TrialReadings } from './status';

const NOW = Date.UTC(2026, 10, 13, 18, 40);
const ago = (hours: number) => new Date(NOW - hours * HOUR_MS).toISOString();
const active = (hours: number, errors = 0): PassMark => ({ state: 'active', ranAt: ago(hours), errors });
const paused = (hours: number): PassMark => ({ state: 'paused', ranAt: ago(hours), errors: 0 });
const said = (mode: Parameters<typeof describeCollection>[0], readings: TrialReadings) => {
  const { state, headline, detail, at } = describeCollection(mode, readings, NOW);
  return [state, `${headline} · ${detail}`, at];
};

test('only the two documented values switch the trial on or pause it', () => {
  assert.equal(trialMode('true'), 'on');
  assert.equal(trialMode('paused'), 'paused');
  for (const value of [undefined, '', 'false', 'TRUE', '1']) assert.equal(trialMode(value), 'off');
});

test('switched off reads as off, and says whether anything was ever collected', () => {
  // Before the migration is applied the tables do not exist: nothing can have been collected.
  assert.deepEqual(said('off', 'not-created'), ['off', 'Off · Collection hasn’t started', null]);
  assert.deepEqual(said('off', { passes: [], logged: 0 }), ['off', 'Off · Collection hasn’t started', null]);
  assert.deepEqual(said('off', { passes: [paused(30), active(50)], logged: 4 }), ['off', 'Off · Last collected', ago(50)]);
  assert.deepEqual(said('off', 'unavailable'), ['off', 'Off · Collection history could not be read', null]);
});

test('a deliberate pause is not shown as off or as a failure', () => {
  assert.deepEqual(said('paused', { passes: [paused(0.1), active(5)], logged: 4 }), ['paused', 'Paused · Existing results retained', null]);
});

test('collecting says when it last checked, or that no release has qualified yet', () => {
  assert.deepEqual(said('on', { passes: [active(0.1), active(1.1)], logged: 0 }), ['collecting', 'Collecting · No qualifying release yet', null]);
  assert.deepEqual(said('on', { passes: [active(0.1), active(1.1)], logged: 3 }), ['collecting', 'Collecting · Last checked', ago(0.1)]);
  // Just switched on, and just resumed from a pause: the next hourly pass has not run.
  assert.deepEqual(said('on', { passes: [], logged: 0 }), ['collecting', 'Collecting · Waiting for the first check', null]);
  assert.deepEqual(said('on', { passes: [paused(0.5), active(9)], logged: 3 }), ['collecting', 'Collecting · Waiting for the first check', null]);
});

test('a failing or stalled collection points at the last check that worked', () => {
  assert.deepEqual(said('on', { passes: [active(0.1, 2), active(1.1), active(2.1)], logged: 3 }), ['issue', 'Collection issue · Last successful check', ago(1.1)]);
  assert.deepEqual(said('on', { passes: [active(3), active(4)], logged: 3 }), ['issue', 'Collection issue · Last successful check', ago(3)]);
  assert.deepEqual(said('on', { passes: [active(0.1, 1), active(1.1, 1)], logged: 3 }), ['issue', 'Collection issue · No successful check in the last two days', null]);
  // A pause recorded long ago, with nothing since, is a stall and not a fresh resume.
  assert.deepEqual(said('on', { passes: [paused(6)], logged: 0 }), ['issue', 'Collection issue · No successful check in the last two days', null]);
});

test('switched on with nowhere to write is an issue, never "collecting"', () => {
  assert.deepEqual(said('on', 'not-created'), ['issue', 'Collection issue · Results tables are not set up', null]);
  assert.deepEqual(said('paused', 'not-created'), ['issue', 'Collection issue · Results tables are not set up', null]);
  assert.deepEqual(said('on', 'unavailable'), ['issue', 'Collection issue · Results could not be read', null]);
});
