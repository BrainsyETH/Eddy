// src/app/api/high-water/route.ts
// GET /api/high-water — everything Eddy tracks that is running high RIGHT NOW.
//
// ── Why this is not /api/alerts ────────────────────────────────────────────
// /api/alerts is a CHANGE LOG: it reads river_condition_events, one row per
// transition, and answers "what moved in the last week". That is a different
// question from "what is high", and it answers the second one badly. A river
// that crossed into high nine days ago and has stayed there is absent from the
// log and very much present in the water. A river that flickered good→flowing
// is in the log and means nothing.
//
// This endpoint is a SNAPSHOT. No history, no debounce, no window — the current
// state of every graded thing, filtered to the elevated bucket.
//
// ── What may appear here, and what may not ─────────────────────────────────
// The filter is RUNNING_HIGH from shared/condition-system.ts — high + flood —
// which means every row here is the output of a threshold ladder a human set.
//
//   RIVERS grade against their primary gauge's ladder. Straight from getRivers.
//
//   GAUGES grade against the ladder on their river_gauges link. A station can
//   serve more than one river and is reported once, against the river it is
//   primary for.
//
//   THE ~14,000 NATIONAL STATIONS ARE NOT ELIGIBLE, and this is the important
//   exclusion. They have no ladder — nobody has decided where high starts on
//   the Bush Kill — and the only number they carry is a flow percentile, which
//   says "wetter than usual for the date". That is not the same claim. A river
//   at the 95th percentile of a dry September is an ordinary river. Publishing
//   those here would multiply the row count by two hundred and dilute every row
//   that means something.
//
//   DAMS appear only when their TAILWATER STATION is elevated. Generating is
//   not a condition — it is a fact about machinery — and a dam at full output
//   into a channel built for it is not high water. See the header of
//   src/components/dam/DamStateCard.tsx for the longer version of that rule.
//
// Public and unauthenticated, like /api/alerts: high water is safety
// information and is never behind an account or a paywall.

import { NextRequest, NextResponse } from 'next/server';
import { RUNNING_HIGH, conditionDef } from '@shared/condition-system';
import type { ConditionCode } from '@shared/condition-system';
import { classifyReading } from '@shared/condition-ladder';
import { createAdminClient } from '@/lib/supabase/admin';
import { getRivers } from '@/lib/data/rivers';
import { fetchTailwaterDams, tailwaterGaugeSiteIds } from '@/lib/data/dams';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { toNum } from '@/lib/utils/num';

export const dynamic = 'force-dynamic';

export type HighWaterKind = 'river' | 'gauge' | 'dam';

export interface HighWaterEntry {
  kind: HighWaterKind;
  /** Stable key for a list. Prefixed by kind — a river and a gauge can collide. */
  id: string;
  name: string;
  /** What is elevated, and where — "Current River", "Mile 12 · Van Buren". */
  subtitle: string | null;
  conditionCode: ConditionCode;
  /** The ladder's own words for the code, e.g. "High Water - Use Caution". */
  conditionLabel: string;
  readingValue: number | null;
  readingUnit: 'ft' | 'cfs' | null;
  /** How old the reading is, in hours. Null when the station published none. */
  readingAgeHours: number | null;
  /** Where tapping this goes, as an app route. */
  riverSlug: string | null;
  siteId: string | null;
  damId: string | null;
}

export interface HighWaterResponse {
  entries: HighWaterEntry[];
  /** When this snapshot was taken, so a client can say "as of". */
  asOf: string;
}

/** Flood outranks high, then the fresher reading, then the name. */
function bySeverity(a: HighWaterEntry, b: HighWaterEntry): number {
  const rank = (e: HighWaterEntry) => (e.conditionCode === 'dangerous' ? 0 : 1);
  return rank(a) - rank(b) || a.name.localeCompare(b.name);
}

export async function GET(request: NextRequest) {
  try {
    const limited = await rateLimit(`high-water:${getClientIp(request)}`, 60, 60 * 1000);
    if (limited) return limited;

    // Each source is allowed to fail on its own. A CWMS outage must not take
    // the river half of this list down with it — the whole point of the screen
    // is that it is readable in bad weather, which is when feeds break.
    const [rivers, gauges, dams] = await Promise.all([
      getRivers().catch((err) => {
        console.error('[high-water] rivers failed:', err);
        return [];
      }),
      elevatedGauges().catch((err) => {
        console.error('[high-water] gauges failed:', err);
        return [];
      }),
      fetchTailwaterDams().catch((err) => {
        console.error('[high-water] dams failed:', err);
        return [];
      }),
    ]);

    const riverEntries: HighWaterEntry[] = rivers
      .filter((r) => r.currentCondition && RUNNING_HIGH.has(r.currentCondition.code))
      .map((r) => {
        const c = r.currentCondition!;
        // The unit the ladder is defined in is the ONLY unit this reading may
        // be shown in — never a fallback to the other one. See primaryReading()
        // in eddy-ios for the rule this mirrors.
        const value =
          c.thresholdUnit === 'ft'
            ? c.gaugeHeightFt
            : c.thresholdUnit === 'cfs'
              ? c.dischargeCfs
              : null;
        return {
          kind: 'river' as const,
          id: `river:${r.id}`,
          name: r.name,
          subtitle: r.region ?? r.state ?? null,
          conditionCode: c.code,
          conditionLabel: conditionDef(c.code).longLabel,
          readingValue: value,
          readingUnit: c.thresholdUnit,
          readingAgeHours: c.readingAgeHours,
          riverSlug: r.slug,
          siteId: null,
          damId: null,
        };
      });

    // A river already on the list makes its own primary gauge redundant: the
    // river's condition IS that gauge's reading graded against that gauge's
    // ladder, so both rows would be the same fact under two names.
    const riverSlugsListed = new Set(riverEntries.map((e) => e.riverSlug));
    const gaugeEntries = gauges.filter((g) => !g.riverSlug || !riverSlugsListed.has(g.riverSlug));

    // Keyed by the tailwater station, because that is the only thing about a dam
    // this endpoint is willing to call high. Read off `gauges` rather than the
    // deduped `gaugeEntries`: a station dropped above because its river is
    // already listed is still an elevated station, and its dam still qualifies.
    const elevatedSiteIds = new Set(
      gauges.map((g) => g.siteId).filter((id): id is string => Boolean(id)),
    );
    // ANY gauge on the tailwater, not just the nearest one the wire carries.
    // A long tailwater can be quiet at the top and up at the bottom — the Black
    // has one gauge and cannot show this, but a reach with a gauge at mile 45
    // and another at mile 62 has two different answers, and a dam whose lower
    // river is running high is still a dam worth listing.
    const damEntries: HighWaterEntry[] = dams
      .map((d) => ({ dam: d, siteIds: tailwaterGaugeSiteIds(d.id).filter((id) => elevatedSiteIds.has(id)) }))
      .filter(({ siteIds }) => siteIds.length > 0)
      .map(({ dam: d, siteIds }) => {
        const release = d.metrics.release;
        // Nearest elevated gauge, since siteIds preserves the registry's
        // nearest-first order — the reading shown should be the one closest to
        // the release the row is about.
        const station = gauges.find((g) => g.siteId === siteIds[0]);
        return {
          kind: 'dam' as const,
          id: `dam:${d.id}`,
          name: d.name,
          subtitle: [d.lakeName, d.generating ? 'generating' : null].filter(Boolean).join(' · ') || null,
          conditionCode: station?.conditionCode ?? 'high',
          conditionLabel: conditionDef(station?.conditionCode ?? 'high').longLabel,
          readingValue: release ? release.value : (station?.readingValue ?? null),
          readingUnit: release ? 'cfs' : (station?.readingUnit ?? null),
          readingAgeHours: station?.readingAgeHours ?? null,
          riverSlug: d.tailwater?.riverSlug ?? null,
          // The gauge that actually put this row on the list, which is not
          // necessarily the nearest one the wire advertises.
          siteId: siteIds[0],
          damId: d.id,
        };
      });

    // Rivers first, then gauges, then dams — broadest claim to narrowest, the
    // same ordering /api/search uses and for the same reason.
    const entries = [
      ...riverEntries.sort(bySeverity),
      ...gaugeEntries.sort(bySeverity),
      ...damEntries.sort(bySeverity),
    ];

    // Readings move on a 15-minute cadence, so a short edge cache costs nothing
    // in freshness and absorbs the mass app-open that follows a storm.
    return NextResponse.json<HighWaterResponse>(
      { entries, asOf: new Date().toISOString() },
      { headers: cdnCacheHeaders(60, 300) },
    );
  } catch (err) {
    console.error('[high-water] unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Curated stations whose ladder grades their latest reading as high or flood.
 *
 * Deliberately narrower than /api/gauges, which builds a full MapGauge for the
 * map and carries every threshold column for every linked river. This needs one
 * ladder per station — the primary one — and one verdict.
 *
 * Reads gauge_latest rather than gauge_readings: it is one row per station by
 * primary key, which is what search_gauges already uses, instead of an ordered
 * scan of a readings table to take the first row per group.
 */
async function elevatedGauges(): Promise<HighWaterEntry[]> {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from('river_gauges')
    .select(
      `
      gauge_station_id,
      is_primary,
      threshold_unit,
      level_too_low,
      level_low,
      level_optimal_min,
      level_optimal_max,
      level_high,
      level_dangerous,
      flood_stage_ft,
      rivers!inner ( id, name, slug, active ),
      gauge_stations!inner ( id, name, usgs_site_id, site_id_external, active )
    `,
    )
    .eq('rivers.active', true)
    .eq('gauge_stations.active', true);

  if (error) throw error;

  const rows = (data ?? []) as unknown as Array<Record<string, unknown>>;
  if (rows.length === 0) return [];

  const stationIds = [...new Set(rows.map((r) => r.gauge_station_id as string))];
  const { data: latest } = await supabase
    .from('gauge_latest')
    .select('gauge_station_id, gauge_height_ft, discharge_cfs, reading_timestamp')
    .in('gauge_station_id', stationIds);

  const readingByStation = new Map(
    (latest ?? []).map((r) => [r.gauge_station_id as string, r]),
  );

  const now = Date.now();
  // A station serving two rivers grades once, against the river it is primary
  // for. Primaries are taken first so a secondary link can only ever fill a gap.
  const seen = new Set<string>();
  const entries: HighWaterEntry[] = [];

  for (const row of [...rows].sort((a, b) => Number(b.is_primary) - Number(a.is_primary))) {
    const stationId = row.gauge_station_id as string;
    if (seen.has(stationId)) continue;

    const station = row.gauge_stations as { name: string; usgs_site_id: string | null; site_id_external: string | null };
    const river = row.rivers as { name: string; slug: string | null };
    const reading = readingByStation.get(stationId);
    if (!reading) continue;

    const gaugeHeightFt = toNum(reading.gauge_height_ft);
    const dischargeCfs = toNum(reading.discharge_cfs);
    const unit = (row.threshold_unit as 'ft' | 'cfs' | null) ?? null;

    // strictUnit: a cfs-primary station whose discharge sensor has died must
    // report unknown, not its stage graded against cfs thresholds. That
    // cross-unit fallback is how a dead sensor once manufactured a flood.
    const code = classifyReading(
      gaugeHeightFt,
      {
        levelTooLow: toNum(row.level_too_low),
        levelLow: toNum(row.level_low),
        levelOptimalMin: toNum(row.level_optimal_min),
        levelOptimalMax: toNum(row.level_optimal_max),
        levelHigh: toNum(row.level_high),
        levelDangerous: toNum(row.level_dangerous),
        thresholdUnit: unit ?? undefined,
        floodStageFt: toNum(row.flood_stage_ft),
      },
      dischargeCfs,
      { strictUnit: true },
    );

    seen.add(stationId);
    if (!RUNNING_HIGH.has(code)) continue;

    const parsed = reading.reading_timestamp ? Date.parse(reading.reading_timestamp) : NaN;
    entries.push({
      kind: 'gauge',
      id: `gauge:${stationId}`,
      name: station.name,
      subtitle: river.name,
      conditionCode: code,
      conditionLabel: conditionDef(code).longLabel,
      readingValue: unit === 'ft' ? gaugeHeightFt : unit === 'cfs' ? dischargeCfs : null,
      readingUnit: unit,
      readingAgeHours: Number.isFinite(parsed) ? (now - parsed) / 3_600_000 : null,
      riverSlug: river.slug,
      siteId: station.usgs_site_id ?? station.site_id_external,
      damId: null,
    });
  }

  return entries;
}
