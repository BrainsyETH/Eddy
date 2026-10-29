'use client';

// src/components/gauge/CurrentReadingCard.tsx
// The current reading, verdict first: Eddy and the condition, the rated reading
// large with the other unit beside it, the trend, and the band track showing
// where the reading falls on the river's ladder. Mirrors the app's
// ReadingSummaryCard (eddy-ios/src/components/ReadingSummaryCard.tsx).
//
// The track lives here rather than on the levels table below because "where am
// I" belongs next to the number it qualifies. The table lists what each band
// means; it no longer draws a second marker of its own.

import Image from 'next/image';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { useGaugeHistory } from '@/hooks/useGaugeHistory';
import { CONDITION_SHORT_LABELS, getEddyImageForCondition } from '@/constants';
import { CONDITION_SYSTEM } from '@shared/condition-system';
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
  /** Inside another card: no frame or padding of its own. */
  embedded?: boolean;
  /** Footer rows under the reading — the river page passes its safety and forecast lines. */
  children?: React.ReactNode;
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
  children,
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

  const formatFt = (val: number) => val.toFixed(2);
  const formatCfs = (val: number) => val.toLocaleString();

  const conditionLabel = conditionCode ? CONDITION_SHORT_LABELS[conditionCode] ?? CONDITION_SHORT_LABELS.unknown : null;

  // A steady river says so in words; "0 cfs" beside "Holding steady" is noise.
  const roundedDelta = trend ? (isCfsPrimary ? Math.round(trend.delta) : Number(trend.delta.toFixed(2))) : 0;
  const trendDelta = trend && roundedDelta !== 0
    ? `${roundedDelta > 0 ? '+' : ''}${isCfsPrimary ? roundedDelta : roundedDelta.toFixed(2)} ${isCfsPrimary ? 'cfs' : 'ft'}`
    : null;

  const ink = conditionCode ? (CONDITION_SYSTEM[conditionCode] ?? CONDITION_SYSTEM.unknown).ink : 'var(--color-neutral-700)';
  const primaryText = isCfsPrimary
    ? (dischargeCfs !== null ? `${formatCfs(dischargeCfs)} cfs` : null)
    : (gaugeHeightFt !== null ? `${formatFt(gaugeHeightFt)} ft` : null);
  const secondaryText = isCfsPrimary
    ? (gaugeHeightFt !== null ? `${formatFt(gaugeHeightFt)} ft` : null)
    : (dischargeCfs !== null ? `${formatCfs(dischargeCfs)} cfs` : null);
  const TrendIcon = trend?.direction === 'rising' ? TrendingUp : trend?.direction === 'falling' ? TrendingDown : Minus;

  // Light, verdict-first, one headline number — the same reading of the river
  // the app's ReadingSummaryCard gives, so the two platforms answer "is it
  // floatable?" in the same order. The condition is said once, here.
  return (
    <div
      className={`${embedded ? '' : 'card-framed'} bg-white ${className}`}
      role="group"
      aria-label="Current gauge reading"
    >
      {/* One concise spoken summary instead of letting screen readers re-read
          the card on every background poll. */}
      <p className="sr-only" aria-live="polite">
        {conditionLabel ? `${conditionLabel}. ` : ''}
        {gaugeHeightFt !== null ? `Stage ${formatFt(gaugeHeightFt)} feet. ` : ''}
        {dischargeCfs !== null ? `Flow ${formatCfs(dischargeCfs)} cubic feet per second. ` : ''}
        {activeZone ? `${activeZone.label} range is ${formatZoneRange(activeZone, thresholdUnit)}. ` : ''}
        {trend ? `${trend.label}.` : ''}
      </p>

      <div className={embedded ? '' : 'px-4 pt-4 sm:px-5'} aria-hidden="true">
        <div className="flex items-center gap-3">
          {conditionCode && (
            <Image
              src={getEddyImageForCondition(conditionCode)}
              alt=""
              width={52}
              height={52}
              className="h-[52px] w-[52px] flex-shrink-0 object-contain"
            />
          )}
          <div className="min-w-0 flex-1">
            {conditionLabel && (
              <p className="text-lg font-semibold leading-tight" style={{ color: ink }}>{conditionLabel}</p>
            )}
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="font-mono text-2xl font-bold tabular-nums text-neutral-900">{primaryText ?? 'No reading'}</span>
              {secondaryText && <span className="font-mono text-sm tabular-nums text-neutral-500">{secondaryText}</span>}
              {trend && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-neutral-600">
                  <TrendIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  {trend.label}
                  {trendDelta && <span className="font-mono tabular-nums text-neutral-500">{trendDelta}</span>}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Where this reading sits on the river's ladder. The full ladder with
            what each band means is the levels table below. */}
        {ladder.length > 0 && (
          <div className="mt-4">
            <div className="relative">
              <div className="flex h-2.5 overflow-hidden rounded-full">
                {ladder.map((zone) => (
                  <div
                    key={zone.key}
                    className="flex-1"
                    style={{
                      backgroundColor: zone.color,
                      opacity: activeZone && zone.key !== activeZone.key ? 0.35 : 1,
                    }}
                  />
                ))}
              </div>
              {markerPercent !== null && (
                <div
                  className="absolute top-1/2 h-[18px] w-[4px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-neutral-900 shadow-[0_0_0_2px_#ffffff]"
                  style={{ left: `${markerPercent}%` }}
                />
              )}
            </div>
            {activeZone && (
              <p className="mt-1.5 text-xs text-neutral-500">
                {activeZone.label}: {formatZoneRange(activeZone, thresholdUnit)}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Water quality, when this gauge or a monitor below it publishes it —
          always with its age and, off this gauge, the station it came from. */}
      {((waterTempF != null && waterTempAgeHours != null && waterTempAgeHours <= 24) ||
        (dissolvedOxygenMgL != null && dissolvedOxygenAgeHours != null && dissolvedOxygenAgeHours <= 24)) && (
        <div className={`mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t border-neutral-200 pt-3 text-sm ${embedded ? '' : 'mx-4 sm:mx-5'}`}>
          {waterTempF != null && waterTempAgeHours != null && waterTempAgeHours <= 24 && (
            <p className="text-neutral-700">
              Water <span className="font-mono font-semibold tabular-nums text-neutral-900">{waterTempF}°F</span>
              <span className="ml-1.5 text-xs text-neutral-500">
                {formatAgeFromHours(waterTempAgeHours)}{waterQualitySourceName ? ` at ${waterQualitySourceName}` : ''}
              </span>
            </p>
          )}
          {dissolvedOxygenMgL != null && dissolvedOxygenAgeHours != null && dissolvedOxygenAgeHours <= 24 && (
            <p className="text-neutral-700">
              Oxygen <span className="font-mono font-semibold tabular-nums text-neutral-900">{dissolvedOxygenMgL} mg/L</span>
              <span className="ml-1.5 text-xs text-neutral-500">
                {formatAgeFromHours(dissolvedOxygenAgeHours)}{waterQualitySourceName ? ` at ${waterQualitySourceName}` : ''}
              </span>
            </p>
          )}
        </div>
      )}

      {/* Safety and forecast lines from the summary, when the page passes them. */}
      {children && <div className={`mt-3 border-t border-neutral-200 ${embedded ? 'pt-3' : 'mx-4 pt-3 sm:mx-5'}`}>{children}</div>}

      {readingAgeHours != null && (
        <p className={`text-xs text-neutral-500 ${embedded ? 'mt-3' : 'px-4 pb-4 pt-3 sm:px-5'}`}>
          Updated {formatAgeFromHours(readingAgeHours)}
        </p>
      )}
      {readingAgeHours == null && !embedded && <div className="pb-4" />}
    </div>
  );
}
