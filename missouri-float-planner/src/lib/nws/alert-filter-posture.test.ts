import assert from 'node:assert/strict';
import test from 'node:test';
import { filterAlertsForRiver, type NWSAlert } from './alerts';
import { ALL_TRUST_RULES, severityForRule } from '@/lib/trust/severity';
import { hasRemediation, remediationFor } from '@/lib/trust/remediation';

// ── The posture, pinned ───────────────────────────────────────────────────
//
// The hardcoded LEGACY_RIVER_SEARCH_TERMS map is gone, which makes "a river
// with no terms" reachable in production for the first time. What this
// function does in that case is a decision the codebase already made once and
// wrote down in src/lib/alerts/river-alerts.ts: the helper fails OPEN because
// only prompt builders call it, and the screen path guards itself at its own
// boundary instead.
//
// This test exists because the removal made that decision easy to reverse by
// accident — it looks like a missing null check right up until you read the
// other file.

function alert(headline: string, areaDesc: string): NWSAlert {
  return {
    id: `urn:${headline}`,
    event: 'Flood Warning',
    headline,
    description: '',
    areaDesc,
    severity: 'Severe',
    urgency: 'Immediate',
    onset: '2026-08-22T00:00:00Z',
    expires: '2026-08-23T00:00:00Z',
  };
}

test('a river with no canonical terms gets the whole feed, not silence', () => {
  const feed = [
    alert('Flood Warning for Shannon County', 'Shannon County, MO'),
    alert('Flood Warning for Boone County', 'Boone County, MO'),
  ];

  assert.deepEqual(
    filterAlertsForRiver(feed, 'brand-new-creek', null),
    feed,
    'null terms must fall back to the unfiltered feed — a prompt told "no alerts" is worse than one told too many',
  );
  assert.deepEqual(
    filterAlertsForRiver(feed, 'brand-new-creek', []),
    feed,
    'an empty array is the same case as null',
  );
});

test('canonical terms still filter', () => {
  const feed = [
    alert('Flood Warning for Shannon County', 'Shannon County, MO'),
    alert('Flood Warning for Boone County', 'Boone County, MO'),
  ];
  const matched = filterAlertsForRiver(feed, 'current', ['shannon county']);

  assert.equal(matched.length, 1);
  assert.match(matched[0].headline, /Shannon/);
});

// ── The findings this check can emit must be classified ───────────────────
//
// severityForRule() falls back to 'high' and remediationFor() to a generic
// "no remediation recorded" for any rule it does not know. Both are silent,
// so a check emitting unregistered keys files plausible-looking findings that
// nobody triaged the severity of. river_metadata was the first check to do it.

const RIVER_METADATA_RULE_KEYS = [
  'canonical_weather_missing',
  'canonical_alert_terms_missing',
  'canonical_rain_lag_missing',
  'canonical_river_note_missing',
];

test('every canonical river-metadata rule is registered and classified', () => {
  for (const rule of RIVER_METADATA_RULE_KEYS) {
    assert.ok(
      (ALL_TRUST_RULES as readonly string[]).includes(rule),
      `${rule} is emitted by river_metadata but missing from ALL_TRUST_RULES`,
    );
    assert.ok(hasRemediation(rule), `${rule} has no remediation entry`);
    assert.notEqual(
      remediationFor(rule).kind,
      'mechanical',
      `${rule} needs a human to source the value — it must not read as automatable`,
    );
  }
});

test('the alert-terms gap outranks the cosmetic ones', () => {
  // Not an arbitrary ordering. Missing terms degrade what Eddy is told about
  // severe weather; a missing river_note costs a sentence of local color.
  const rank = { critical: 0, high: 1, medium: 2, low: 3 } as const;
  assert.ok(
    rank[severityForRule('canonical_alert_terms_missing')] <
      rank[severityForRule('canonical_river_note_missing')],
  );
});
