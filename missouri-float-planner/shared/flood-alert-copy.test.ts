import assert from 'node:assert/strict';
import test from 'node:test';

import { floodAlertLine, floodAlertsToShow, isFloodWarning } from './flood-alert-copy';

// Saturday 2026-10-10 13:00 Central.
const NOW = Date.parse('2026-10-10T18:00:00Z');

test('warnings come first, duplicates collapse, expired alerts drop', () => {
  const alerts = [
    { event: 'Flood Advisory', expires: '2026-10-11T00:00:00Z' },
    { event: 'Flood Watch', expires: '2026-10-12T00:00:00Z' },
    { event: 'Flood Warning', expires: '2026-10-11T12:00:00Z' },
    { event: 'Flood Warning', expires: '2026-10-13T00:00:00Z' },
    { event: 'Flash Flood Warning', expires: '2026-10-10T17:00:00Z' },
  ];
  const shown = floodAlertsToShow(alerts, NOW, 3);
  assert.deepEqual(shown.map((a) => a.event), ['Flood Warning', 'Flood Watch', 'Flood Advisory']);
  assert.equal(shown[0].expires, '2026-10-13T00:00:00Z', 'keeps the later expiry');
  assert.equal(floodAlertsToShow(alerts, NOW).length, 2, 'default limit');
  assert.deepEqual(floodAlertsToShow(null, NOW), []);
});

test('only warnings carry alarm weight', () => {
  assert.equal(isFloodWarning({ event: 'Flood Warning' }), true);
  assert.equal(isFloodWarning({ event: 'Flash Flood Warning' }), true);
  assert.equal(isFloodWarning({ event: 'Flood Watch' }), false);
  assert.equal(isFloodWarning({ event: 'Hydrologic Outlook' }), false);
});

test('expiry is named in Central time', () => {
  // 2026-10-13T00:00Z is Monday 7 PM Central.
  assert.equal(
    floodAlertLine({ event: 'Flood Warning', expires: '2026-10-13T00:00:00Z' }, NOW),
    'Flood Warning in effect until Monday 7 PM',
  );
  assert.equal(
    floodAlertLine({ event: 'Flood Watch', expires: '2026-10-11T02:30:00Z' }, NOW),
    'Flood Watch in effect until today 9:30 PM',
  );
  assert.equal(
    floodAlertLine({ event: 'Flood Watch', expires: '2026-10-11T18:00:00Z' }, NOW),
    'Flood Watch in effect until tomorrow 1 PM',
  );
  assert.equal(floodAlertLine({ event: 'Flood Advisory', expires: null }, NOW), 'Flood Advisory in effect');
});
