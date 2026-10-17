import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { damWidgetSnapshot } from '../../shared/dam-widget';
import type { DamSnapshot } from '../../shared/dam-types';
import { USACE_DAMS, hasPowerhouse } from './flow-providers/usace-registry';

const now = Date.parse('2026-10-17T17:30:00Z'); // 12:30 PM Central
function fixture(): DamSnapshot {
  return {
    id: 'swl-bull-shoals-dam', name: 'Bull Shoals Dam', lakeName: 'Bull Shoals Lake', state: 'AR', lat: 36, lon: -92,
    hasTurbines: true, generationFloorCfs: 100,
    generationReference: { units: 8, fullGenerationCfs: 26400, schedulingCapacityMw: 391, source: 'SWPA' },
    metrics: { generationFlow: { value: 6600, unit: 'cfs', at: new Date(now - 3600_000).toISOString(), staleness: 'fresh' } },
    generating: true,
    schedule: [{ scheduleDate: '2026-10-17', retrievedAt: new Date(now).toISOString(), idle: [],
      hours: Array.from({ length: 24 }, (_, i) => ({ hourEnding: i + 1, megawatts: i < 14 ? 100 : 0, cfs: null, isRamp: false })) }],
    sources: [],
  };
}

test('dam widget keeps observation and schedule separate and expires each locally', () => {
  const packet = damWidgetSnapshot(fixture(), now);
  const first = packet.entries[0];
  assert.equal(first.turbineCfs, 6600);
  assert.equal(first.observedAt, now - 3600_000);
  assert.equal(first.status, 'Generating now');
  assert.match(first.scheduleSummary, /Stops at 2 PM/); // HE15 begins at 2, not 3.
  assert.equal(first.scheduleCheckedAt, now);
  const older = packet.entries.find(entry => entry.date === now + 3600_000 + 1)!;
  assert.equal(older.status, 'Last observed generating');
  assert.equal(older.turbineCfs, 6600);
  const scheduleExpired = packet.entries.find(entry => entry.date === now + 90 * 60_000 + 1)!;
  assert.equal(scheduleExpired.scheduleCurrent, false);
  assert.match(scheduleExpired.scheduleSummary, /latest schedule/);
  assert.equal(packet.entries.at(-1)!.current, false);
  assert.equal(packet.entries.at(-1)!.scheduleCurrent, false);
  assert.ok(packet.entries.every((entry, i, all) => i === 0 || entry.date > all[i - 1].date));
});

test('missing, daily-average, negative and future turbine readings never mean off', () => {
  for (const bad of [undefined, { ...fixture().metrics.generationFlow!, value: -1 },
    { ...fixture().metrics.generationFlow!, dailyMean: true },
    { ...fixture().metrics.generationFlow!, at: new Date(now + 3600_000).toISOString() }]) {
    const dam = fixture();
    dam.metrics.generationFlow = bad;
    const first = damWidgetSnapshot(dam, now).entries[0];
    assert.equal(first.turbineCfs, null);
    assert.equal(first.observedAt, null);
    assert.equal(first.status, 'Current generation unavailable');
  }
  const dam = fixture();
  dam.metrics.generationFlow!.value = 20;
  assert.equal(damWidgetSnapshot(dam, now).entries[0].status, 'No turbine generation observed');
});

test('unknown or stale schedule provenance cannot promise a next transition', () => {
  for (const checked of [null, 'invalid', new Date(now - 91 * 60_000).toISOString(), new Date(now + 3600_000).toISOString()]) {
    const dam = fixture();
    dam.schedule[0].retrievedAt = checked;
    const first = damWidgetSnapshot(dam, now).entries[0];
    assert.equal(first.scheduleCurrent, false);
    assert.doesNotMatch(first.scheduleSummary, /Starts|Stops/);
  }
  const dam = fixture();
  dam.schedule = [];
  assert.equal(damWidgetSnapshot(dam, now).entries[0].scheduleSummary, 'No schedule posted.');
});

test('packaged dam picker matches only registry powerhouses', () => {
  const catalog = JSON.parse(readFileSync(new URL('../../../eddy-ios/modules/eddy-live-activity/widget/DamWidgetCatalog.json', import.meta.url), 'utf8'));
  assert.deepEqual(catalog, Object.values(USACE_DAMS).filter(hasPowerhouse)
    .map(({ id, name, state }) => ({ id, name, state })).sort((a, b) => a.name.localeCompare(b.name)));
});
