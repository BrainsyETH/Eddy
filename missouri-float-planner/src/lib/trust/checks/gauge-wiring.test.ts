import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveDualPrimaryFindings, type GaugeRiverLink } from './gauge-wiring';

function link(overrides: Partial<GaugeRiverLink> = {}): GaugeRiverLink {
  return {
    gaugeStationId: 'station-1',
    gaugeLabel: 'Huzzah Creek at Scotia (07014000)',
    riverSlug: 'huzzah',
    isPrimary: true,
    ...overrides,
  };
}

// ── the defect this check exists to find ─────────────────────────

test('a gauge marked primary for two rivers is reported', () => {
  // USGS 07014000 today: 00164_fix_river_gauge_misassociations.sql inserts it
  // primary for huzzah (:58) and primary for courtois (:87). The data may be
  // deliberate — Courtois borrows Huzzah's gauge as a proxy — but the code is
  // not: several call sites resolve a gauge's river with find(g => g.isPrimary),
  // which returns whichever row the query ordered first.
  const findings = deriveDualPrimaryFindings([
    link({ riverSlug: 'huzzah' }),
    link({ riverSlug: 'courtois' }),
  ]);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleKey, 'gauge_dual_primary');
  assert.equal(findings[0].entityType, 'gauge');
  assert.deepEqual(findings[0].evidence?.rivers, ['courtois', 'huzzah']);
});

test('a gauge primary for exactly one river is not a finding', () => {
  assert.deepEqual(deriveDualPrimaryFindings([link()]), []);
});

test('non-primary links never count toward the collision', () => {
  // A gauge can legitimately be linked to many rivers; only the primary flag is
  // what find(isPrimary) resolves against.
  const findings = deriveDualPrimaryFindings([
    link({ riverSlug: 'huzzah', isPrimary: true }),
    link({ riverSlug: 'courtois', isPrimary: false }),
    link({ riverSlug: 'meramec', isPrimary: false }),
  ]);
  assert.deepEqual(findings, []);
});

test('separate stations do not merge', () => {
  const findings = deriveDualPrimaryFindings([
    link({ gaugeStationId: 's1', riverSlug: 'huzzah' }),
    link({ gaugeStationId: 's2', riverSlug: 'courtois' }),
  ]);
  assert.deepEqual(findings, []);
});

test('three rivers on one gauge is one finding, not three', () => {
  // The problem is the station, not each river. Filing it per-river would make
  // fixing one of them look like partial progress on three separate issues.
  const findings = deriveDualPrimaryFindings([
    link({ riverSlug: 'a' }),
    link({ riverSlug: 'b' }),
    link({ riverSlug: 'c' }),
  ]);
  assert.equal(findings.length, 1);
  assert.deepEqual(findings[0].evidence?.rivers, ['a', 'b', 'c']);
});

// ── stability, which the fingerprint depends on ──────────────────

test('the river list is sorted so the detail does not churn', () => {
  // detail is rewritten on every touch. Row order out of PostgREST is not
  // guaranteed, and an unsorted list would rewrite the row every hour for no
  // reason, making last_seen_at meaningless as a change signal.
  const a = deriveDualPrimaryFindings([link({ riverSlug: 'courtois' }), link({ riverSlug: 'huzzah' })]);
  const b = deriveDualPrimaryFindings([link({ riverSlug: 'huzzah' }), link({ riverSlug: 'courtois' })]);
  assert.equal(a[0].detail, b[0].detail);
});

test('findings are emitted in a deterministic order', () => {
  const findings = deriveDualPrimaryFindings([
    link({ gaugeStationId: 's2', gaugeLabel: 'Zulu', riverSlug: 'x' }),
    link({ gaugeStationId: 's2', gaugeLabel: 'Zulu', riverSlug: 'y' }),
    link({ gaugeStationId: 's1', gaugeLabel: 'Alpha', riverSlug: 'p' }),
    link({ gaugeStationId: 's1', gaugeLabel: 'Alpha', riverSlug: 'q' }),
  ]);
  assert.deepEqual(
    findings.map((f) => f.entityKey),
    ['Alpha', 'Zulu'],
  );
});

test('a station with no label falls back to its id rather than an empty key', () => {
  // entityKey is half the fingerprint; an empty one would collide every
  // unlabelled station onto a single finding.
  const findings = deriveDualPrimaryFindings([
    link({ gaugeLabel: '', riverSlug: 'a' }),
    link({ gaugeLabel: '', riverSlug: 'b' }),
  ]);
  assert.equal(findings[0].entityKey, 'station-1');
});
