import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveDualPrimaryFindings, deriveUncuratedWiringFindings, gaugeWiringCheck, type GaugeRiverLink, type WiredStation } from './gauge-wiring';
import type { TrustCheckContext } from '../types';

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

test('a station with no label still keys on its id rather than an empty string', () => {
  // entityKey is half the fingerprint; an empty one would collide every
  // unlabelled station onto a single finding.
  const findings = deriveDualPrimaryFindings([
    link({ gaugeLabel: '', riverSlug: 'a', distanceFromSectionMiles: null }),
    link({ gaugeLabel: '', riverSlug: 'b', distanceFromSectionMiles: null }),
  ]);
  assert.equal(findings[0].entityKey, 'station-1');
});

test('renaming the station does not change the finding identity', () => {
  // The regression this file most needs to hold. entityKey used to be
  // `entry.label || stationId`, and the label embeds an editorial name — so
  // editing "at Scotia" to "near Scotia" changed the fingerprint, resolved the
  // open finding as fixed, and opened an identical new one. The recurrence
  // count reset and "unresolvable since March" read as "found last night".
  //
  // normalizeEntityKey() cannot save this: "at" and "near" are different
  // tokens, and no amount of case-folding makes them equal.
  const before = deriveDualPrimaryFindings([
    link({ gaugeLabel: 'Huzzah Creek at Scotia (07014000)', riverSlug: 'a', distanceFromSectionMiles: null }),
    link({ gaugeLabel: 'Huzzah Creek at Scotia (07014000)', riverSlug: 'b', distanceFromSectionMiles: null }),
  ]);
  const after = deriveDualPrimaryFindings([
    link({ gaugeLabel: 'Huzzah Creek near Scotia (07014000)', riverSlug: 'a', distanceFromSectionMiles: null }),
    link({ gaugeLabel: 'Huzzah Creek near Scotia (07014000)', riverSlug: 'b', distanceFromSectionMiles: null }),
  ]);

  assert.equal(before[0].entityKey, after[0].entityKey);
  assert.equal(after[0].entityKey, 'station-1');
  // The name still reaches the operator — it just does not carry identity.
  assert.match(after[0].title, /near Scotia/);
  assert.equal(after[0].evidence!.gaugeStationId, 'station-1');
});

// ── wired but not curated ─────────────────────────────────────────

function station(overrides: Partial<WiredStation> = {}): WiredStation {
  return {
    gaugeStationId: 'station-rf',
    gaugeLabel: 'Gasconade River near Rich Fountain, MO (06934000)',
    curated: false,
    active: true,
    riverSlugs: ['gasconade'],
    ...overrides,
  };
}

test('an active station wired to a river without the curated flag is a finding', () => {
  // The production case: wired to the Gasconade after 00196 ran, never flagged,
  // so the gauge cron skipped it and its stored reading froze for three months.
  const findings = deriveUncuratedWiringFindings([station()]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleKey, 'gauge_wired_not_curated');
  assert.equal(findings[0].entityType, 'gauge');
  assert.equal(findings[0].entityKey, 'station-rf', 'keyed on the stable id, not the editable name');
  assert.match(findings[0].detail, /gasconade/);
  assert.deepEqual(findings[0].evidence, { gaugeStationId: 'station-rf', rivers: ['gasconade'] });
});

test('curated, inactive and unwired stations are not findings', () => {
  assert.deepEqual(deriveUncuratedWiringFindings([
    station({ curated: true }),
    // Deliberately not polled, so the flag changes nothing for it.
    station({ gaugeStationId: 'station-houston', active: false }),
    station({ gaugeStationId: 'station-national', riverSlugs: [] }),
  ]), []);
});

test('one station on two rivers is one finding with a stable river order', () => {
  const [finding] = deriveUncuratedWiringFindings([station({ riverSlugs: ['huzzah', 'courtois'] })]);
  assert.deepEqual(finding.evidence?.rivers, ['courtois', 'huzzah']);
  assert.match(finding.detail, /courtois, huzzah/);
});

test('the check reads every link, pages past the row cap, and reports both rules', async () => {
  const links = Array.from({ length: 1001 }, (_, i) => ({
    id: `link-${String(i).padStart(4, '0')}`, gauge_station_id: i === 1000 ? 'station-rf' : `station-${i}`,
    is_primary: false, distance_from_section_miles: null, rivers: { slug: i === 1000 ? 'gasconade' : 'current' },
    gauge_stations: { name: i === 1000 ? 'Gasconade River near Rich Fountain, MO' : `Gauge ${i}`, usgs_site_id: i === 1000 ? '06934000' : null, curated: i !== 1000, active: true },
  }));
  const ranges: number[][] = [];
  const supabase = { from: () => ({ select: () => ({
    // The primary-links query.
    eq: async () => ({ data: [{ ...links[0], is_primary: true, distance_from_section_miles: 0 }], error: null }),
    // The every-link query, paged.
    order: () => ({ range: async (from: number, to: number) => { ranges.push([from, to]); return { data: links.slice(from, to + 1), error: null }; } }),
  }) }) };
  const result = await gaugeWiringCheck.run({ supabase, now: new Date(), deadlineMs: Date.now() + 10_000 } as unknown as TrustCheckContext);
  assert.deepEqual(ranges, [[0, 999], [1000, 1999]], 'a second page is read, so row 1,001 is not silently dropped');
  assert.deepEqual(result.findings.map(f => f.ruleKey), ['gauge_wired_not_curated']);
  assert.equal(result.findings[0].entityKey, 'station-rf');
  assert.equal(result.scopeCount, 1);
});
