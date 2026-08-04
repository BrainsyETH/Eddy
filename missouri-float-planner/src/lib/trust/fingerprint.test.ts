import assert from 'node:assert/strict';
import test from 'node:test';
import { fingerprint, normalizeEntityKey } from './fingerprint';

const BASE = {
  entityType: 'river' as const,
  entityKey: 'current-river',
  ruleKey: 'threshold_order',
};

// ── the bug this module exists to prevent ────────────────────────

test('the fingerprint ignores everything that changes between runs', () => {
  // The regression: fold detail into the identity and every hourly run raises a
  // fresh finding and resolves yesterday's, because details carry live values
  // ("stale since 14:30", "1,240 m off the line"). The ledger becomes pure churn
  // and proves nothing about whether anything was ever fixed.
  //
  // The signature only accepts the three stable fields, so this test is really
  // asserting that the shape stays that way.
  const a = fingerprint('validate_river_data', BASE);
  const b = fingerprint('validate_river_data', { ...BASE });
  assert.equal(a, b);
});

test('different rules on the same entity are different findings', () => {
  // Otherwise fixing the threshold order would silently close the stale-gauge
  // finding on the same river.
  const a = fingerprint('validate_river_data', BASE);
  const b = fingerprint('validate_river_data', { ...BASE, ruleKey: 'stale_gauge' });
  assert.notEqual(a, b);
});

test('the same rule on different entities are different findings', () => {
  const a = fingerprint('validate_river_data', BASE);
  const b = fingerprint('validate_river_data', { ...BASE, entityKey: 'jacks-fork' });
  assert.notEqual(a, b);
});

test('the same rule under different checks are different findings', () => {
  // Two checks may legitimately emit the same rule key against the same entity;
  // each owns its own reconciliation and must not resolve the other's rows.
  const a = fingerprint('validate_river_data', BASE);
  const b = fingerprint('river_geometry', BASE);
  assert.notEqual(a, b);
});

test('entity type participates in the identity', () => {
  const a = fingerprint('c', { ...BASE, entityType: 'river', entityKey: 'huzzah' });
  const b = fingerprint('c', { ...BASE, entityType: 'gauge', entityKey: 'huzzah' });
  assert.notEqual(a, b);
});

// ── the gauge_missing_site_id wart ───────────────────────────────

test('an entity key that is a human name survives cosmetic renaming', () => {
  // validate_river_data()'s gauge_missing_site_id rule returns
  // COALESCE(r.slug, gs.name) — 00164_harden_river_validation.sql:180 — so its
  // entity key can be a gauge NAME, not a slug. Without normalization, editing
  // the display name would resolve the old finding as fixed and open an
  // identical new one, both wrongly.
  const a = fingerprint('validate_river_data', {
    entityType: 'gauge',
    entityKey: 'Current River at Van Buren',
    ruleKey: 'gauge_missing_site_id',
  });
  const b = fingerprint('validate_river_data', {
    entityType: 'gauge',
    entityKey: 'current river  at  van buren',
    ruleKey: 'gauge_missing_site_id',
  });
  assert.equal(a, b);
});

test('normalizeEntityKey leaves an ordinary slug alone', () => {
  assert.equal(normalizeEntityKey('eleven-point'), 'eleven-point');
});

test('normalizeEntityKey strips punctuation and edge separators', () => {
  assert.equal(normalizeEntityKey('  Huzzah Creek (proxy) '), 'huzzah-creek-proxy');
  assert.equal(normalizeEntityKey('#07014000#'), '07014000');
});

// ── shape ────────────────────────────────────────────────────────

test('the fingerprint is 32 hex characters', () => {
  // Short enough to read in a log line and an admin table; 128 bits is far more
  // than a table of this size can collide on.
  const fp = fingerprint('validate_river_data', BASE);
  assert.match(fp, /^[0-9a-f]{32}$/);
});
