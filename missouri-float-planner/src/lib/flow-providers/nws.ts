// src/lib/flow-providers/nws.ts
// NWS flow provider — polls the National Water Prediction Service (NWPS)
// gauge API, the successor to AHPS. Site ids for this provider are NWS
// Location IDs (LID, e.g. "ROZM7"), stored in gauge_stations.site_id_external.
//
// Exists for gauges whose USGS telemetry is dead but which NWS still
// observes — e.g. St. Francis River near Roselle: USGS 07034000 discharge
// ended in 1997, but NOAA reports live stage (ft) as ROZM7. Same host as
// src/lib/nws/flood-stages.ts, different document sections: this reads
// `status.observed` and `stageflow/observed`; flood-stages reads
// `flood.categories`.
//
// NWPS reports values in declared units — primary is usually Stage (ft) and
// secondary Flow (kcfs) — so readings are mapped by unit, not position, and
// kcfs is normalized to cfs. Missing values use -999/-9999 sentinels.

import type {
  DailyStatistics,
  FlowProvider,
  GaugeReading,
  HistoricalData,
  HistoricalReading,
} from './types';

const NWPS_BASE = 'https://api.water.noaa.gov/nwps/v1/gauges';

interface NwpsObserved {
  primary?: number;
  primaryUnit?: string;
  secondary?: number;
  secondaryUnit?: string;
  validTime?: string;
}

interface NwpsGaugeDoc {
  lid?: string;
  name?: string;
  status?: { observed?: NwpsObserved };
}

interface NwpsStageflowPoint {
  validTime?: string;
  primary?: number;
  secondary?: number;
}

interface NwpsStageflowDoc {
  primaryUnits?: string;
  secondaryUnits?: string;
  data?: NwpsStageflowPoint[];
}

/** NWPS marks missing values with large negative sentinels. */
function isMissing(v: number | undefined | null): v is undefined | null {
  return v === undefined || v === null || !Number.isFinite(v) || v <= -999;
}

/**
 * Folds one (value, unit) pair into a reading by unit: ft → stage,
 * cfs/kcfs → discharge (kcfs normalized to cfs).
 */
function foldByUnit(
  reading: { gaugeHeightFt: number | null; dischargeCfs: number | null },
  value: number | undefined,
  unit: string | undefined
): void {
  if (isMissing(value)) return;
  const u = (unit ?? '').toLowerCase();
  if (u === 'ft') {
    reading.gaugeHeightFt = value;
  } else if (u === 'kcfs') {
    reading.dischargeCfs = value * 1000;
  } else if (u === 'cfs') {
    reading.dischargeCfs = value;
  }
}

async function fetchGaugeDoc(lid: string, skipCache?: boolean): Promise<NwpsGaugeDoc | null> {
  try {
    const res = await fetch(`${NWPS_BASE}/${encodeURIComponent(lid)}`, {
      signal: AbortSignal.timeout(10_000),
      headers: { Accept: 'application/json' },
      ...(skipCache ? { cache: 'no-store' as const } : { next: { revalidate: 3600 } }),
    });
    if (!res.ok) {
      console.warn(`[NWS] ${lid}: HTTP ${res.status}`);
      return null;
    }
    return (await res.json()) as NwpsGaugeDoc;
  } catch (e) {
    console.error(`[NWS] ${lid}: fetch failed`, e);
    return null;
  }
}

export class NwsProvider implements FlowProvider {
  readonly id = 'nws';

  async fetchLatest(
    siteIds: string[],
    options?: { skipCache?: boolean }
  ): Promise<GaugeReading[]> {
    if (siteIds.length === 0) return [];
    // NWPS has no batch endpoint — one document per LID. Provider groups are
    // small (only gauges USGS can't serve), so parallel singles are fine.
    const docs = await Promise.all(siteIds.map((lid) => fetchGaugeDoc(lid, options?.skipCache)));

    const readings: GaugeReading[] = [];
    for (let i = 0; i < siteIds.length; i++) {
      const observed = docs[i]?.status?.observed;
      if (!observed?.validTime) continue;
      const reading: GaugeReading = {
        siteId: siteIds[i],
        siteName: docs[i]?.name || siteIds[i],
        gaugeHeightFt: null,
        dischargeCfs: null,
        readingTimestamp: observed.validTime,
        // NWPS observations carry no qualifier codes; treat as unqualified.
        qualifiers: [],
      };
      foldByUnit(reading, observed.primary, observed.primaryUnit);
      foldByUnit(reading, observed.secondary, observed.secondaryUnit);
      if (reading.gaugeHeightFt !== null || reading.dischargeCfs !== null) {
        readings.push(reading);
      }
    }
    return readings;
  }

  async fetchHistory(siteId: string, days: number = 7): Promise<HistoricalData | null> {
    try {
      const res = await fetch(`${NWPS_BASE}/${encodeURIComponent(siteId)}/stageflow/observed`, {
        signal: AbortSignal.timeout(10_000),
        headers: { Accept: 'application/json' },
        next: { revalidate: 3600 },
      });
      if (!res.ok) {
        console.warn(`[NWS] ${siteId} history: HTTP ${res.status}`);
        return null;
      }
      const doc = (await res.json()) as NwpsStageflowDoc;
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;

      const readings: HistoricalReading[] = [];
      for (const point of doc.data ?? []) {
        if (!point.validTime || new Date(point.validTime).getTime() < cutoff) continue;
        const reading = { timestamp: point.validTime, gaugeHeightFt: null as number | null, dischargeCfs: null as number | null };
        foldByUnit(reading, point.primary, doc.primaryUnits);
        foldByUnit(reading, point.secondary, doc.secondaryUnits);
        if (reading.gaugeHeightFt !== null || reading.dischargeCfs !== null) readings.push(reading);
      }
      if (readings.length === 0) return null;
      readings.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      const discharge = readings.map((r) => r.dischargeCfs).filter((v): v is number => v !== null);
      const height = readings.map((r) => r.gaugeHeightFt).filter((v): v is number => v !== null);
      return {
        siteId,
        siteName: siteId,
        readings,
        minDischarge: discharge.length ? Math.min(...discharge) : null,
        maxDischarge: discharge.length ? Math.max(...discharge) : null,
        minHeight: height.length ? Math.min(...height) : null,
        maxHeight: height.length ? Math.max(...height) : null,
      };
    } catch (e) {
      console.error(`[NWS] ${siteId}: history fetch failed`, e);
      return null;
    }
  }

  async fetchDailyStatistics(): Promise<DailyStatistics | null> {
    // NWPS has no day-of-year percentile product; percentile-based condition
    // color falls back to threshold bands for nws-provided gauges.
    return null;
  }

  publicUrl(siteId: string): string {
    return `https://water.noaa.gov/gauges/${siteId}`;
  }
}
