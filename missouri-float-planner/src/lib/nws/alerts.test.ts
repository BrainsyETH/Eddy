import assert from 'node:assert/strict';
import test from 'node:test';

import { parseRiverAlerts } from './alerts';

test('only river-relevant events survive, from either lookup', () => {
  const alerts = parseRiverAlerts([
    { id: 'a', properties: { event: 'Flood Warning', headline: 'h', severity: 'Severe', expires: '2026-10-12T00:00:00Z' } },
    { id: 'b', properties: { event: 'Heat Advisory', headline: 'h' } },
    { id: 'c', properties: { event: 'Flash Flood Watch', headline: 'h' } },
    { id: 'd' },
  ]);
  assert.deepEqual(alerts.map((a) => a.event), ['Flood Warning', 'Flash Flood Watch']);
  assert.equal(alerts[0].severity, 'Severe');
  assert.equal(alerts[1].expires, '', 'absent fields stay empty strings, as before');
});

test('a malformed payload yields no alerts rather than throwing', () => {
  assert.deepEqual(parseRiverAlerts(undefined), []);
  assert.deepEqual(parseRiverAlerts({ features: [] }), []);
});
