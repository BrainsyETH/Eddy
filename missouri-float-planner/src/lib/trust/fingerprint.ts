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
 * Mostly this is a no-op on slugs, which are already normalized. It exists for
 * one specific wart: validate_river_data()'s `gauge_missing_site_id` rule
 * returns `COALESCE(r.slug, gs.name)` (00164_harden_river_validation.sql:180),
 * so that one rule's key can be a human gauge NAME — "Current River at Van
 * Buren" — rather than a slug. Without normalization, an editorial rename of a
 * gauge would fork the finding's identity: the old one would resolve as fixed
 * and an identical new one would open, both wrongly.
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
