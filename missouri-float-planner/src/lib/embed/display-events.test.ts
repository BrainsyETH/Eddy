import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { DISPLAY_EVENT_VERSION, displayReadings, isDisplayEvent, type DisplayEvent } from './display-events';

const ready: DisplayEvent = { type: 'eddy-display:ready', v: 1, display: 'mills', format: 'vertical' };
const status: DisplayEvent = { type: 'eddy-display:status', v: 1, display: 'board', readings: 'interrupted', scenery: 'ok' };
const brk: DisplayEvent = { type: 'eddy-display:break', v: 1, display: 'mills', completed: 3, total: 10, next: 'alley' };

test('hosts accept every event the displays send', () => {
  for (const e of [ready, status, brk, { ...brk, next: undefined }]) assert.ok(isDisplayEvent(e), e.type);
  // Structured clone drops undefined keys; a break without `next` is valid too.
  assert.ok(isDisplayEvent({ type: 'eddy-display:break', v: 1, display: 'board', completed: 1, total: 1 }));
});

test('hosts reject anything outside the contract', () => {
  const bad: unknown[] = [
    null,
    'eddy-display:ready',
    { ...ready, v: DISPLAY_EVENT_VERSION + 1 },
    { ...ready, display: 'river-map' },
    { ...ready, format: 'square' },
    { ...status, readings: 'fine' },
    { ...status, scenery: undefined },
    { ...brk, completed: 0 },
    { ...brk, total: 1.5 },
    { ...brk, next: '' },
    { ...brk, type: 'eddy-display:loop' },
    { type: 'eddy-embed:resize', height: 300 },
  ];
  for (const e of bad) assert.equal(isDisplayEvent(e), false, JSON.stringify(e));
});

test('readings: pending reports nothing; a failed refresh with data on screen is interrupted, not unavailable', () => {
  assert.equal(displayReadings({ isPending: true, isError: false, hasData: false }), null);
  assert.equal(displayReadings({ isPending: false, isError: false, hasData: true }), 'current');
  assert.equal(displayReadings({ isPending: false, isError: true, hasData: true }), 'interrupted');
  assert.equal(displayReadings({ isPending: false, isError: true, hasData: false }), 'unavailable');
});

test('docs/embeds.md documents every event type and the Mills start parameter', () => {
  const doc = readFileSync('docs/embeds.md', 'utf8');
  const section = doc.slice(doc.indexOf('## Display contract'));
  assert.ok(section.length > 20, 'docs/embeds.md has a "## Display contract" section');
  for (const type of ['eddy-display:ready', 'eddy-display:status', 'eddy-display:break']) {
    assert.ok(section.includes(type), `${type} is documented`);
  }
  assert.ok(section.includes('start=<mill id>'), 'Mills start= is documented');
});
