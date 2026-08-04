// src/lib/trust/checks/gauge-wiring.ts
// The one check in v1 that is new detection rather than a wrapper.
//
// ── What it looks for, and why it is worth the exception ─────────────────
//
// A gauge station that is is_primary = true for more than one river.
//
// USGS 07014000 is exactly that today: 00164_fix_river_gauge_misassociations.sql
// inserts it primary for huzzah (:58) and primary for courtois (:87), because
// Courtois has no gauge of its own and borrows Huzzah's as a five-mile proxy.
// That may well be the right data decision — the ledger does not assume it is
// wrong.
//
// What is not defensible is what the code does with it. Several call sites pick
// a gauge's river with `find(g => g.isPrimary)` — GaugeDetailView.tsx:47,
// GaugeStationMarkers.tsx:47 and :216, eddy-ios/app/gauge/[siteId].tsx:260 and
// :426 — and `find` returns whichever row the query happened to order first. So
// the same gauge can present as Huzzah on the map and Courtois on the detail
// screen, in the same session, with nothing logged.
//
// docs/gauge-alerting-misalignment-audit.md is an entire document about the
// damage this class of ambiguity does when it reaches the alerting path. Making
// the selection deterministic is a code fix; noticing when a NEW one appears is
// this check.

import type { RawFinding, TrustCheck, TrustCheckContext, TrustCheckResult } from '../types';

export interface GaugeRiverLink {
  gaugeStationId: string;
  gaugeLabel: string;
  riverSlug: string;
  isPrimary: boolean;
}

/** Pure. Groups by station and reports any station claimed as primary twice. */
export function deriveDualPrimaryFindings(links: GaugeRiverLink[]): RawFinding[] {
  const primaryRiversByStation = new Map<string, { label: string; rivers: string[] }>();

  for (const link of links) {
    if (!link.isPrimary) continue;
    const entry = primaryRiversByStation.get(link.gaugeStationId);
    if (entry) entry.rivers.push(link.riverSlug);
    else primaryRiversByStation.set(link.gaugeStationId, { label: link.gaugeLabel, rivers: [link.riverSlug] });
  }

  const findings: RawFinding[] = [];
  for (const [stationId, entry] of primaryRiversByStation) {
    if (entry.rivers.length < 2) continue;
    const rivers = [...entry.rivers].sort();
    findings.push({
      entityType: 'gauge',
      entityKey: entry.label || stationId,
      ruleKey: 'gauge_dual_primary',
      title: `${entry.label}: primary gauge for ${rivers.length} rivers`,
      detail: `Marked is_primary for ${rivers.join(', ')}. Any code selecting a gauge's river with find(isPrimary) resolves this arbitrarily, so the same gauge can present as a different river on different surfaces.`,
      evidence: { gaugeStationId: stationId, rivers },
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
      .select('is_primary, gauge_station_id, rivers!inner(slug), gauge_stations!inner(name, usgs_site_id)')
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
    }));

    // Scope is the primary links examined. Zero of them means either every
    // river lost its primary gauge or the query is broken, and both deserve the
    // empty_scope refusal rather than a clean sweep.
    return { scopeCount: links.length, findings: deriveDualPrimaryFindings(links) };
  },
};
