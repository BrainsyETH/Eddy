import { NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import {
  fetchGaugeReadings,
  fetchDailyStatistics,
  calculateDischargePercentile,
  type DailyStatistics,
} from '@/lib/usgs/gauges';
import { fetchMODataset } from '@/lib/usgs/mo-statewide-data';
import { NwsProvider } from '@/lib/flow-providers/nws';
import type { GaugeReading } from '@/lib/flow-providers/types';

export const dynamic = 'force-dynamic';

export interface MoStatewideGauge {
  site_no: string;
  nws_lid: string | null;
  river_id: string;
  river_slug: string;
  river_name: string;
  is_primary: boolean;
  dischargeCfs: number | null;
  gaugeHeightFt: number | null;
  readingTimestamp: string | null;
  percentile: number | null;
  stats: DailyStatistics | null;
  /** Carried through from get_mo_surface_water_dataset(). */
  flood_stage_ft: number | null;
  action_stage_ft: number | null;
  threshold_source: string | null;
  threshold_source_url: string | null;
}

export interface MoStatewideResponse {
  generatedAt: string;
  cadenceSeconds: number;
  gauges: MoStatewideGauge[];
  /**
   * False when the live reading fetch failed and every gauge below carries
   * nulls it never had a chance to fill.
   *
   * The distinction the clients need: "no reading" and "we could not ask" look
   * identical in the rows, and only the second is worth telling someone about.
   * Absent on responses from deployments that predate this field, so read it as
   * `!== false` rather than as a required boolean.
   */
  readingsAvailable: boolean;
}

export async function GET() {
  try {
    const dataset = await fetchMODataset();

    // Build a per-site → river+threshold map.
    interface SiteMeta {
      river_id: string;
      river_slug: string;
      river_name: string;
      is_primary: boolean;
      nws_lid: string | null;
      flood_stage_ft: number | null;
      action_stage_ft: number | null;
      threshold_source: string | null;
      threshold_source_url: string | null;
    }
    const siteToRiver = new Map<string, SiteMeta>();
    for (const r of dataset.rivers) {
      for (const g of r.gauges ?? []) {
        // fetchMODataset already drops stations with no USGS site number, so
        // this is the second of three guards rather than the one doing the
        // work. It stays because of what the failure costs: an empty site id
        // posted to waterservices.usgs.gov 400s the WHOLE BATCH (the same
        // guard, for the same reason, is in /api/gauges/route.ts), and one such
        // row is what took every river's colour off both maps — this route
        // 500'd and the phone graded all 24 rivers `unknown` grey.
        if (!g.site_id) continue;
        if (!siteToRiver.has(g.site_id)) {
          siteToRiver.set(g.site_id, {
            river_id: r.id,
            river_slug: r.slug,
            river_name: r.name,
            is_primary: g.is_primary,
            nws_lid: g.nws_lid ?? null,
            flood_stage_ft: g.flood_stage_ft ?? null,
            action_stage_ft: g.action_stage_ft ?? null,
            threshold_source: g.threshold_source ?? null,
            threshold_source_url: g.threshold_source_url ?? null,
          });
        }
      }
    }
    const siteIds = Array.from(siteToRiver.keys());
    if (!siteIds.length) {
      return NextResponse.json<MoStatewideResponse>({
        generatedAt: new Date().toISOString(),
        cadenceSeconds: 900,
        gauges: [],
        readingsAvailable: true,
      });
    }

    // A dead upstream must GREY THE LINES, not fail the request. The rest of
    // this payload — which gauge grades which river, the flood stages, the
    // ladders — is ours and is still true when USGS is down, and the phone
    // draws the network from it either way. Throwing here instead cost the
    // whole map, on both clients, for a reason neither could report.
    let readings: GaugeReading[] = [];
    let readingsAvailable = true;
    try {
      readings = await fetchGaugeReadings(siteIds);
    } catch (e) {
      readingsAvailable = false;
      console.error('[usgs/mo-statewide] Live readings failed; serving metadata only:', e);
    }
    const readingMap = new Map(readings.map((r) => [r.siteId, r]));

    // USGS → NWS fallback. Some gauges sit on discontinued USGS stations that
    // NOAA/NWPS still observes live — e.g. St. Francis River near Roselle,
    // whose USGS site (07034000) stopped reporting discharge in 1997 but whose
    // NWS gauge (ROZM7) still reports live stage. When the USGS reading is
    // missing or long stale and the gauge carries an NWS LID, use the live NWS
    // observation instead so the card isn't stuck on a decades-old value.
    const STALE_FALLBACK_MS = 2 * 24 * 60 * 60 * 1000; // 2 days
    const isFresh = (r: GaugeReading | null | undefined): boolean => {
      if (!r?.readingTimestamp) return false;
      const t = new Date(r.readingTimestamp).getTime();
      return Number.isFinite(t) && Date.now() - t <= STALE_FALLBACK_MS;
    };
    const lidBySite = new Map<string, string>();
    for (const siteId of siteIds) {
      const lid = siteToRiver.get(siteId)?.nws_lid;
      if (lid && !isFresh(readingMap.get(siteId))) lidBySite.set(siteId, lid);
    }
    const nwsBySite = new Map<string, GaugeReading>();
    if (lidBySite.size > 0) {
      try {
        const lids = Array.from(new Set(lidBySite.values()));
        const nwsReadings = await new NwsProvider().fetchLatest(lids);
        const byLid = new Map(nwsReadings.map((r) => [r.siteId, r]));
        for (const [siteId, lid] of lidBySite) {
          const nws = byLid.get(lid);
          if (!isFresh(nws)) continue;
          // NWPS reports 0 kcfs for stage-only gauges (no rating curve) — a
          // placeholder, not a real zero flow. Keep the live stage, drop the 0.
          nwsBySite.set(siteId, {
            ...nws!,
            dischargeCfs: nws!.dischargeCfs && nws!.dischargeCfs > 0 ? nws!.dischargeCfs : null,
          });
        }
      } catch (e) {
        console.warn('[usgs/mo-statewide] NWS fallback failed:', e);
      }
    }

    const statsResults = await Promise.allSettled(
      siteIds.map((id) => fetchDailyStatistics(id)),
    );

    const gauges: MoStatewideGauge[] = siteIds.map((siteId, i) => {
      const meta = siteToRiver.get(siteId)!;
      const reading = nwsBySite.get(siteId) ?? readingMap.get(siteId) ?? null;
      const statsRes = statsResults[i];
      const stats =
        statsRes.status === 'fulfilled' && statsRes.value ? statsRes.value : null;

      let percentile: number | null = null;
      if (reading?.dischargeCfs != null && stats) {
        percentile = calculateDischargePercentile(reading.dischargeCfs, stats);
      }

      return {
        site_no: siteId,
        nws_lid: meta.nws_lid,
        river_id: meta.river_id,
        river_slug: meta.river_slug,
        river_name: meta.river_name,
        is_primary: meta.is_primary,
        dischargeCfs: reading?.dischargeCfs ?? null,
        gaugeHeightFt: reading?.gaugeHeightFt ?? null,
        readingTimestamp: reading?.readingTimestamp ?? null,
        percentile,
        stats,
        flood_stage_ft: meta.flood_stage_ft,
        action_stage_ft: meta.action_stage_ft,
        threshold_source: meta.threshold_source,
        threshold_source_url: meta.threshold_source_url,
      };
    });

    const body: MoStatewideResponse = {
      generatedAt: new Date().toISOString(),
      cadenceSeconds: 900,
      gauges,
      readingsAvailable,
    };

    return NextResponse.json(body, {
      // A degraded answer is cached for a minute rather than fifteen. Holding a
      // reading-less payload at the edge for a full cadence would outlast the
      // upstream blip that caused it.
      headers: readingsAvailable ? cdnCacheHeaders(900, 3600) : cdnCacheHeaders(60, 300),
    });
  } catch (e) {
    console.error('[usgs/mo-statewide] Error:', e);
    return NextResponse.json(
      { error: 'Failed to load statewide data' },
      { status: 500 },
    );
  }
}
