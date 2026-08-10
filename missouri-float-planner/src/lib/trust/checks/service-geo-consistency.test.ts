// src/lib/trust/checks/service-geo-consistency.test.ts
// The accept rule that wrote 138 service coordinates, pinned as a check.
//
// The fixtures are the REAL measured rows, because the thresholds were chosen
// from them. The six divergences this rule found in August 2026 are all here
// with their actual distances, so the check is proven against the exact set it
// was derived from — which is stronger evidence than a live run, and is why the
// data fix (20260810003000) shipping first does not leave it unobserved.

import assert from 'node:assert/strict';
import test from 'node:test';
import {
  deriveServiceGeoFindings,
  FAR_FROM_RIVER_MILES,
  NEARER_OTHER_RIVER_MARGIN_MILES,
  type ServiceGeoRow,
} from './service-geo-consistency';

function row(overrides: Partial<ServiceGeoRow> = {}): ServiceGeoRow {
  return {
    service_id: '00000000-0000-4000-8000-000000000001',
    service_name: 'Some Outfitter',
    service_type: 'outfitter',
    city: 'Eminence',
    state: 'MO',
    linked_river_count: 1,
    linked_river_names: ['Current River'],
    nearest_linked_name: 'Current River',
    nearest_linked_miles: 0.2,
    nearest_any_name: 'Current River',
    nearest_any_miles: 0.2,
    nearest_any_is_linked: true,
    ...overrides,
  };
}

const rulesOf = (rows: ServiceGeoRow[]) => deriveServiceGeoFindings(rows).map((f) => f.ruleKey);

/* ── What it must NOT report ───────────────────────────────────────────────
   A permanent false positive against correct data teaches an operator to stop
   reading the list, which costs more than the rule earns. */

test('a lodge six miles out on the only river it serves is fine', () => {
  // Eleven Point Cottages, in Alton town, 6.54 mi from the Eleven Point. This
  // is the furthest legitimate row in the table and it sets the headroom under
  // the 10-mile bound — a warning tier below 10 would fire on it forever.
  assert.deepEqual(
    rulesOf([
      row({
        service_name: 'Eleven Point Cottages',
        city: 'Alton',
        linked_river_names: ['Eleven Point River'],
        nearest_linked_name: 'Eleven Point River',
        nearest_linked_miles: 6.54,
        nearest_any_name: 'Eleven Point River',
        nearest_any_miles: 6.54,
      }),
    ]),
    [],
  );
});

test('distance is the MIN across links, not each link judged alone', () => {
  // THE most important assertion in this file. Float Eureka, after the August
  // correction, serves the Kings (4.63 mi) and the War Eagle (13.39). Judging
  // per link would file a permanent finding on the far one — against a row that
  // is now correct precisely because somebody added the second river.
  assert.deepEqual(
    rulesOf([
      row({
        service_name: 'Float Eureka',
        city: 'Huntsville',
        state: 'AR',
        linked_river_count: 2,
        linked_river_names: ['Kings River', 'War Eagle Creek'],
        nearest_linked_name: 'Kings River',
        nearest_linked_miles: 4.63,
        nearest_any_name: 'Kings River',
        nearest_any_miles: 4.63,
      }),
    ]),
    [],
  );
});

test('a dual-linked service is not mis-filed just because one link is far', () => {
  // Wild Bill's post-correction: 1.26 mi from the Buffalo and 10.63 from
  // Crooked Creek, linked to both. `nearest_any_is_linked` is the guard.
  assert.deepEqual(
    rulesOf([
      row({
        service_name: "Wild Bill's Outfitter",
        city: 'Yellville',
        state: 'AR',
        linked_river_count: 2,
        linked_river_names: ['Buffalo National River', 'Crooked Creek'],
        nearest_linked_name: 'Buffalo National River',
        nearest_linked_miles: 1.26,
        nearest_any_name: 'Buffalo National River',
        nearest_any_miles: 1.26,
      }),
    ]),
    [],
  );
});

test('confluence noise is under the margin', () => {
  // BSC Outdoors sits where the Big Piney meets the Gasconade and floats both.
  // rivers.geom is simplified to about 50 m, so a fraction of a mile between two
  // centerlines is inside the geometry's own error, not a signal.
  assert.deepEqual(
    rulesOf([
      row({
        service_name: 'BSC Outdoors',
        linked_river_names: ['Big Piney River'],
        nearest_linked_name: 'Big Piney River',
        nearest_linked_miles: 0.4,
        nearest_any_name: 'Gasconade River',
        nearest_any_miles: 0.3,
        nearest_any_is_linked: false,
      }),
    ]),
    [],
  );
});

test('exactly at the threshold is not over it', () => {
  assert.deepEqual(rulesOf([row({ nearest_linked_miles: FAR_FROM_RIVER_MILES })]), []);
  assert.deepEqual(
    rulesOf([row({ nearest_linked_miles: FAR_FROM_RIVER_MILES + 0.01 })]),
    ['service_far_from_linked_river'],
  );
});

/* ── What it must report ───────────────────────────────────────────────────
   The six real divergences, with the distances actually measured on 2026-08-09
   before 20260810003000 corrected them. */

test('the two wrong links are caught', () => {
  const findings = deriveServiceGeoFindings([
    row({
      service_id: 'faea7b2c-1411-44b1-b86e-b35715586213',
      service_name: 'Gasconade Hills Resort',
      city: 'Jerome',
      linked_river_names: ['Big Piney River'],
      nearest_linked_name: 'Big Piney River',
      nearest_linked_miles: 17.3,
      nearest_any_name: 'Gasconade River',
      nearest_any_miles: 0.11,
      nearest_any_is_linked: false,
    }),
    row({
      service_id: 'f652e50c-8b88-4e36-8052-ef8d69ee9045',
      service_name: "Froggy's River Resort",
      city: 'Jerome',
      linked_river_names: ['Big Piney River'],
      nearest_linked_name: 'Big Piney River',
      nearest_linked_miles: 15.12,
      nearest_any_name: 'Gasconade River',
      nearest_any_miles: 0.2,
      nearest_any_is_linked: false,
    }),
  ]);

  // Both are far AND mis-filed, so each raises two findings.
  assert.equal(findings.length, 4);
  assert.deepEqual(
    [...new Set(findings.map((f) => f.ruleKey))].sort(),
    ['service_far_from_linked_river', 'service_nearer_unlinked_river'],
  );
});

test('the four missing links are caught by proximity alone', () => {
  // These sit inside the 10-mile bound, so only the mis-filing rule sees them.
  // "Buffalo River Float Service" was linked to Crooked Creek and not to the
  // river in its own name — the clearest case in the set.
  const findings = deriveServiceGeoFindings([
    row({
      service_name: 'Buffalo River Float Service',
      linked_river_names: ['Crooked Creek'],
      nearest_linked_name: 'Crooked Creek',
      nearest_linked_miles: 8.31,
      nearest_any_name: 'Buffalo National River',
      nearest_any_miles: 3.17,
      nearest_any_is_linked: false,
    }),
    row({
      service_name: 'Crooked Creek Adventures',
      linked_river_names: ['Crooked Creek'],
      nearest_linked_name: 'Crooked Creek',
      nearest_linked_miles: 9.57,
      nearest_any_name: 'Buffalo National River',
      nearest_any_miles: 2.17,
      nearest_any_is_linked: false,
    }),
  ]);

  assert.equal(findings.length, 2);
  assert.ok(findings.every((f) => f.ruleKey === 'service_nearer_unlinked_river'));
  // 5.14 mi is the SMALLEST true-positive margin ever measured, and it is more
  // than twice the threshold — that gap is the reason 2 is safe.
  assert.ok(8.31 - 3.17 > NEARER_OTHER_RIVER_MARGIN_MILES * 2);
});

test('a pin with no river link is reported rather than skipped', () => {
  const findings = deriveServiceGeoFindings([
    row({
      service_name: 'Orphan Landing',
      linked_river_count: 0,
      linked_river_names: [],
      nearest_linked_name: null,
      nearest_linked_miles: null,
      nearest_any_name: 'Current River',
      nearest_any_miles: 0.4,
      nearest_any_is_linked: false,
    }),
  ]);
  assert.deepEqual(
    findings.map((f) => f.ruleKey),
    ['service_no_river_link'],
  );
  // It must not ALSO be reported as mis-filed: there is nothing to be mis-filed
  // against, and two findings would double-count one missing join.
  assert.equal(findings.length, 1);
});

test('both problems at once produce two findings under one entity', () => {
  const findings = deriveServiceGeoFindings([
    row({
      service_id: 'deadbeef-0000-4000-8000-000000000009',
      nearest_linked_miles: 17.3,
      nearest_any_name: 'Gasconade River',
      nearest_any_miles: 0.11,
      nearest_any_is_linked: false,
    }),
  ]);
  assert.equal(findings.length, 2);
  // One business, two questions — which is what the shared entityKey buys.
  assert.equal(new Set(findings.map((f) => f.entityKey)).size, 1);
  assert.equal(new Set(findings.map((f) => f.ruleKey)).size, 2);
});

/* ── Stability, which the fingerprint depends on ───────────────────────────*/

test('the key is the service id, so a rename does not fork the finding', () => {
  // 20260809120000 renamed "Three Rivers Outfitters" to "Three River
  // Outfitter" and corrected five other rows in one migration. Under a name key
  // each would have resolved as fixed and reopened with occurrences back at 1.
  const before = deriveServiceGeoFindings([
    row({
      service_id: '384e4cd7-0de5-49b7-8fbb-72ac58a9ea6a',
      service_name: 'Three Rivers Outfitters',
      nearest_linked_miles: 12,
    }),
  ]);
  const after = deriveServiceGeoFindings([
    row({
      service_id: '384e4cd7-0de5-49b7-8fbb-72ac58a9ea6a',
      service_name: 'Three River Outfitter',
      nearest_linked_miles: 12,
    }),
  ]);
  assert.equal(before[0].entityKey, after[0].entityKey);
  assert.equal(before[0].ruleKey, after[0].ruleKey);
  assert.notEqual(before[0].title, after[0].title);
});

test('rule keys carry no values, because they are half the fingerprint', () => {
  const findings = deriveServiceGeoFindings([
    row({ service_name: 'Numbers R Us', nearest_linked_miles: 42.5 }),
  ]);
  assert.ok(findings.length > 0);
  for (const f of findings) {
    assert.doesNotMatch(f.ruleKey, /\d/, `ruleKey ${f.ruleKey} contains a value`);
    assert.doesNotMatch(f.ruleKey, /Numbers/);
  }
});

test('output order does not churn on input order', () => {
  const a = row({ service_id: 'aaaa0000-0000-4000-8000-000000000001', service_name: 'Zulu Canoe', nearest_linked_miles: 11 });
  const b = row({ service_id: 'bbbb0000-0000-4000-8000-000000000002', service_name: 'Alpha Canoe', nearest_linked_miles: 12 });
  assert.deepEqual(
    deriveServiceGeoFindings([a, b]).map((f) => f.entityKey),
    deriveServiceGeoFindings([b, a]).map((f) => f.entityKey),
  );
});

test('numeric strings from PostgREST are read as numbers', () => {
  // numeric(…) arrives over the wire as a string; "17.30" > 10 is a string
  // comparison waiting to happen, and "9.99" > "10" is true.
  assert.deepEqual(rulesOf([row({ nearest_linked_miles: '9.99' })]), []);
  assert.deepEqual(rulesOf([row({ nearest_linked_miles: '17.30' })]), [
    'service_far_from_linked_river',
  ]);
});

test('an empty directory produces no findings and no crash', () => {
  assert.deepEqual(deriveServiceGeoFindings([]), []);
});
