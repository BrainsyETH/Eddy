'use client';

// src/components/gauge/CurrentReadingCard.tsx
// Dark-themed current reading card: condition strip, the two headline numbers,
// and the band track showing where this reading falls on the river's ladder.
//
// The track lives here rather than on the levels table below because "where am
// I" belongs next to the number it qualifies. The table lists what each band
// means; it no longer draws a second marker of its own.

import Image from 'next/image';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useGaugeHistory } from '@/hooks/useGaugeHistory';
import { CONDITION_COLORS, CONDITION_SHORT_LABELS, getEddyImageForCondition } from '@/constants';
import type { ConditionCode } from '@/types/api';
import { computeTrend } from '@shared/gauge-trend';
import {
  findZoneIndex,
  formatZoneRange,
  zoneMarkerPercent,
  type Zone,
} from '@/lib/gauge/threshold-zones';
import { formatAgeFromHours } from '@/lib/utils/reading-age';

interface CurrentReadingCardProps {
  siteId: string;
  gaugeHeightFt: number | null;
  dischargeCfs: number | null;
  thresholdUnit: 'ft' | 'cfs';
  conditionCode?: ConditionCode;
  waterTempF?: number | null;
  /**
   * Age of the water-temperature measurement, hours. Water temperature stays
   * visible however old it is — it moves slowly — but never without its age:
   * an undated number under a live reading borrows the reading's freshness.
   */
  waterTempAgeHours?: number | null;
  /**
   * Dissolved oxygen, mg/L. Rendered as a bare number with its age and no
   * verdict: published thresholds for what trout tolerate exist, but a habitat
   * badge would read as advice Eddy has not sourced. Mostly null — the
   * stations that carry it are the water-quality monitors below the White
   * River system dams, which publish this and temperature and no flow at all.
   */
  dissolvedOxygenMgL?: number | null;
  dissolvedOxygenAgeHours?: number | null;
  /**
   * Station that produced the water-quality readings, when it is NOT this
   * gauge. A dam release measures discharge and nothing else, so on a tailwater
   * these come from a USGS water-quality monitor down the river. Rendering the
   * number without naming that station would attribute it to the wrong water.
   */
  waterQualitySourceName?: string | null;
  readingAgeHours?: number | null;
  /** Condition ladder in `thresholdUnit`. Omit to render the card without a track. */
  zones?: Zone[];
  className?: string;
  embedded?: boolean;
}

export default function CurrentReadingCard({
  siteId,
  gaugeHeightFt,
  dischargeCfs,
  thresholdUnit,
  conditionCode,
  waterTempF,
  waterTempAgeHours,
  dissolvedOxygenMgL,
  dissolvedOxygenAgeHours,
  waterQualitySourceName,
  readingAgeHours,
  zones,
  className = '',
  embedded = false,
}: CurrentReadingCardProps) {
  const { data: history } = useGaugeHistory(siteId, 14);

  const isCfsPrimary = thresholdUnit === 'cfs';

  // Plain-language trend over the last ~6h. There is deliberately no percentile
  // beside it: the one we showed compared today against a 14-day window that
  // today sits inside, so a falling river read "below typical" almost by
  // construction. A tautology is worse than a blank space.
  const trend = computeTrend(history?.readings, thresholdUnit, 6);
  const primaryReadingValue = isCfsPrimary ? dischargeCfs : gaugeHeightFt;

  // Band track — equal-width bands, marker interpolated within its own band.
  const ladder = zones ?? [];
  const markerPercent = zoneMarkerPercent(ladder, primaryReadingValue);
  const activeIndex = findZoneIndex(ladder, conditionCode);
  const activeZone = activeIndex >= 0 ? ladder[activeIndex] : null;
  const prevZone = activeIndex > 0 ? ladder[activeIndex - 1] : null;
  const nextZone = activeIndex >= 0 && activeIndex < ladder.length - 1 ? ladder[activeIndex + 1] : null;

  const formatFt = (val: number) => val.toFixed(2);
  const formatCfs = (val: number) => val.toLocaleString();

  // Condition strip — solid color background with short label
  const conditionColor = conditionCode ? CONDITION_COLORS[conditionCode] ?? CONDITION_COLORS.unknown : null;
  const conditionLabel = conditionCode ? CONDITION_SHORT_LABELS[conditionCode] ?? CONDITION_SHORT_LABELS.unknown : null;
  const conditionSurfaceColor = conditionCode === 'flowing' ? 'var(--cond-flowing-solid)' : conditionColor;
  const conditionInkColor = conditionCode === 'flowing' ? 'var(--cond-flowing-ink)' : 'var(--color-neutral-950)';

  const trendDelta = trend
    ? `${trend.delta > 0 ? '+' : ''}${isCfsPrimary ? Math.round(trend.delta) : trend.delta.toFixed(2)} ${isCfsPrimary ? 'cfs' : 'ft'}`
    : null;

  return (
    <div className={`${embedded ? 'rounded-none' : 'rounded-xl'} overflow-hidden bg-primary-800 ${className}`} role="group" aria-label="Current gauge reading">
      {/* One concise spoken summary instead of letting screen readers re-read the
          full two-column grid (both numbers + labels) on every background poll. */}
      <p className="sr-only" aria-live="polite">
        {conditionLabel ? `${conditionLabel}. ` : ''}
        {gaugeHeightFt !== null ? `Stage ${formatFt(gaugeHeightFt)} feet. ` : ''}
        {dischargeCfs !== null ? `Flow ${formatCfs(dischargeCfs)} cubic feet per second. ` : ''}
        {activeZone ? `${activeZone.label} range is ${formatZoneRange(activeZone, thresholdUnit)}. ` : ''}
        {trend ? `${trend.label}.` : ''}
      </p>

      {/* Condition status strip — bold solid band for at-a-glance color, with
          near-black ink (clears WCAG AA on every condition solid; white does not).
          Eddy's condition-matched artwork fronts the label (same asset set as
          the Eddy Says card and the hero pill). */}
      {conditionCode && conditionSurfaceColor && conditionLabel && (
        <div
          className="px-4 py-2 flex items-center justify-center gap-2"
          style={{ backgroundColor: conditionSurfaceColor }}
        >
          <Image
            src={getEddyImageForCondition(conditionCode)}
            alt=""
            width={28}
            height={28}
            className="h-7 w-7 object-contain"
          />
          <span className="font-sans text-xs font-bold tracking-wide uppercase" style={{ color: conditionInkColor }}>
            {conditionLabel}
          </span>
        </div>
      )}

      {/* 2-column readings: Stage | Flow (visual only; announced via summary above) */}
      <div className="grid grid-cols-2 divide-x divide-white/10" aria-hidden="true">
        {/* Stage (ft) */}
        <div className={`px-4 pt-4 pb-3 ${!isCfsPrimary ? '' : 'opacity-70'}`}>
          <span className="mb-1 block font-sans text-[11px] font-semibold uppercase tracking-wider text-primary-100">
            Stage
          </span>
          {gaugeHeightFt !== null ? (
            <div className="flex items-baseline gap-1.5">
              <span className={`${!isCfsPrimary ? 'text-3xl md:text-4xl' : 'text-2xl md:text-3xl'} font-mono font-bold text-white tabular-nums leading-none`}>
                {formatFt(gaugeHeightFt)}
              </span>
              <span className="font-mono text-sm font-medium text-primary-100">ft</span>
            </div>
          ) : (
            <span className="text-xl text-white/30">—</span>
          )}
        </div>

        {/* Flow (cfs) */}
        <div className={`px-4 pt-4 pb-3 ${isCfsPrimary ? '' : 'opacity-70'}`}>
          <span className="mb-1 block font-sans text-[11px] font-semibold uppercase tracking-wider text-primary-100">
            Flow
          </span>
          {dischargeCfs !== null ? (
            <div className="flex items-baseline gap-1.5">
              <span className={`${isCfsPrimary ? 'text-3xl md:text-4xl' : 'text-2xl md:text-3xl'} font-mono font-bold text-white tabular-nums leading-none`}>
                {formatCfs(dischargeCfs)}
              </span>
              <span className="font-mono text-sm font-medium text-primary-100">cfs</span>
            </div>
          ) : (
            <span className="text-xl text-white/30">—</span>
          )}
        </div>
      </div>

      {/* Band track — where this reading sits on the river's ladder. Only the
          two neighbouring band names are labelled; the full ladder with what
          each band means is the levels table below. */}
      {ladder.length > 0 && (
        <div className="px-4 pb-1 pt-1" aria-hidden="true">
          <div className="relative">
            <div className="flex h-2.5 overflow-hidden rounded-full">
              {ladder.map((zone) => (
                <div
                  key={zone.key}
                  className="flex-1"
                  style={{
                    backgroundColor: zone.color,
                    // Dim the bands you are not in so the active one reads first.
                    opacity: activeZone && zone.key !== activeZone.key ? 0.4 : 1,
                  }}
                />
              ))}
            </div>
            {markerPercent !== null && (
              <div
                className="absolute top-1/2 h-[18px] w-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_0_1.5px_var(--color-primary-900)]"
                style={{ left: `${markerPercent}%` }}
              />
            )}
          </div>

          {activeZone && (
            <div className="mt-2 flex items-baseline justify-between gap-2 font-mono text-[10px] uppercase tracking-wide text-primary-200">
              <span className="min-w-0 truncate">{prevZone ? `← ${prevZone.label}` : ''}</span>
              <span className="whitespace-nowrap font-semibold text-white">
                {activeZone.label} {formatZoneRange(activeZone, thresholdUnit)}
              </span>
              <span className="min-w-0 truncate text-right">{nextZone ? `${nextZone.label} →` : ''}</span>
            </div>
          )}
        </div>
      )}

      {/* Which way it is moving right now. */}
      {trend && (
        <div className="flex items-center gap-1.5 px-4 pb-3 pt-2">
          {trend.direction === 'rising' ? (
            <TrendingUp className="h-3.5 w-3.5 text-orange-200" aria-hidden="true" />
          ) : trend.direction === 'falling' ? (
            <TrendingDown className="h-3.5 w-3.5 text-primary-100" aria-hidden="true" />
          ) : (
            <Minus className="h-3.5 w-3.5 text-primary-100" aria-hidden="true" />
          )}
          <span className={`text-xs font-semibold ${trend.direction === 'rising' ? 'text-orange-200' : 'text-primary-100'}`}>
            {trend.label}
          </span>
          {trendDelta && (
            <span className="font-mono text-xs tabular-nums text-primary-200">{trendDelta}</span>
          )}
        </div>
      )}

      {/* Water temperature (when available) — always with its measurement age */}
      {waterTempF != null && (
        <div className="px-4 py-2.5 border-t border-white/10">
          <span className="font-sans text-[11px] font-semibold uppercase tracking-wider text-primary-100">
            Water Temp
          </span>
          <span className="ml-2 font-mono text-lg font-bold tabular-nums text-white">
            {waterTempF}°F
          </span>
          {waterTempAgeHours != null && (
            <span className="ml-2 text-[10px] text-primary-100">
              measured {formatAgeFromHours(waterTempAgeHours)}
              {waterQualitySourceName ? ` at ${waterQualitySourceName}` : ''}
            </span>
          )}
        </div>
      )}

      {/* Dissolved oxygen (when available) — same rule, same reason */}
      {dissolvedOxygenMgL != null && (
        <div className="px-4 py-2.5 border-t border-white/10">
          <span className="font-sans text-[11px] font-semibold uppercase tracking-wider text-primary-100">
            Dissolved O&#8322;
          </span>
          <span className="ml-2 font-mono text-lg font-bold tabular-nums text-white">
            {dissolvedOxygenMgL} mg/L
          </span>
          {dissolvedOxygenAgeHours != null && (
            <span className="ml-2 text-[10px] text-primary-100">
              measured {formatAgeFromHours(dissolvedOxygenAgeHours)}
              {waterQualitySourceName ? ` at ${waterQualitySourceName}` : ''}
            </span>
          )}
        </div>
      )}

      {/* Reading freshness — so staleness is obvious on the card itself */}
      {readingAgeHours != null && (
        <div className="px-4 pb-3">
          <span className="text-[10px] text-primary-100">Updated {formatAgeFromHours(readingAgeHours)}</span>
        </div>
      )}
    </div>
  );
}
