import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { toRawFinding } from './validate-river-data';
import { fingerprint } from '../fingerprint';
import { VALIDATE_RIVER_DATA_RULES } from '../severity';

// ── why this file exists ─────────────────────────────────────────
//
// The wrapper had no tests, and the two things it does are both load-bearing:
// it decides which rules are about a gauge rather than a river, and it decides
// what becomes the entity key — which IS the finding's identity.
//
// The migration assertions below are the same trade segment-cache-policy.test.ts
// makes: the TypeScript is only correct if the SQL feeding it returns what this
// file assumes, and nothing else in CI can see inside a Postgres function.

const MIGRATION_FILE = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260804193100_validate_river_data_stable_gauge_key.sql',
  ),
  'utf8',
);

/**
 * The executable half only.
 *
 * The header comment quotes the defect it removes — `COALESCE(r.slug, gs.name)`
 * — so a scan of the whole file would find the string it is asserting is gone,
 * and the test would fail on its own explanation. Assert on what Postgres runs.
 */
const MIGRATION = MIGRATION_FILE.slice(
  MIGRATION_FILE.indexOf('CREATE OR REPLACE FUNCTION validate_river_data'),
);

test('the gauge rule keys on the station id, not on a display name', () => {
  // The defect: COALESCE(r.slug, gs.name) meant an unlinked gauge was
  // identified by prose, so an editorial rename forked the finding's identity.
  assert.match(
    MIGRATION,
    /SELECT gs\.id::text, 'gauge_missing_site_id'/,
    'gauge_missing_site_id must select the stable station id as its entity key',
  );
  assert.doesNotMatch(
    MIGRATION,
    /COALESCE\(r\.slug, gs\.name\)/,
    'the COALESCE onto a human name is the defect being removed',
  );
});

test('the gauge rule no longer joins through rivers', () => {
  // The second half of the same defect: the LEFT JOINs produced one row per
  // linked river, so a gauge that is correctly primary for both Huzzah and
  // Courtois raised the same problem twice under two different keys.
  const branch = MIGRATION.slice(MIGRATION.indexOf("'gauge_missing_site_id'"));
  const untilNextRule = branch.slice(0, branch.indexOf('UNION ALL'));
  assert.doesNotMatch(untilNextRule, /JOIN river_gauges|JOIN rivers/);
  assert.match(untilNextRule, /gs\.name/, 'the name must survive, in the detail');
});

test('the migration reproduces all twenty rules, not a subset', () => {
  // CREATE OR REPLACE FUNCTION has no partial form, so this migration restates
  // the whole body. A dropped branch would silently stop a rule from ever
  // firing again — a check that cannot see, reporting a confident pass.
  assert.equal(MIGRATION.match(/UNION ALL/g)?.length, 19, 'twenty branches means nineteen unions');
  assert.equal(VALIDATE_RIVER_DATA_RULES.length, 20);
  for (const rule of VALIDATE_RIVER_DATA_RULES) {
    assert.ok(MIGRATION.includes(`'${rule}'`), `${rule} must survive the replacement`);
  }
});

// ── the wrapper's own judgement ──────────────────────────────────

function row(overrides: Partial<Parameters<typeof toRawFinding>[0]> = {}) {
  return {
    river_slug: 'current',
    check_name: 'stale_gauge',
    severity: 'warning',
    detail: 'Primary gauge last reported 2026-08-01 09:00',
    ...overrides,
  };
}

test('a river-scoped rule keeps the slug as its key and title', () => {
  const finding = toRawFinding(row());
  assert.equal(finding.entityType, 'river');
  assert.equal(finding.entityKey, 'current');
  assert.equal(finding.title, 'current: stale gauge');
});

test('a gauge-scoped rule titles from the detail rather than the opaque key', () => {
  // The key is a UUID now. It is the right thing to fingerprint and the wrong
  // thing to show a person, so the title comes from the sentence the SQL wrote.
  const finding = toRawFinding(
    row({
      check_name: 'gauge_missing_site_id',
      river_slug: '3f2a1c9e-0b44-4d1a-9f7e-2c8b5d6a1e30',
      detail: 'gauge station "Current River at Van Buren" has neither site_id_external nor usgs_site_id',
    }),
  );

  assert.equal(finding.entityType, 'gauge');
  assert.equal(finding.entityKey, '3f2a1c9e-0b44-4d1a-9f7e-2c8b5d6a1e30');
  assert.match(finding.title, /Current River at Van Buren/);
  assert.equal(finding.evidence!.gaugeStationId, '3f2a1c9e-0b44-4d1a-9f7e-2c8b5d6a1e30');
});

test('renaming the station changes the title but not the fingerprint', () => {
  // The property the whole migration exists to buy. detail is excluded from the
  // fingerprint on purpose, which is what lets the display name move freely.
  const id = '3f2a1c9e-0b44-4d1a-9f7e-2c8b5d6a1e30';
  const before = toRawFinding(
    row({
      check_name: 'gauge_missing_site_id',
      river_slug: id,
      detail: 'gauge station "Current River at Van Buren" has neither site_id_external nor usgs_site_id',
    }),
  );
  const after = toRawFinding(
    row({
      check_name: 'gauge_missing_site_id',
      river_slug: id,
      detail: 'gauge station "Current River near Van Buren" has neither site_id_external nor usgs_site_id',
    }),
  );

  assert.notEqual(before.title, after.title);
  assert.equal(
    fingerprint('validate_river_data', before),
    fingerprint('validate_river_data', after),
  );
});
