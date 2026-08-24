// shared/history-normalize.ts
// One normalizer for /api/gauges/[siteId]/history payloads, on both platforms.
//
// The response type declares its context fields as required, which is true of
// what the endpoint sends TODAY and not true of everything a client can hold:
// a response cached before a field existed, or one served by an older deploy
// mid-rollout. The web hook normalized for this at its fetch boundary
// (useGaugeHistory) while the phone passed raw JSON through and survived on
// optional chaining at each read site — two platforms, two disciplines, and
// every added field a chance for a third drift. Release 3 adds seven fields
// at once, so the normalizer moves here and both call it. Same move
// chart-model.ts made, for the same reason.
//
// The rule: DERIVE where a derivation exists, default only where one does
// not. observedThrough is knowable from the readings; seasonalRange is
// knowable from `typical`; coverageWindow is knowable from the series.
// A derived value keeps an old payload honest; an invented one would not.

export interface GaugeHistoryReadingLike {
  timestamp: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  qualifiers?: string[];
}

export interface GaugeForecastReadingLike {
  timestamp: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
}

export interface GaugeTypicalReadingLike {
  date: string;
  p25Cfs: number | null;
  p50Cfs: number | null;
  p75Cfs: number | null;
  yearsOfRecord: number | null;
}

export interface SeasonalRangeRow {
  date: string;
  unit: 'cfs' | 'ft';
  p25: number | null;
  p50: number | null;
  p75: number | null;
  yearsOfRecord: number | null;
}

export interface NormalizedGaugeHistory {
  siteId: string;
  siteName: string;
  readings: GaugeHistoryReadingLike[];
  observedThrough: string | null;
  sampled: boolean;
  resolution: 'instant' | 'daily';
  statistic: 'instantaneous' | 'daily_mean' | 'daily_selected';
  requestedWindow: { from: string; to: string } | null;
  coverageWindow: { from: string; to: string } | null;
  coverageComplete: boolean;
  truncationReason: string | null;
  typical: GaugeTypicalReadingLike[];
  seasonalRange: SeasonalRangeRow[];
  forecast: GaugeForecastReadingLike[];
  forecastIssuedAt: string | null;
  sourceUrl: string | null;
  stats: {
    minDischarge: number | null;
    maxDischarge: number | null;
    minHeight: number | null;
    maxHeight: number | null;
  };
}

export function normalizeGaugeHistory(
  raw: Partial<NormalizedGaugeHistory> | null | undefined,
): NormalizedGaugeHistory | null {
  if (!raw || !Array.isArray(raw.readings)) return null;
  const readings = raw.readings;
  const typical = raw.typical ?? [];

  // Derived, not defaulted: the covered window IS the series' own span, and
  // every payload old enough to lack the field was serving the window it was
  // asked for — instantaneous, unsampled statistics did not exist yet.
  const derivedCoverage =
    readings.length > 0
      ? { from: readings[0].timestamp, to: readings[readings.length - 1].timestamp }
      : null;

  return {
    siteId: raw.siteId ?? '',
    siteName: raw.siteName ?? '',
    readings,
    observedThrough:
      raw.observedThrough ?? readings[readings.length - 1]?.timestamp ?? null,
    sampled: raw.sampled ?? false,
    resolution: raw.resolution ?? 'instant',
    statistic: raw.statistic ?? 'instantaneous',
    requestedWindow: raw.requestedWindow ?? derivedCoverage,
    coverageWindow: raw.coverageWindow ?? derivedCoverage,
    // An old payload predates truncation reporting; its server clamped the
    // request BEFORE serving, so the served window was the honored one.
    coverageComplete: raw.coverageComplete ?? true,
    truncationReason: raw.truncationReason ?? null,
    typical,
    seasonalRange:
      raw.seasonalRange ??
      typical.map((row) => ({
        date: row.date,
        unit: 'cfs' as const,
        p25: row.p25Cfs,
        p50: row.p50Cfs,
        p75: row.p75Cfs,
        yearsOfRecord: row.yearsOfRecord,
      })),
    forecast: raw.forecast ?? [],
    forecastIssuedAt: raw.forecastIssuedAt ?? null,
    sourceUrl: raw.sourceUrl ?? null,
    stats: raw.stats ?? {
      minDischarge: null,
      maxDischarge: null,
      minHeight: null,
      maxHeight: null,
    },
  };
}
