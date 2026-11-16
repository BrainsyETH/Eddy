// src/app/api/gauges/route.ts
// API endpoint to fetch all gauge stations with their readings and thresholds

import { NextRequest, NextResponse } from 'next/server';
import { cdnCacheHeaders } from '@/lib/api-utils';
import { createAdminClient } from '@/lib/supabase/admin';
import { rateLimit, getClientIp } from '@/lib/rate-limit';
import { withX402Route } from '@/lib/x402-config';
import type { GaugeDetail } from '@/app/api/gauges/[siteId]/route';
import { GaugeStationsError, loadGaugeStations } from '@/lib/gauges/stations';

export const dynamic = 'force-dynamic';

export interface ThresholdDescriptions {
  tooLow?: string;
  low?: string;
  good?: string;
  flowing?: string;
  high?: string;
  flood?: string;
}

export interface GaugeStation {
  id: string;
  /**
   * The station's provider-native site id — a USGS site number, an NWS LID, or
   * a USACE dam slug. Named `usgsSiteId` for history: it predates
   * multi-provider support and has ~105 call sites, so renaming it to `siteId`
   * is a separate refactor. Pair it with `provider` before building any
   * provider-specific URL.
   *
   * Filled from `usgs_site_id` OR `site_id_external` below, both nullable, so
   * a station carrying neither sends null despite this type — which is what
   * took down the phone's Search tab on a `.toLowerCase()`. The phone's mirror
   * (MapGauge in packages/eddy-types) types it `string | null` for that
   * reason; web consumers must not assume a string either.
   */
  usgsSiteId: string;
  /** Registry id from src/lib/flow-providers. Absent means 'usgs'. */
  provider?: string;
  name: string;
  coordinates: {
    lng: number;
    lat: number;
  };
  active: boolean;
  // Current reading
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  readingTimestamp: string | null;
  readingAgeHours: number | null;
  /** True when USGS qualifier codes flag the reading as suspect (ice, estimated, sensor issues). */
  readingSuspect: boolean;
  /** Human-readable qualifier note ("Ice at the gauge. This reading may be off."), or null when clean. */
  qualifierNote: string | null;
  /** Optional on older responses; discharge comparison against the daily record. */
  seasonalContext?: GaugeDetail['seasonalContext'];
  // Threshold descriptions (from gauge_stations table)
  thresholdDescriptions: ThresholdDescriptions | null;
  // Thresholds (from primary river association if exists)
  thresholds: {
    riverId: string;
    riverName: string;
    riverSlug: string | null;
    /**
     * Two-letter code for the river this threshold rates.
     *
     * Carried because the gauge detail page printed "Gauge near {river},
     * Missouri" as a literal, which has been wrong for every Arkansas gauge
     * since the catalog stopped being Missouri-only. Nullable for the reason
     * every added wire field is.
     */
    riverState: string | null;
    isPrimary: boolean;
    riverMile: number | null;
    /**
     * Miles from the rated section. The tiebreak when one gauge is primary for
     * more than one river — Courtois borrows Huzzah's gauge, and this is what
     * says the gauge physically sits on the Huzzah. See
     * shared/primary-river-link.ts.
     */
    distanceFromSectionMiles: number | null;
    thresholdUnit: 'ft' | 'cfs';
    levelTooLow: number | null;
    levelLow: number | null;
    levelOptimalMin: number | null;
    levelOptimalMax: number | null;
    levelHigh: number | null;
    levelDangerous: number | null;
    /** NWS flood stage in feet — outranks the ladder above when reached. */
    floodStageFt: number | null;
    // Alternate unit thresholds (opposite of thresholdUnit)
    altLevelTooLow: number | null;
    altLevelLow: number | null;
    altLevelOptimalMin: number | null;
    altLevelOptimalMax: number | null;
    altLevelHigh: number | null;
    altLevelDangerous: number | null;
  }[] | null;
}

export interface GaugesResponse {
  gauges: GaugeStation[];
}

async function _GET(request: NextRequest) {
  try {
    // Rate limit: 60 requests per IP per minute
    const rateLimitResult = await rateLimit(`gauges:${getClientIp(request)}`, 60, 60 * 1000);
    if (rateLimitResult) return rateLimitResult;

    // Built in src/lib/gauges/stations.ts, which the river page also reads.
    const gauges = await loadGaugeStations(createAdminClient(), { liveFallback: true });

    return NextResponse.json({ gauges }, { headers: cdnCacheHeaders(300, 600) });
  } catch (error) {
    if (error instanceof GaugeStationsError) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    console.error('Error in gauges API:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export const GET = withX402Route(_GET, '/api/gauges');
