// src/lib/trust/checks/gauge-wiring.ts
// The one check in v1 that is new detection rather than a wrapper.
//
// ── What it looks for, and what it deliberately does NOT ─────────────────
//
// It does NOT flag "this gauge is primary for more than one river". That is a
// legitimate arrangement: Courtois Creek has no gauge of its own and borrows
// Huzzah's, so USGS 07014000 is correctly primary for both
// (00164_fix_river_gauge_misassociations.sql:58 and :87). `is_primary` means
// "the primary gauge FOR THIS RIVER", and each river still has exactly one.
// A check that reported it would be a permanent false positive against correct
// data — the kind that teaches an operator to stop reading the list.
//
// What it flags is an UNRESOLVABLE tie: two or more primary links that nothing
// in the data can order. The ambiguity that matters runs the other way round —
// given a gauge, which river is it? — and every consumer used to answer with
// `find(g => g.isPrimary)`, which returns whichever row the query ordered
// first. The same gauge could present as Huzzah on the map and Courtois on the
// detail screen in one session.
//
// That is now resolved in code by shared/primary-river-link.ts, using the
// tiebreak already in the data: distance_from_section_miles is 0.0 for Huzzah
// and 5.0 for Courtois, because the gauge physically sits on the Huzzah.
// Nearest wins, deterministically and correctly.
//
// So this check is the guard on that tiebreak: it fires when two primaries sit
// at the same distance, or when a distance is missing, because then the code
// falls back to alphabetical order and a human should decide instead.
//
// docs/gauge-alerting-misalignment-audit.md is an entire document about the
// damage this class of ambiguity does when it reaches the alerting path.

import { hasUnresolvablePrimaryTie } from '@shared/primary-river-link';
import type { RawFinding, TrustCheck, TrustCheckContext, TrustCheckResult } from '../types';

export interface GaugeRiverLink {
  gaugeStationId: string;
  gaugeLabel: string;
  riverSlug: string;
  isPrimary: boolean;
  distanceFromSectionMiles: number | null;
}

/** Pure. Reports stations whose primary links cannot be ordered. */
export function deriveDualPrimaryFindings(links: GaugeRiverLink[]): RawFinding[] {
  const byStation = new Map<string, { label: string; links: GaugeRiverLink[] }>();

  for (const link of links) {
    if (!link.isPrimary) continue;
    const entry = byStation.get(link.gaugeStationId);
    if (entry) entry.links.push(link);
    else byStation.set(link.gaugeStationId, { label: link.gaugeLabel, links: [link] });
  }

  const findings: RawFinding[] = [];
  for (const [stationId, entry] of byStation) {
    if (!hasUnresolvablePrimaryTie(entry.links)) continue;

    const rivers = entry.links
      .map((l) => `${l.riverSlug} (${l.distanceFromSectionMiles ?? 'no distance'})`)
      .sort();
    findings.push({
      entityType: 'gauge',
      entityKey: entry.label || stationId,
      ruleKey: 'gauge_dual_primary',
      title: `${entry.label}: primary for ${entry.links.length} rivers with no tiebreak`,
      detail: `Primary for ${rivers.join(', ')}. Sharing a gauge is fine — Courtois borrows Huzzah's — but these links cannot be ordered by distance_from_section_miles, so the code falls back to alphabetical order when asked which river this gauge is on. Set the distances, or demote one link.`,
      evidence: {
        gaugeStationId: stationId,
        rivers: entry.links.map((l) => ({
          slug: l.riverSlug,
          distanceFromSectionMiles: l.distanceFromSectionMiles,
        })),
      },
    });
  }

  // Deterministic order so a run's output does not churn on Map iteration.
  return findings.sort((a, b) => a.entityKey.localeCompare(b.entityKey));
}

export const gaugeWiringCheck: TrustCheck = {
  id: 'gauge_wiring',
  title: 'Gauge-to-river wiring',
  cadence: 'daily',

  async run(ctx: TrustCheckContext): Promise<TrustCheckResult> {
    const { data, error } = await ctx.supabase
      .from('river_gauges')
      .select(
        'is_primary, gauge_station_id, distance_from_section_miles, rivers!inner(slug), gauge_stations!inner(name, usgs_site_id)',
      )
      .eq('is_primary', true);

    if (error) {
      throw new Error(`Failed to load river_gauges: ${error.message}`);
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows: any[] = data ?? [];
    const links: GaugeRiverLink[] = rows.map((row) => ({
      gaugeStationId: row.gauge_station_id,
      gaugeLabel: row.gauge_stations?.usgs_site_id
        ? `${row.gauge_stations.name} (${row.gauge_stations.usgs_site_id})`
        : (row.gauge_stations?.name ?? row.gauge_station_id),
      riverSlug: row.rivers?.slug ?? 'unknown',
      isPrimary: row.is_primary === true,
      distanceFromSectionMiles:
        row.distance_from_section_miles === null || row.distance_from_section_miles === undefined
          ? null
          : Number(row.distance_from_section_miles),
    }));

    // Scope is the primary links examined. Zero of them means either every
    // river lost its primary gauge or the query is broken, and both deserve the
    // empty_scope refusal rather than a clean sweep.
    return { scopeCount: links.length, findings: deriveDualPrimaryFindings(links) };
  },
};
