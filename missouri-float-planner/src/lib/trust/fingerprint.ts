// src/lib/trust/fingerprint.ts
// The stable identity of a finding.
//
// Everything the ledger is for depends on this being right. If a finding's
// fingerprint changes between runs, it is a new finding every hour and nothing
// ever resolves; if two different problems collide onto one fingerprint, fixing
// either one silently closes both.

import { createHash } from 'node:crypto';
import type { TrustEntityType } from './types';

export interface FingerprintInput {
  entityType: TrustEntityType;
  entityKey: string;
  ruleKey: string;
}

/**
 * Collapses an entity key to a stable token.
 *
 * Mostly a no-op on slugs and ids, which are already normalized. It exists to
 * absorb incidental differences in how the same key is spelled between runs:
 * case, punctuation, and runs of whitespace.
 *
 * ── What it does NOT do ─────────────────────────────────────────────────
 *
 * This comment used to claim it made human-facing keys rename-safe, on the
 * strength of validate_river_data()'s `gauge_missing_site_id` rule returning
 * `COALESCE(r.slug, gs.name)`. That claim was wrong, and the test beneath it
 * only ever demonstrated the cosmetic case.
 *
 * Normalization cannot survive an EDITORIAL rename, because the tokens change:
 * "Current River at Van Buren" and "Current River near Van Buren" normalize to
 * different strings, and always will. Nothing here can fix that — the only fix
 * is not to key on prose in the first place.
 *
 * So both callers that were doing so no longer do. The SQL rule now returns
 * `gs.id` (20260804193100_validate_river_data_stable_gauge_key.sql) and
 * gauge_wiring keys on the station id rather than its label. Display names live
 * in `title` and `detail`, which are excluded from the fingerprint on purpose.
 *
 * Keep this function anyway: it is cheap, it is correct for what it claims now,
 * and a future rule keyed on something semi-structured should not have to
 * rediscover that trailing whitespace forks an identity.
 */
export function normalizeEntityKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * sha256(checkId | entityType | entityKey | ruleKey), first 32 hex chars.
 *
 * `detail` is deliberately absent. Details carry the values that made the rule
 * fire — "stale since 2026-08-04 14:30", "1,240 m from the river line" — and
 * those move on every run. Folding them in would mean every run raised a fresh
 * finding and resolved yesterday's, producing a ledger that is pure churn and
 * proves nothing. The row's detail and evidence are updated in place instead,
 * and its identity survives.
 *
 * 32 hex chars is 128 bits. Collision is not a practical concern at any
 * population this table will reach, and the shorter value stays readable in an
 * admin table and a log line.
 */
export function fingerprint(checkId: string, input: FingerprintInput): string {
  const parts = [
    checkId,
    input.entityType,
    normalizeEntityKey(input.entityKey),
    input.ruleKey,
  ];
  return createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 32);
}
