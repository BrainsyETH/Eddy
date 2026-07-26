import assert from 'node:assert/strict';
import test from 'node:test';
import {
  criticalHazards,
  hazardConditionCode,
  hazardSummary,
  hazardTypeLabel,
  portageNote,
  severityLabel,
  severityRank,
  sortHazards,
  type Hazard,
} from '../../../packages/eddy-hazards/index';
import { CONDITION_SYSTEM } from '../../shared/condition-system';

const hazard = (over: Partial<Hazard>): Hazard => ({
  id: over.id ?? 'h1',
  riverId: 'r1',
  name: over.name ?? 'Hazard',
  type: over.type ?? 'other',
  riverMile: over.riverMile ?? 0,
  description: null,
  severity: over.severity ?? 'info',
  portageRequired: over.portageRequired ?? false,
  portageSide: over.portageSide ?? null,
  seasonalNotes: null,
  coordinates: { lng: -91, lat: 37 },
});

// ── ordering is a safety claim, not a preference ─────────────────

test('the most dangerous hazard sorts first regardless of river mile', () => {
  // A low-water dam 40 miles downstream must not sit below a shoal at mile 2.
  // Sorting by mile is the intuitive-but-wrong choice this guards against.
  const sorted = sortHazards([
    hazard({ id: 'shoal', severity: 'info', riverMile: 2 }),
    hazard({ id: 'dam', severity: 'danger', riverMile: 40, type: 'low_water_dam' }),
    hazard({ id: 'strainer', severity: 'warning', riverMile: 20 }),
  ]);
  assert.deepEqual(sorted.map((h) => h.id), ['dam', 'strainer', 'shoal']);
});

test('within one severity, hazards run downstream', () => {
  const sorted = sortHazards([
    hazard({ id: 'b', severity: 'warning', riverMile: 30 }),
    hazard({ id: 'a', severity: 'warning', riverMile: 10 }),
  ]);
  assert.deepEqual(sorted.map((h) => h.id), ['a', 'b']);
});

test('severity ranks are strictly ordered', () => {
  assert.ok(severityRank('danger') < severityRank('warning'));
  assert.ok(severityRank('warning') < severityRank('caution'));
  assert.ok(severityRank('caution') < severityRank('info'));
});

test('an unknown severity sorts last rather than first', () => {
  // A typo or a new severity added server-side must not float to the top of a
  // safety list and outrank a real danger.
  const sorted = sortHazards([
    hazard({ id: 'weird', severity: 'catastrophic' as never }),
    hazard({ id: 'dam', severity: 'danger' }),
  ]);
  assert.equal(sorted[0].id, 'dam');
});

test('sorting does not mutate the caller array', () => {
  const input = [hazard({ id: 'a', severity: 'info' }), hazard({ id: 'b', severity: 'danger' })];
  sortHazards(input);
  assert.equal(input[0].id, 'a');
});

// ── what gets surfaced before launch ─────────────────────────────

test('a required portage is critical even when the hazard is mild', () => {
  // Being made to carry a boat is a trip-planning fact regardless of how the
  // hazard itself is rated.
  const critical = criticalHazards([
    hazard({ id: 'portage', severity: 'info', portageRequired: true }),
    hazard({ id: 'note', severity: 'info' }),
  ]);
  assert.deepEqual(critical.map((h) => h.id), ['portage']);
});

test('caution-level hazards stay out of the pre-launch list', () => {
  const critical = criticalHazards([hazard({ id: 'shoal', severity: 'caution' })]);
  assert.deepEqual(critical, []);
});

test('no hazards yields an empty list, not a crash', () => {
  assert.deepEqual(criticalHazards([]), []);
  assert.equal(hazardSummary([]), null);
});

// ── colour language ──────────────────────────────────────────────

test('hazard colours resolve through the canonical condition system', () => {
  // Returning a CODE rather than a hex is what keeps "never hardcode condition
  // hex" intact, and it means danger is the same red as a flooded river — one
  // colour language for danger across the whole app.
  for (const severity of ['danger', 'warning', 'caution', 'info'] as const) {
    const code = hazardConditionCode(severity);
    assert.ok(code in CONDITION_SYSTEM, `${severity} maps to unknown code "${code}"`);
  }
  assert.equal(hazardConditionCode('danger'), 'dangerous');
  assert.notEqual(hazardConditionCode('danger'), hazardConditionCode('info'));
});

test('an unrecognised severity gets the neutral colour', () => {
  assert.equal(hazardConditionCode('nonsense'), 'unknown');
});

// ── copy ─────────────────────────────────────────────────────────

test('hazard types read as plain English', () => {
  assert.equal(hazardTypeLabel('low_water_dam'), 'Low-water dam');
  assert.equal(hazardTypeLabel('bridge_piling'), 'Bridge piling');
  // An unknown type must still render something usable rather than a raw enum.
  assert.equal(hazardTypeLabel('some_new_type'), 'Hazard');
});

test('severity labels avoid alarming words for mild entries', () => {
  assert.equal(severityLabel('info'), 'Note');
  assert.equal(severityLabel('danger'), 'Danger');
});

test('portage side is phrased as an instruction, or a choice', () => {
  assert.equal(portageNote(hazard({ portageRequired: true, portageSide: 'left' })), 'Portage river left');
  // "Either" must not read like missing data.
  assert.equal(
    portageNote(hazard({ portageRequired: true, portageSide: 'either' })),
    'Portage either side',
  );
  assert.equal(portageNote(hazard({ portageRequired: true })), 'Portage required');
  assert.equal(portageNote(hazard({ portageRequired: false })), null);
});

test('the summary counts portages separately and pluralises', () => {
  assert.equal(hazardSummary([hazard({})]), '1 hazard');
  assert.equal(hazardSummary([hazard({}), hazard({ id: 'b' })]), '2 hazards');
  assert.equal(
    hazardSummary([hazard({ portageRequired: true }), hazard({ id: 'b' })]),
    '2 hazards, 1 portage',
  );
  assert.equal(
    hazardSummary([
      hazard({ portageRequired: true }),
      hazard({ id: 'b', portageRequired: true }),
    ]),
    '2 hazards, 2 portages',
  );
});
