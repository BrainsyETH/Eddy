import assert from 'node:assert/strict';
import test from 'node:test';
import type { NationalSiteMeta } from '@/lib/usgs/national-sites';
import {
  DRAINAGE_TOLERANCE_FRACTION,
  MOVE_TOLERANCE_METERS,
  RECORD_STALE_DAYS,
  deriveSiteDriftFindings,
  foldStationRows,
  usgsSiteDriftCheck,
} from './usgs-site-drift';
import type { StoredSite } from './usgs-site-drift';
import { USGS_SITE_DRIFT_RULES, isRuleClassified, severityForRule } from '../severity';

// ── why this file exists ─────────────────────────────────────────────
//
// This is the first check whose input comes off the network, which makes it the
// first one where "the source disagrees" and "the request failed" are different
// facts that arrive through the same code path. Everything below is about
// keeping those apart; the comparison arithmetic is the easy half.

const HUZZAH: StoredSite = {
  siteId: '07014000',
  name: 'Huzzah Creek near Steelville, MO',
  lng: -91.2040277777778,
  lat: 37.9747777777778,
  drainageAreaSqMi: 259,
  riverSlugs: ['courtois', 'huzzah'],
  primaryForSlugs: ['courtois', 'huzzah'],
};

function remote(over: Partial<NationalSiteMeta> = {}): NationalSiteMeta {
  return {
    siteId: '07014000',
    name: 'Huzzah Creek near Steelville, MO',
    lng: -91.2040277777778,
    lat: 37.9747777777778,
    stateCode: 'MO',
    county: 'Crawford County',
    huc: '071401020408',
    siteTypeCode: 'ST',
    agencyCode: 'USGS',
    drainageAreaSqMi: 259,
    ...over,
  };
}

const NOW = new Date('2026-08-10T12:00:00Z');

/** A record end recent enough that usgs_site_record_ended stays quiet. */
const FRESH = new Date('2026-08-10T06:30:00Z');

function derive(
  stored: StoredSite[],
  source: NationalSiteMeta[],
  unreached: string[] = [],
  recordEnds?: Map<string, Date | null>,
) {
  return deriveSiteDriftFindings({
    stored,
    source: new Map(source.map((s) => [s.siteId, s])),
    unreached: new Set(unreached),
    // Default every stored site to a fresh record so tests about the other
    // rules are not silently also testing this one.
    recordEnds: recordEnds ?? new Map(stored.map((s) => [s.siteId, FRESH])),
    now: NOW,
  });
}

// ── agreement is silence ─────────────────────────────────────────────

test('a station that matches the source raises nothing', () => {
  assert.deepEqual(derive([HUZZAH], [remote()]), []);
});

// ── the rule that matters most, and the way it goes wrong ────────────

test('a site the source does not know about is reported as an unknown id', () => {
  const findings = derive([HUZZAH], []);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleKey, 'usgs_site_unknown');
  assert.equal(findings[0].entityKey, '07014000');
  // The operator needs to know it is a primary gauge to judge the urgency.
  assert.deepEqual(findings[0].evidence?.primaryForSlugs, ['courtois', 'huzzah']);
});

test('a site whose request FAILED is never reported as unknown', () => {
  // The regression this prevents, and the reason fetchSitesByIds returns
  // `unreached` at all. A timeout would otherwise be indistinguishable from a
  // decommission, and the ledger would file a high-severity notice claiming
  // USGS had dropped a station that is fine. That is the confident-pass failure
  // this subsystem exists to catch, with the sign flipped: asserting a
  // PRESENCE nothing observed.
  assert.deepEqual(derive([HUZZAH], [], ['07014000']), []);
});

test('an unreached site is skipped entirely, not just for absence', () => {
  // It is not enough to suppress the absent rule. Nothing was learned about
  // this station at all, so no comparison against it is meaningful — including
  // the ones that would fire off stale stored values alone.
  const findings = derive([HUZZAH], [remote({ name: 'Something Else' })], ['07014000']);
  assert.deepEqual(findings, []);
});

// ── the record ending, which is what a dead station actually looks like ──

test('a station USGS still lists but stopped publishing is reported', () => {
  // The correction this file exists to record. The first version of this check
  // read "no monitoring-location record" as "decommissioned", which would have
  // made the headline rule almost entirely silent: USGS KEEPS the location
  // record after telemetry ends. Verified against three stations this repo has
  // already buried — 06928900, 07014100 and 05497485 — every one of which still
  // returns a full monitoring-location record today.
  //
  // The death is in the time series, not the location.
  const ends = new Map([['07014000', new Date('2025-07-26T00:00:00Z')]]);
  const findings = derive([HUZZAH], [remote()], [], ends);

  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleKey, 'usgs_site_record_ended');
  assert.equal(findings[0].evidence?.lastPublishedAt, '2025-07-26T00:00:00.000Z');
  assert.ok((findings[0].evidence?.daysSincePublished as number) > 300);
});

test('a station with no flow or stage series at all is reported', () => {
  // Present in the map with a null end: USGS answered, and the answer is that
  // there is no discharge or gage-height record. Eddy is wired to a station it
  // can never read.
  const findings = derive([HUZZAH], [remote()], [], new Map([['07014000', null]]));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleKey, 'usgs_site_record_ended');
  assert.equal(findings[0].evidence?.lastPublishedAt, null);
});

test('a station missing from the record map is NOT reported', () => {
  // The distinction that makes the rule safe. Absent from the map means the
  // time-series request did not answer about it — which must never be read as
  // "the record ended", the same way an unreached location must never be read
  // as "the id is unknown". A null entry is an answer; a missing entry is not.
  const findings = derive([HUZZAH], [remote()], [], new Map());
  assert.deepEqual(findings, []);
});

test('a routine outage inside the window is not a death', () => {
  // stale_gauge already reports silence within a day. This rule answers a
  // different question — is it coming back — so it has to outlast the outages
  // where the answer is yes.
  const recent = new Date(NOW.getTime() - (RECORD_STALE_DAYS - 4) * 24 * 60 * 60 * 1000);
  assert.deepEqual(derive([HUZZAH], [remote()], [], new Map([['07014000', recent]])), []);
});

test('the boundary is exclusive, so a station exactly at the threshold is quiet', () => {
  const exactly = new Date(NOW.getTime() - RECORD_STALE_DAYS * 24 * 60 * 60 * 1000);
  assert.deepEqual(derive([HUZZAH], [remote()], [], new Map([['07014000', exactly]])), []);
});

test('an unknown id does not also claim the record ended', () => {
  // Two rules about one station would be two fingerprints for what is really a
  // single defect, and resolving one would leave the other open forever. When
  // USGS has no location record, the id is the finding and nothing else is
  // knowable.
  const findings = derive([HUZZAH], [], [], new Map([['07014000', null]]));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleKey, 'usgs_site_unknown');
});

// ── movement ─────────────────────────────────────────────────────────

test('a re-survey inside the tolerance is not a finding', () => {
  // ~30 m north. USGS publishes improved coordinates routinely and reporting
  // them would be a permanently regenerating list against correct data.
  const findings = derive([HUZZAH], [remote({ lat: HUZZAH.lat + 0.00027 })]);
  assert.deepEqual(findings, []);
});

test('a relocation beyond the tolerance is reported with the distance', () => {
  // ~330 m north.
  const findings = derive([HUZZAH], [remote({ lat: HUZZAH.lat + 0.003 })]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleKey, 'usgs_site_moved');
  const meters = findings[0].evidence?.metersMoved as number;
  assert.ok(
    meters > MOVE_TOLERANCE_METERS && meters < 400,
    `expected a few hundred metres, got ${meters}`,
  );
});

test('a source with no coordinate does not fake a move', () => {
  // null is missing data, not a station at the origin. Coercing it would put
  // the gauge in the Gulf of Guinea and report a 10,000 km relocation.
  assert.deepEqual(derive([HUZZAH], [remote({ lat: null, lng: null })]), []);
});

// ── naming ───────────────────────────────────────────────────────────

test('case and punctuation differences are not renames', () => {
  // USGS publishes mixed-case in some regions and upper-case in others, and
  // import-usgs-gauges stores whatever it was handed. A strict comparison would
  // file a rename for every station imported from the shouting region.
  const findings = derive([HUZZAH], [remote({ name: 'HUZZAH CREEK NEAR STEELVILLE, MO.' })]);
  assert.deepEqual(findings, []);
});

test('an actual rename is reported', () => {
  const findings = derive([HUZZAH], [remote({ name: 'Huzzah Creek at Davisville, MO' })]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleKey, 'usgs_site_renamed');
  assert.equal(findings[0].evidence?.usgsName, 'Huzzah Creek at Davisville, MO');
});

// ── drainage area ────────────────────────────────────────────────────

test('drainage area is compared relatively, not absolutely', () => {
  // 0.4% on a 259 sq mi basin is rounding. The same 1 sq mi difference on an
  // 8 sq mi headwater creek is 12% and worth reporting — which a fixed
  // threshold could not express.
  assert.deepEqual(derive([HUZZAH], [remote({ drainageAreaSqMi: 260 })]), []);

  const small = { ...HUZZAH, siteId: '07013000', drainageAreaSqMi: 8 };
  const findings = derive([small], [remote({ siteId: '07013000', drainageAreaSqMi: 9 })]);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleKey, 'usgs_site_drainage_changed');
});

test('a null on either side is not a change', () => {
  // The source not publishing a drainage area is a question it declined to
  // answer. Reporting it would make this check complain about missing source
  // data, which is not drift.
  assert.deepEqual(derive([HUZZAH], [remote({ drainageAreaSqMi: null })]), []);
  assert.deepEqual(
    derive([{ ...HUZZAH, drainageAreaSqMi: null }], [remote({ drainageAreaSqMi: 259 })]),
    [],
  );
});

test('the drainage tolerance is a fraction, not a percentage', () => {
  // Guards the constant against a later edit that reads 1 as "1%": a value of 1
  // would mean 100% and the rule would never fire again.
  assert.ok(DRAINAGE_TOLERANCE_FRACTION > 0 && DRAINAGE_TOLERANCE_FRACTION < 0.5);
});

// ── several rules at once ────────────────────────────────────────────

test('one station can drift in more than one way and each is its own finding', () => {
  // Separate fingerprints on purpose: taking the new coordinate and taking the
  // new name are separate decisions, and folding them into one finding would
  // mean resolving one silently resolves the other.
  const findings = derive(
    [HUZZAH],
    [remote({ lat: HUZZAH.lat + 0.003, name: 'Huzzah Creek at Davisville, MO' })],
  );
  assert.deepEqual(
    findings.map((f) => f.ruleKey).sort(),
    ['usgs_site_moved', 'usgs_site_renamed'],
  );
});

test('an unknown site raises exactly one finding, not several', () => {
  // Nothing is known about the station, so the other three comparisons have no
  // input. Emitting them would be three findings asserting a disagreement with
  // a value that was never received.
  const findings = derive([HUZZAH], []);
  assert.equal(findings.length, 1);
});

// ── folding the join ─────────────────────────────────────────────────

test('a station on two rivers folds to one entry', () => {
  // scopeCount is what reconciliation trusts when deciding whether the check
  // saw anything, and 07014000 is wired to both Huzzah and Courtois. Counting
  // it twice would inflate the scope and mean a batch failure that lost half
  // the stations could still look like a full pass.
  const folded = foldStationRows([
    {
      usgs_site_id: '07014000',
      name: 'Huzzah Creek near Steelville, MO',
      drainage_area_sqmi: 259,
      lng: -91.204,
      lat: 37.9747,
      river_slug: 'huzzah',
      is_primary: true,
    },
    {
      usgs_site_id: '07014000',
      name: 'Huzzah Creek near Steelville, MO',
      drainage_area_sqmi: 259,
      lng: -91.204,
      lat: 37.9747,
      river_slug: 'courtois',
      is_primary: true,
    },
  ]);

  assert.equal(folded.length, 1);
  assert.deepEqual(folded[0].riverSlugs, ['courtois', 'huzzah']);
  assert.deepEqual(folded[0].primaryForSlugs, ['courtois', 'huzzah']);
});

test('a secondary link does not become a primary one', () => {
  const folded = foldStationRows([
    {
      usgs_site_id: '07019000',
      name: 'Meramec River near Eureka, MO',
      drainage_area_sqmi: 3788,
      lng: -90.59,
      lat: 38.505,
      river_slug: 'meramec',
      is_primary: false,
    },
  ]);
  assert.deepEqual(folded[0].riverSlugs, ['meramec']);
  assert.deepEqual(folded[0].primaryForSlugs, []);
});

test('numeric columns arriving as strings are still numbers', () => {
  // PostgREST returns `numeric` as a string. Left as one, the drainage
  // comparison would run on '259' and the coordinate arithmetic would produce
  // NaN, which compares false against every threshold — so every drift rule
  // would silently stop firing rather than fail loudly.
  const folded = foldStationRows([
    {
      usgs_site_id: '07014000',
      name: 'Huzzah',
      drainage_area_sqmi: '259.0',
      lng: '-91.204',
      lat: '37.9747',
      river_slug: 'huzzah',
      is_primary: true,
    },
  ]);
  assert.equal(folded[0].drainageAreaSqMi, 259);
  assert.equal(folded[0].lng, -91.204);
  assert.equal(folded[0].lat, 37.9747);
});

test('a row with no site id or no coordinate is dropped from scope', () => {
  // validate_river_data owns "this gauge has no site id" as
  // gauge_missing_site_id. Carrying such a row here would raise a second
  // finding about one defect under a different fingerprint, and there is
  // nothing to look up at the source either way.
  const folded = foldStationRows([
    { usgs_site_id: null, name: 'x', drainage_area_sqmi: null, lng: -91, lat: 37, river_slug: 'a', is_primary: true },
    { usgs_site_id: '07014000', name: 'y', drainage_area_sqmi: null, lng: null, lat: null, river_slug: 'b', is_primary: true },
  ]);
  assert.deepEqual(folded, []);
});

// ── registration ─────────────────────────────────────────────────────

test('every rule this check emits is classified', () => {
  // Driven off the exported constant rather than a list retyped here, so a rule
  // added to the check and to severity.ts cannot pass a test that still checks
  // the old four. severityForRule falls back to 'high' for anything unmapped,
  // so an unclassified rule does not throw — it quietly files at the wrong
  // severity, which is the failure this guards.
  for (const rule of USGS_SITE_DRIFT_RULES) {
    assert.ok(isRuleClassified(rule), `${rule} has no severity mapping`);
  }

  assert.equal(severityForRule('usgs_site_unknown'), 'high');
  assert.equal(severityForRule('usgs_site_record_ended'), 'high');
  assert.equal(severityForRule('usgs_site_moved'), 'medium');
});

test('the two station-death rules are high, never critical', () => {
  // Deliberate, and worth pinning. stale_gauge owns the surface consequence — a
  // badge quoting a gauge that is not reporting — and rates it critical. Either
  // of these at critical would double-count one condition in every gate that
  // counts criticals, and the Trust MVP gate counts them.
  assert.equal(severityForRule('stale_gauge'), 'critical');
  assert.equal(severityForRule('usgs_site_unknown'), 'high');
  assert.equal(severityForRule('usgs_site_record_ended'), 'high');
});

test('the check runs daily', () => {
  // Hourly would multiply the outbound request budget by 24 for no additional
  // detection: USGS station metadata changes on the order of years.
  assert.equal(usgsSiteDriftCheck.cadence, 'daily');
  assert.equal(usgsSiteDriftCheck.id, 'usgs_site_drift');
});
