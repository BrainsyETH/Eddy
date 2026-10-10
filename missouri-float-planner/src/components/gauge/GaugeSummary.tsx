'use client';

// src/components/gauge/GaugeSummary.tsx
// The three-question summary — the one block both detail views lead with:
//
//   1. What is the river doing now?
//   2. Is there an official safety concern?
//   3. What is expected next?
//
// One component rather than two because RiverGaugeDetail and GaugeDetailView
// render the same chart and used to disagree about everything above it — one
// put the decision card over the chart, the other put the chart over the
// verdict. The ORDER here is the contract, shared with the iOS screens: the
// answers change per station, the questions never do.
//
// What it refuses to do:
//   · Speak a verdict for an unresolved tier. `tier === 'unknown'` renders an
//     empty chip of the right size — a shape, not a sentence. "Eddy hasn't
//     rated this" is a claim a screen still waiting on the detail fetch has
//     not earned (see shared/station-tier.ts).
//   · Interpret an untrusted reading. Suspect or >6h-old readings keep their
//     value and age and get NO condition, NO trend, NO seasonal comparison
//     (shared/reading-trust.ts).
//   · Let Eddy outrank the Weather Service. During an official event the
//     safety row moves ABOVE the reading row and carries the violet — Eddy's
//     opinion about floating is subordinate to NWS's statement about flood.
//   · Infer safety from missing stages. Absence reads as a statement about
//     publication, in shared/safety-summary.ts's exact words.
//   · Read "lately" off the chart's range. The chart's window is the reader's
//     to change, and a 30-day series is bucket extrema — fine for a crest,
//     wrong for a six-hour trend. The trend, crest and forecast read a fixed
//     seven-day request and the record a fixed 30-day one, the same requests
//     and the same shared/gauge-recent.ts rules the iOS gauge screen uses.

import { useEffect, useMemo, useRef } from 'react';
import { useGaugeHistory } from '@/hooks/useGaugeHistory';
import { trackGaugeDataUnavailable } from '@/lib/gauge/analytics';
import {
  RECORD_WINDOW_DAYS,
  coldWaterNote,
  forecastCrest,
  forecastCrestSentence,
  forecastDayLabel,
  recentPeak,
  recentPeakSentence,
  recentRecord,
  recentRecordSentence,
  recentTrend,
  upcomingForecast,
} from '@shared/gauge-recent';
import { formatAgeFromHours } from '@/lib/utils/reading-age';
import ConditionBadge from '@/components/ui/ConditionBadge';
import type { ConditionCode, GaugeFloodStages } from '@/types/api';
import { assessReadingTrust } from '@shared/reading-trust';
import {
  safetySummarySentence,
  summarizeSafety,
  type SafetySummary,
} from '@shared/safety-summary';
import { floodStageColor, formatStage } from '@shared/flood-stage';
import { FLOW_BAND_SYSTEM, flowBand } from '@shared/flow-band';
import type { StationTier } from '@shared/station-tier';

interface GaugeSummaryProps {
  siteId: string;
  /** Match the chart's selected range so the history query is shared. */
  days: number;
  tier: StationTier;
  provider?: string | null;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  /** The unit this station leads with — the ladder's unit on a rated river. */
  primaryUnit: 'ft' | 'cfs';
  readingAgeHours: number | null;
  readingSuspect?: boolean;
  qualifierNote?: string | null;
  /** The rated verdict, already computed against the primary ladder. */
  conditionCode?: ConditionCode | null;
  /** Day-of-year percentile for the reference tier's seasonal comparison. */
  flowPercentile?: number | null;
  yearsOfRecord?: number | null;
  seasonalContextUnavailableReason?: string | null;
  floodStages?: GaugeFloodStages | null;
  /** The station's latest water temperature, for the cold-water note. */
  waterTemperature?: { valueF: number; observedAt: string } | null;
  className?: string;
}

/** The trend, crest and forecast window — the one iOS reads them from too. */
const RECENT_DAYS = 7;

const PROVIDER_LABEL: Record<string, string> = {
  usgs: 'Official USGS gauge',
  nws: 'Official NWS gauge',
  usace: 'USACE station',
};

export default function GaugeSummary({
  siteId,
  days,
  tier,
  provider,
  gaugeHeightFt,
  dischargeCfs,
  primaryUnit,
  readingAgeHours,
  readingSuspect = false,
  qualifierNote,
  conditionCode,
  flowPercentile,
  yearsOfRecord,
  seasonalContextUnavailableReason,
  floodStages,
  waterTemperature,
  className = '',
}: GaugeSummaryProps) {
  // The chart's own request — shared with it through the query cache, and
  // watched here only so a failed chart is reported once.
  const { isError: historyFailed } = useGaugeHistory(siteId, days);
  const { data: recent } = useGaugeHistory(siteId, RECENT_DAYS);
  const { data: month } = useGaugeHistory(siteId, RECORD_WINDOW_DAYS);

  // gauge_data_unavailable — one event per summary mount per category, never
  // a stream. The bag carries provider, tier and the category only: no
  // reading, no station identifier, no coordinate.
  const reportedUnavailable = useRef<Set<string>>(new Set());
  const reportUnavailable = (category: 'history' | 'reading') => {
    if (reportedUnavailable.current.has(category)) return;
    reportedUnavailable.current.add(category);
    trackGaugeDataUnavailable({ provider: provider ?? 'usgs', tier }, category);
  };

  // ── Trust ────────────────────────────────────────────────────────
  // The qualifier half arrives pre-classified as `readingSuspect` (the server
  // runs the shared SUSPECT_QUALIFIERS table); the age half is the shared
  // six-hour line. Untrusted keeps the number and its age, nothing else.
  const trust = readingSuspect
    ? ({ trusted: false, reason: 'suspect_qualifier' } as const)
    : assessReadingTrust({ ageHours: readingAgeHours });
  const trusted = trust.trusted;

  const value = primaryUnit === 'cfs' ? dischargeCfs : gaugeHeightFt;
  const valueText =
    value == null
      ? null
      : primaryUnit === 'cfs'
        ? `${Math.round(value).toLocaleString()} cfs`
        : `${value.toFixed(2)} ft`;

  // Only an instantaneous series may describe the last few hours.
  const recentSeries = recent && recent.resolution !== 'daily' ? recent.readings : null;
  const trend = useMemo(
    () => (trusted ? recentTrend(recentSeries, primaryUnit) : null),
    [trusted, recentSeries, primaryUnit],
  );

  // ── Lately: facts about the water, for either tier — never a verdict ──
  // The record speaks about the CURRENT reading, so it needs a trusted one;
  // the crest and the water temperature are about the past and carry their
  // own age guards.
  const recordLine = trusted ? recentRecordSentence(recentRecord(month, primaryUnit)) : null;
  const peakLine = recentPeakSentence(recentPeak(recentSeries, primaryUnit));
  const coldLine = coldWaterNote(waterTemperature);
  const factLines = [recordLine, peakLine].filter((line): line is string => line !== null);

  // Upcoming points only: a stale station or a cached response can still
  // carry forecast points that have already happened.
  const forecast = useMemo(() => upcomingForecast(recent?.forecast), [recent]);
  const trustedStageFt = trusted ? gaugeHeightFt : null;

  // ── Safety ───────────────────────────────────────────────────────
  const safety: SafetySummary = useMemo(
    () =>
      summarizeSafety({
        stages: floodStages
          ? {
              action: floodStages.actionFt,
              flood: floodStages.floodFt,
              moderate: floodStages.moderateFt,
              major: floodStages.majorFt,
            }
          : null,
        currentFt: trustedStageFt,
        forecast: forecast.map((point) => ({
          t: point.timestamp,
          gaugeHeightFt: point.gaugeHeightFt,
        })),
      }),
    [floodStages, trustedStageFt, forecast],
  );
  const officialEvent = safety.kind === 'current';
  const safetySentence = safetySummarySentence(safety, {
    forecastDayLabel: safety.kind === 'forecast' && safety.crossesAt ? forecastDayLabel(safety.crossesAt) : null,
  });

  useEffect(() => {
    if (historyFailed) reportUnavailable('history');
    // A resolved tier with no primary value is a station that answered and
    // had nothing — the missing-data case, not the still-loading case.
    if (tier !== 'unknown' && value == null) reportUnavailable('reading');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyFailed, tier, value]);

  // ── Official forecast ────────────────────────────────────────────
  // The crest sentence needs a trusted stage to measure the rise from. Without
  // one the forecast's highest point is still quoted — it is the Weather
  // Service's number, not a comparison — and a forecast with no meaningful
  // rise says so rather than naming a "crest" that is today's level.
  const forecastSentence = (() => {
    if (!forecast.length) return 'No official river forecast published.';
    const crestLine = forecastCrestSentence(forecastCrest(forecast, trustedStageFt));
    if (crestLine) return `${crestLine}.`;
    if (trustedStageFt != null) return 'NWS forecast: little or no rise expected.';
    let high: { ft: number; at: string } | null = null;
    for (const point of forecast) {
      if (point.gaugeHeightFt == null || !Number.isFinite(point.gaugeHeightFt) || point.gaugeHeightFt <= -999) continue;
      if (!high || point.gaugeHeightFt > high.ft) high = { ft: point.gaugeHeightFt, at: point.timestamp };
    }
    if (!high) return 'No official river forecast published.';
    const day = forecastDayLabel(high.at);
    const when = !day ? '' : day === 'today' || day === 'tomorrow' ? ` ${day}` : ` on ${day}`;
    return `NWS forecast: highest ${formatStage(high.ft)}${when}.`;
  })();

  const band = tier === 'reference' ? flowBand(flowPercentile) : null;
  const providerLabel = PROVIDER_LABEL[provider ?? 'usgs'] ?? null;

  const rightNowChip = (() => {
    if (!trusted) return null;
    if (tier === 'rated') {
      // The condition IS the "right now" surface — no separate "Eddy-rated"
      // badge, and no chip at all for a verdict the ladder could not produce.
      return conditionCode && conditionCode !== 'unknown' ? (
        <ConditionBadge code={conditionCode} size="md" />
      ) : null;
    }
    if (tier === 'reference') {
      return band ? (
        <span
          className="inline-flex items-center text-sm font-bold rounded-full border px-2.5 py-1"
          style={{
            color: '#FFFFFF',
            backgroundColor: FLOW_BAND_SYSTEM[band].solid,
            borderColor: FLOW_BAND_SYSTEM[band].solid,
          }}
        >
          {FLOW_BAND_SYSTEM[band].label}
        </span>
      ) : (
        <span className="text-xs text-neutral-500">
          No historical comparison published for this gauge
        </span>
      );
    }
    // Unresolved: a SHAPE of chip size, not a sentence — the screen does not
    // know yet, and must say neither vocabulary's answer.
    return (
      <span
        aria-hidden="true"
        className="inline-block rounded-full bg-neutral-100 border border-neutral-200"
        style={{ width: 88, height: 28 }}
      />
    );
  })();

  const safetyRow = (
    <div className="flex items-baseline gap-2">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 w-20 flex-shrink-0">
        Safety
      </span>
      <span
        className={officialEvent ? 'text-sm font-bold' : 'text-sm text-neutral-700'}
        style={officialEvent ? { color: floodStageColor() } : undefined}
      >
        {safetySentence}
      </span>
    </div>
  );

  return (
    <div className={`rounded-xl border border-neutral-200 bg-white px-4 py-3 flex flex-col gap-2 ${className}`}>
      {/* During an official event the NWS statement outranks everything Eddy
          has to say — it leads, in its own violet, before the reading. */}
      {officialEvent && safetyRow}

      <div className="flex items-baseline gap-2 flex-wrap">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 w-20 flex-shrink-0">
          {readingAgeHours != null && readingAgeHours <= 6 ? 'Right now' : 'Last reading'}
        </span>
        <span className="font-mono text-lg font-bold tabular-nums text-neutral-900">
          {valueText ?? '—'}
        </span>
        {readingAgeHours != null && (
          <span className="text-xs text-neutral-500">{formatAgeFromHours(readingAgeHours)}</span>
        )}
        {trusted && trend && <span className="text-sm text-neutral-600">{trend.label}</span>}
        {rightNowChip}
        {!trusted && (
          <span className="text-xs text-amber-700">
            {trust.reason === 'suspect_qualifier'
              ? qualifierNote ?? 'Reading flagged by the source. It may be off.'
              : 'This gauge has not reported recently'}
          </span>
        )}
      </div>

      {tier === 'reference' && (
        <p className="text-xs text-neutral-500 -mt-1">
          {providerLabel ? `${providerLabel} · ` : ''}
          Eddy hasn&apos;t assigned a recreation condition to this location.
        </p>
      )}

      {yearsOfRecord != null && trusted ? <p className="text-xs text-neutral-500">Seasonal comparison based on {yearsOfRecord} years of discharge records.</p> : seasonalContextUnavailableReason ? <p className="text-xs text-neutral-500">{seasonalContextUnavailableReason}</p> : null}
      {(factLines.length > 0 || coldLine) && (
        <div className="flex items-baseline gap-2">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 w-20 flex-shrink-0">
            Lately
          </span>
          <span className="flex flex-col gap-0.5 text-sm">
            {factLines.map((line) => (
              <span key={line} className="text-neutral-600">{line}</span>
            ))}
            {/* Safety information about the water, at full strength — but not
                in the alarm colours, which belong to verdicts and the NWS. */}
            {coldLine && <span className="text-neutral-900">{coldLine}</span>}
          </span>
        </div>
      )}

      {!officialEvent && safetyRow}

      <div className="flex items-baseline gap-2">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 w-20 flex-shrink-0">
          Forecast
        </span>
        <span className="text-sm text-neutral-700">{forecastSentence}</span>
      </div>
    </div>
  );
}
