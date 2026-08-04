import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveDualPrimaryFindings, type GaugeRiverLink } from './gauge-wiring';

function link(overrides: Partial<GaugeRiverLink> = {}): GaugeRiverLink {
  return {
    gaugeStationId: 'station-1',
    gaugeLabel: 'Huzzah Creek at Scotia (07014000)',
    riverSlug: 'huzzah',
    isPrimary: true,
    distanceFromSectionMiles: 0,
    ...overrides,
  };
}

// ── what this check must NOT report ──────────────────────────────

test('a shared gauge with a distance tiebreak is not a finding', () => {
  // Courtois Creek has no gauge of its own and borrows Huzzah's, so 07014000 is
  // correctly primary for both (00164:58 and :87). `is_primary` means "primary
  // FOR THIS RIVER" and each river still has exactly one. Reporting this would
  // be a permanent false positive against correct data — the kind that teaches
  // an operator to stop reading the list.
  const findings = deriveDualPrimaryFindings([
    link({ riverSlug: 'huzzah', distanceFromSectionMiles: 0 }),
    link({ riverSlug: 'courtois', distanceFromSectionMiles: 5 }),
  ]);
  assert.deepEqual(findings, []);
});

test('a gauge primary for exactly one river is not a finding', () => {
  assert.deepEqual(deriveDualPrimaryFindings([link()]), []);
});

test('non-primary links never count toward the tie', () => {
  const findings = deriveDualPrimaryFindings([
    link({ riverSlug: 'huzzah', isPrimary: true }),
    link({ riverSlug: 'courtois', isPrimary: false, distanceFromSectionMiles: null }),
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

// ── what it must report ──────────────────────────────────────────

test('two primaries at the same distance are unresolvable', () => {
  // Nothing in the data orders these, so pickPrimaryRiverLink falls back to
  // alphabetical — a coin flip dressed as a decision.
  const findings = deriveDualPrimaryFindings([
    link({ riverSlug: 'huzzah', distanceFromSectionMiles: 2 }),
    link({ riverSlug: 'courtois', distanceFromSectionMiles: 2 }),
  ]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleKey, 'gauge_dual_primary');
});

test('a missing distance makes the tie unresolvable even against a measured one', () => {
  // An unmeasured association is not "far away", it is unknown. Treating null as
  // last would silently pick the measured river and hide the gap.
  const findings = deriveDualPrimaryFindings([
    link({ riverSlug: 'huzzah', distanceFromSectionMiles: 0 }),
    link({ riverSlug: 'courtois', distanceFromSectionMiles: null }),
  ]);
  assert.equal(findings.length, 1);
});

test('the finding names the distances so the fix is obvious', () => {
  const findings = deriveDualPrimaryFindings([
    link({ riverSlug: 'huzzah', distanceFromSectionMiles: null }),
    link({ riverSlug: 'courtois', distanceFromSectionMiles: null }),
  ]);
  assert.match(findings[0].detail, /no distance/);
  assert.equal(findings[0].entityType, 'gauge');
});

test('three unresolvable rivers is one finding, not three', () => {
  // The problem is the station, not each river. Filing it per-river would make
  // fixing one look like partial progress on three separate issues.
  const findings = deriveDualPrimaryFindings([
    link({ riverSlug: 'a', distanceFromSectionMiles: null }),
    link({ riverSlug: 'b', distanceFromSectionMiles: null }),
    link({ riverSlug: 'c', distanceFromSectionMiles: null }),
  ]);
  assert.equal(findings.length, 1);
});

// ── stability, which the fingerprint depends on ──────────────────

test('the river list is sorted so the detail does not churn', () => {
  // detail is rewritten on every touch. PostgREST does not guarantee row order,
  // and an unsorted list would rewrite the row every hour for no reason, making
  // last_seen_at useless as a change signal.
  const a = deriveDualPrimaryFindings([
    link({ riverSlug: 'courtois', distanceFromSectionMiles: null }),
    link({ riverSlug: 'huzzah', distanceFromSectionMiles: null }),
  ]);
  const b = deriveDualPrimaryFindings([
    link({ riverSlug: 'huzzah', distanceFromSectionMiles: null }),
    link({ riverSlug: 'courtois', distanceFromSectionMiles: null }),
  ]);
  assert.equal(a[0].detail, b[0].detail);
});

test('a station with no label falls back to its id rather than an empty key', () => {
  // entityKey is half the fingerprint; an empty one would collide every
  // unlabelled station onto a single finding.
  const findings = deriveDualPrimaryFindings([
    link({ gaugeLabel: '', riverSlug: 'a', distanceFromSectionMiles: null }),
    link({ gaugeLabel: '', riverSlug: 'b', distanceFromSectionMiles: null }),
  ]);
  assert.equal(findings[0].entityKey, 'station-1');
});
