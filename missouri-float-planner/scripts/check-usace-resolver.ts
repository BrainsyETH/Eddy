// scripts/check-usace-resolver.ts
// Resolve every registered dam's metrics against the LIVE CWMS catalog and
// report what the resolver would actually serve.
//
//   npx tsx scripts/check-usace-resolver.ts            # every dam with an office
//   npx tsx scripts/check-usace-resolver.ts swt-tenkiller-dam
//
// Read-only: it issues GETs to a public, unauthenticated API and writes nothing.
// Deliberately NOT in the `test` script — it needs the network, and CI has to
// stay hermetic. Run it by hand when adding a dam or a district.
//
// WHY THIS EXISTS. On 2026-08-02 the resolver was returning MONTHLY AVERAGES in
// place of hourly readings for every dam it was asked about: CWMS had frozen its
// catalog's `latest-time`/`last-update` stamps six days in the past, the 36-hour
// freshness gate therefore disqualified every live hourly series, and `~1Month`
// aggregates — stamped to the start of a future month — slipped under the gate
// instead. Bull Shoals resolved 4 of 8 metrics, all monthly; Tenkiller resolved
// nothing. No test caught it, and no test could have: the unit tests are pure
// and score synthetic catalogs, so they cannot see a live upstream regression,
// and every shipped dam pins explicit ids that win over resolution, so nothing
// in production exercised the broken path.
//
// The check that would have caught it is the one below — compare what the
// resolver picks against what the registry pins, and refuse to accept an
// aggregate interval as an answer.

import {
  USACE_DAMS,
  type UsaceDam,
  type UsaceMetric,
} from '../src/lib/flow-providers/usace-registry';
import { RESOLVABLE_METRICS, resolveSeries, parseTsId } from '../src/lib/usace/resolve';

/** Intervals that summarise a period. Serving one as a current reading is the bug. */
const AGGREGATE = /^~?1(Week|Month|Year|Decade)$/i;

interface Row {
  metric: UsaceMetric;
  resolved: string | null;
  pinned: string | null;
  value: string;
  age: string;
  flags: string[];
}

function ageOf(iso: number | undefined): string {
  if (iso === undefined) return '—';
  const h = (Date.now() - iso) / 3_600_000;
  if (h < 0) return `+${(-h).toFixed(0)}h`; // a forecast, ahead of now
  if (h < 48) return `${h.toFixed(0)}h`;
  return `${(h / 24).toFixed(0)}d`;
}

async function checkDam(dam: UsaceDam): Promise<{ rows: Row[]; problems: string[] }> {
  const resolved = await resolveSeries(dam.office!, dam.cdaLocation!, [...RESOLVABLE_METRICS]);
  const rows: Row[] = [];
  const problems: string[] = [];

  for (const metric of RESOLVABLE_METRICS) {
    const hit = resolved[metric];
    const pinned = dam.series[metric]?.tsId ?? null;
    const flags: string[] = [];

    if (hit) {
      const interval = parseTsId(hit.tsId)?.interval ?? '';
      if (AGGREGATE.test(interval)) {
        flags.push('AGGREGATE');
        problems.push(`${dam.id}.${metric} resolved to a ${interval} aggregate (${hit.tsId})`);
      }
      // The resolver finds these; the dam page deliberately does not show them.
      // Marked so the script is not read as a promise about what renders.
      if (dam.suppressMetrics?.includes(metric)) flags.push('SUPPRESSED-IN-UI');
      // A pin that no longer matches is not automatically wrong — the resolver
      // may have found a better series — but it is always worth a human look.
      if (pinned && pinned !== hit.tsId) flags.push('DIFFERS-FROM-PIN');
    } else if (pinned) {
      flags.push('PIN-UNRESOLVED');
      problems.push(`${dam.id}.${metric} is pinned but the resolver found nothing`);
    }

    rows.push({
      metric,
      resolved: hit?.tsId ?? null,
      pinned,
      value: hit?.probed ? `${hit.probed.value.toFixed(2)} ${hit.unit}` : '—',
      age: ageOf(hit?.probed?.timestamp),
      flags,
    });
  }

  if (rows.every((r) => !r.resolved)) {
    problems.push(`${dam.id} resolved NOTHING — check office/cdaLocation`);
  }

  return { rows, problems };
}

async function main(): Promise<void> {
  const requested = process.argv.slice(2);
  const dams = Object.values(USACE_DAMS).filter((d) => {
    if (!d.office || !d.cdaLocation) return false;
    return requested.length === 0 || requested.includes(d.id);
  });

  if (dams.length === 0) {
    console.error(
      requested.length > 0
        ? `No dam with a CWMS office matched: ${requested.join(', ')}`
        : 'No dams have a CWMS office — nothing to resolve.'
    );
    process.exit(1);
  }

  console.log(`Resolving ${dams.length} dam(s) against the live CWMS catalog.\n`);

  const allProblems: string[] = [];
  let resolvedCount = 0;
  let metricCount = 0;

  for (const dam of dams) {
    const { rows, problems } = await checkDam(dam);
    allProblems.push(...problems);

    const got = rows.filter((r) => r.resolved).length;
    resolvedCount += got;
    metricCount += rows.length;

    console.log(`${dam.name}  [${dam.office}/${dam.cdaLocation}]  ${got}/${rows.length}`);
    for (const r of rows) {
      if (!r.resolved && !r.pinned) continue; // a metric this project simply lacks
      const mark = r.flags.length > 0 ? `  <-- ${r.flags.join(', ')}` : '';
      const id = r.resolved ?? '(unresolved)';
      console.log(
        `   ${r.metric.padEnd(19)} ${r.value.padStart(14)}  ${r.age.padStart(5)}  ${id}${mark}`
      );
    }
    const absent = rows.filter((r) => !r.resolved && !r.pinned).map((r) => r.metric);
    if (absent.length > 0) console.log(`   not published here: ${absent.join(', ')}`);
    console.log();
  }

  console.log(`Resolved ${resolvedCount}/${metricCount} metrics across ${dams.length} dam(s).`);

  if (allProblems.length > 0) {
    console.error(`\n${allProblems.length} problem(s):`);
    for (const p of allProblems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log('No aggregate resolutions and no unresolved pins.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
