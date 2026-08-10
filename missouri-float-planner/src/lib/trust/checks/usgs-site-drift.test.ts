import assert from 'node:assert/strict';
import test from 'node:test';
import type { NationalSiteMeta } from '@/lib/usgs/national-sites';
import {
  DRAINAGE_TOLERANCE_FRACTION,
  MOVE_TOLERANCE_METERS,
  deriveSiteDriftFindings,
  foldStationRows,
  usgsSiteDriftCheck,
} from './usgs-site-drift';
import type { StoredSite } from './usgs-site-drift';
import { severityForRule } from '../severity';

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

function derive(stored: StoredSite[], source: NationalSiteMeta[], unreached: string[] = []) {
  return deriveSiteDriftFindings({
    stored,
    source: new Map(source.map((s) => [s.siteId, s])),
    unreached: new Set(unreached),
  });
}

// ── agreement is silence ─────────────────────────────────────────────

test('a station that matches the source raises nothing', () => {
  assert.deepEqual(derive([HUZZAH], [remote()]), []);
});

// ── the rule that matters most, and the way it goes wrong ────────────

test('a site the source does not know about is reported absent', () => {
  const findings = derive([HUZZAH], []);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].ruleKey, 'usgs_site_absent');
  assert.equal(findings[0].entityKey, '07014000');
  // The operator needs to know it is a primary gauge to judge the urgency.
  assert.deepEqual(findings[0].evidence?.primaryForSlugs, ['courtois', 'huzzah']);
});

test('a site whose request FAILED is never reported absent', () => {
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

test('an absent site raises exactly one finding, not four', () => {
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
  // severityForRule falls back to 'high' for anything unmapped, so an
  // unclassified rule does not throw — it quietly files at the wrong severity.
  const emitted = [
    'usgs_site_absent',
    'usgs_site_moved',
    'usgs_site_renamed',
    'usgs_site_drainage_changed',
  ];
  for (const rule of emitted) {
    assert.ok(severityForRule(rule), `${rule} has no severity`);
  }
  assert.equal(severityForRule('usgs_site_absent'), 'high');
  assert.equal(severityForRule('usgs_site_moved'), 'medium');
});

test('the check runs daily', () => {
  // Hourly would multiply the outbound request budget by 24 for no additional
  // detection: USGS station metadata changes on the order of years.
  assert.equal(usgsSiteDriftCheck.cadence, 'daily');
  assert.equal(usgsSiteDriftCheck.id, 'usgs_site_drift');
});
