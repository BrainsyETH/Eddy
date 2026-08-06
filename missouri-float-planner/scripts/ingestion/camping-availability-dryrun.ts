// scripts/ingestion/camping-availability-dryrun.ts
// Fetch availability for every enabled facility and print it. Writes nothing.
//
//   npx tsx scripts/ingestion/camping-availability-dryrun.ts [source]
//
// Runs at PRODUCTION spacing by default, because the pacing is the thing most
// worth checking: if this takes four minutes, so does the cron, and the cron
// has a 300s ceiling. Pass --fast to skip the waiting when you only care that
// the parsing is right.
//
// Reads campsite_facilities, so it needs the migration applied and the same
// Supabase env the app uses. Behind a proxy that Node's fetch ignores, prefix
// with NODE_USE_ENV_PROXY=1.

import { createClient } from '@supabase/supabase-js';
import { createLimiter } from '../../src/lib/camping/limiter';
import { resolveHorizon, resolveWeekend } from '../../src/lib/camping/window';
import { summarizeWindow, type CampingSource, type FacilityLink } from '../../src/lib/camping/types';
import * as recgov from '../../src/lib/camping/recgov';
import type { MonthCache } from '../../src/lib/camping/recgov';
import * as usedirect from '../../src/lib/camping/usedirect';

const FAST = process.argv.includes('--fast');
/** One sample site list per source is enough to see the shape. */
const shown = new Set<CampingSource>();
const ONLY = process.argv.find((a) => a === 'recreation_gov' || a === 'mo_state_parks') as
  | CampingSource
  | undefined;

const CONFIG = {
  recreation_gov: { spacing: 10_000, jitter: 1_000, fetch: recgov.fetchWindow },
  mo_state_parks: { spacing: 2_000, jitter: 500, fetch: usedirect.fetchWindow },
} as const;

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new Error('Set NEXT_PUBLIC_SUPABASE_URL and a Supabase key.');

  const supabase = createClient(url, key);
  // What the cron stores. The weekend below is only what a CARD says about it,
  // and printing both is the point: a horizon folded like a weekend is the
  // mistake this script exists to make visible.
  const window = resolveHorizon();
  const weekend = resolveWeekend();
  console.log(`horizon: ${window.label}  (${window.nights.length} nights)`);
  console.log(`weekend: ${weekend.label}  (nights ${weekend.nights.join(', ')})\n`);

  const { data, error } = await supabase
    .from('campsite_facilities')
    .select('id, source, source_facility_id, source_loop, display_name, kind')
    .eq('enabled', true)
    .order('source')
    .order('display_name');

  if (error) throw new Error(`campsite_facilities: ${error.message} (migration applied?)`);

  const sources = (ONLY ? [ONLY] : (['recreation_gov', 'mo_state_parks'] as const)).filter((s) =>
    (data ?? []).some((r) => r.source === s),
  );

  for (const source of sources) {
    const config = CONFIG[source];
    const limiter = createLimiter({
      name: source,
      minSpacingMs: FAST ? 0 : config.spacing,
      jitterMs: FAST ? 0 : config.jitter,
      maxRequests: 200,
      breakerThreshold: 3,
    });

    const rows = (data ?? []).filter((r) => r.source === source);
    // Mirrors the cron: loops behind one district id share a single fetch.
    const cache: MonthCache = new Map();
    console.log(`── ${source} (${rows.length} facilities, ${FAST ? 'fast' : `${config.spacing / 1000}s`} spacing)`);
    const startedAt = Date.now();

    for (const row of rows) {
      const facility: FacilityLink = {
        id: row.id,
        source: row.source as CampingSource,
        sourceFacilityId: row.source_facility_id,
        sourceLoop: row.source_loop,
        displayName: row.display_name,
        kind: row.kind as FacilityLink['kind'],
      };

      try {
        const result = await config.fetch(facility, window, limiter, cache);
        const { nights, sites, siteNights } = result;

        // Folded over the WEEKEND, never the horizon — the same slice the read
        // path takes. summarizeWindow minimises across the nights it is given,
        // so handing it fourteen reports one busy Saturday as "fully booked".
        const inWeekend = new Set(weekend.nights);
        const summary = summarizeWindow(nights.filter((n) => inWeekend.has(n.date)));

        // A compact fortnight, so the strip's shape is visible in a terminal.
        const strip = nights
          .map((n) =>
            n.status === 'closed' || n.status === 'not_yet_released'
              ? '·'
              : n.sitesOpen === 0
                ? '0'
                : '▁▂▃▄▅▆▇█'[
                    Math.min(7, Math.floor((n.sitesOpen / Math.max(1, n.sitesReservable)) * 8))
                  ],
          )
          .join('');

        console.log(
          `  ${facility.displayName.padEnd(30)} ` +
            (summary
              ? `${String(summary.sitesOpen).padStart(3)}/${String(summary.sitesReservable).padEnd(4)} ${summary.status.padEnd(8)}`
              : ' no weekend data      ') +
            ` ${strip.padEnd(16)} ${String(sites.length).padStart(3)} sites, ${siteNights.length} site-nights`,
        );

        // The list a person will actually scroll, for the first facility that
        // has one. Names come from the availability payload itself — no RIDB.
        if (sites.length > 0 && !shown.has(source)) {
          shown.add(source);
          const sample = sites.slice(0, 4).map((s) => `${s.name ?? s.sourceSiteId}${s.siteType ? ` (${s.siteType})` : ''}${s.loop ? ` — ${s.loop}` : ''}`);
          console.log(`      sample sites: ${sample.join(' | ')}`);
        }
      } catch (err) {
        console.log(
          `  ${facility.displayName.padEnd(30)} FAILED — ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const stats = limiter.stats();
    console.log(
      `  → ${stats.attempts} requests, ${stats.failures} failures, ` +
        `peak concurrency ${stats.maxObservedConcurrency}, ` +
        `${((Date.now() - startedAt) / 1000).toFixed(1)}s\n`,
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
