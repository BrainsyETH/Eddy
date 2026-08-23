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

import { useMemo } from 'react';
import { useGaugeHistory } from '@/hooks/useGaugeHistory';
import { computeTrend } from '@/lib/gauge-trend';
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
  floodStages?: GaugeFloodStages | null;
  className?: string;
}

function crestOf(
  forecast: { timestamp: string; gaugeHeightFt: number | null }[],
): { ft: number; at: string } | null {
  let best: { ft: number; at: string } | null = null;
  for (const point of forecast) {
    if (point.gaugeHeightFt == null) continue;
    if (!best || point.gaugeHeightFt > best.ft) best = { ft: point.gaugeHeightFt, at: point.timestamp };
  }
  return best;
}

function dayLabel(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  return date.toLocaleDateString('en-US', { weekday: 'long' });
}

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
  floodStages,
  className = '',
}: GaugeSummaryProps) {
  const { data: history } = useGaugeHistory(siteId, days);

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

  const trend = useMemo(
    () => (trusted ? computeTrend(history?.readings, primaryUnit) : null),
    [trusted, history, primaryUnit],
  );

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
        currentFt: trusted ? gaugeHeightFt : null,
        forecast: (history?.forecast ?? []).map((point) => ({
          t: point.timestamp,
          gaugeHeightFt: point.gaugeHeightFt,
        })),
      }),
    [floodStages, trusted, gaugeHeightFt, history],
  );
  const officialEvent = safety.kind === 'current';
  const safetySentence = safetySummarySentence(safety, {
    forecastDayLabel: safety.kind === 'forecast' ? dayLabel(safety.crossesAt) : null,
  });

  // ── Official forecast ────────────────────────────────────────────
  const crest = useMemo(() => crestOf(history?.forecast ?? []), [history]);
  const forecastSentence = crest
    ? `NWS forecast: near ${formatStage(crest.ft)}${dayLabel(crest.at) ? ` ${dayLabel(crest.at)}` : ''}.`
    : 'No official river forecast published.';

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
          Right now
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
              ? qualifierNote ?? 'Reading flagged by the source — may be inaccurate'
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
