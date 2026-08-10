// scripts/trust/usgs-drift-dryrun.mts
// Runs the usgs_site_drift comparison against the LIVE USGS API and a scope
// captured from production, without writing anything anywhere.
//
// Why this exists as a script rather than a test: the unit tests cover the
// comparison arithmetic against fixtures, deliberately, because a test that
// calls USGS would fail CI whenever USGS is slow. But fixtures cannot tell you
// whether the request shape is right, whether the field names still match, or
// what the check would actually file on the first scheduled run — and shipping
// a source check without knowing that is how a rule that never fires, or one
// that fires on all 43 stations, reaches production.
//
//   npx tsx scripts/trust/usgs-drift-dryrun.mts <scope.json>
//
// The scope file is the output of trust_usgs_site_scope() as JSON.

import { readFileSync } from 'node:fs';
import { fetchSitesByIds } from '../../src/lib/usgs/national-sites';
import { deriveSiteDriftFindings, foldStationRows } from '../../src/lib/trust/checks/usgs-site-drift';
import { severityForRule } from '../../src/lib/trust/severity';

const scopeFile = process.argv[2];
if (!scopeFile) throw new Error('usage: usgs-drift-dryrun.mts <scope.json>');

const rows = JSON.parse(readFileSync(scopeFile, 'utf8'));
const stored = foldStationRows(rows);
console.log(`scope: ${rows.length} links -> ${stored.length} stations`);

const started = Date.now();
const { found, unreached } = await fetchSitesByIds(stored.map((s) => s.siteId));
console.log(`usgs:  ${found.size} found, ${unreached.length} unreached, ${Date.now() - started}ms`);

const findings = deriveSiteDriftFindings({
  stored,
  source: found,
  unreached: new Set(unreached),
});

console.log(`\nfindings: ${findings.length}`);
const byRule = new Map<string, number>();
for (const f of findings) byRule.set(f.ruleKey, (byRule.get(f.ruleKey) ?? 0) + 1);
for (const [rule, count] of [...byRule].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${severityForRule(rule).padEnd(8)} ${rule.padEnd(28)} ${count}`);
}
for (const f of findings) {
  console.log(`\n[${severityForRule(f.ruleKey)}] ${f.title}\n  ${f.detail}`);
}

// ── sabotage ────────────────────────────────────────────────────────────
//
// Zero findings is the answer we want and the answer a blind check gives. This
// is the difference: perturb the STORED side and confirm the same comparison
// against the same live response reports each rule. Run with --sabotage.
//
// It is the manual step TRUST_LEDGER_V1_PLAN.md called the one that mattered
// most and the one least likely to be repeated by hand — here it is one flag.
if (process.argv.includes('--sabotage')) {
  const victim = stored[0];
  const sabotaged = [
    { ...victim, siteId: victim.siteId, name: `${victim.name} (renamed upstream)` },
    { ...stored[1], lat: stored[1].lat + 0.01 },
    {
      ...stored[2],
      drainageAreaSqMi: (stored[2].drainageAreaSqMi ?? 100) * 1.5,
    },
    { ...stored[3], siteId: '99999999' },
  ];

  const sabotageFindings = deriveSiteDriftFindings({
    stored: sabotaged,
    source: found,
    unreached: new Set(unreached),
  });

  console.log(`\n── sabotage: ${sabotageFindings.length} findings from 4 perturbed stations ──`);
  for (const f of sabotageFindings) {
    console.log(`  [${severityForRule(f.ruleKey)}] ${f.ruleKey}: ${f.title}`);
  }

  const rules = new Set(sabotageFindings.map((f) => f.ruleKey));
  const expected = [
    'usgs_site_renamed',
    'usgs_site_moved',
    'usgs_site_drainage_changed',
    'usgs_site_absent',
  ];
  const missed = expected.filter((r) => !rules.has(r));
  console.log(
    missed.length === 0
      ? '\n  every rule fired against the live response'
      : `\n  RULES THAT DID NOT FIRE: ${missed.join(', ')}`,
  );
  process.exit(missed.length === 0 ? 0 : 1);
}
