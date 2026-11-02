'use client';

// src/components/gauge/RiverCard.tsx
// Dashboard card for one river, read through ONE primary gauge.
//
// Reading order: river → the reading and WHERE it was taken → Eddy's practical
// read (condition, trend, advice) → the 14-day chart at that gauge → river
// facts → the report. The reading is a single station's, so the card says
// which station beside the number, and the river's other gauges are a link
// into the report rather than a count that implies a river-wide figure.

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Droplets, ArrowRight, ChevronDown, ChevronUp, ChevronRight, Camera, Clock } from 'lucide-react';

import type { RiverGroup } from '@/lib/river-groups';
import { type RiverFilterMeta, DIFFICULTY_TIER_LABELS, riverTypeLabel } from '@/lib/rivers/filters';
import { useEddyUpdates } from '@/hooks/useEddyUpdates';
import { getEddyImageForCondition } from '@/constants';
import ConditionBadge from '@/components/ui/ConditionBadge';
import Card from '@/components/ui/Card';
import { buildStaticEddyText, RIVER_NOTES } from '@/data/eddy-quotes';
import FlowTrendChart from '@/components/ui/FlowTrendChart';
import { TrendLabel, useGaugeTrendContext } from '@/components/gauge/GaugeTrendContext';
import DamInfoTip from '@/components/dam/DamInfoTip';
import { conditionSnapshotMatches } from '@/lib/condition-snapshot';
import { shortenGaugeName } from '@/lib/gauge/format-name';
import { gaugeFreshness } from '@shared/gauge-freshness';
import { relativeAgeShort } from '@shared/dam-schedule-copy';

interface RiverCardProps {
  riverGroup: RiverGroup;
  /** Optional per-river metadata (state, type, difficulty, length) for the info line. */
  meta?: RiverFilterMeta;
  /** Straight-line distance from the visitor, when the "Nearest me" sort is active. */
  distanceMiles?: number | null;
  /** Prefer the directory's canonical path over the legacy slug redirect. */
  href?: string;
}

/**
 * The observation's own clock time at the gauge's region ("4:15 PM CST"), with
 * the date once it is from an earlier day. Deterministic, so the server render
 * and hydration agree; the age-dependent flag is added after mount.
 */
function readingClock(timestamp: string | null | undefined, now: number | null): string | null {
  const ms = timestamp ? Date.parse(timestamp) : NaN;
  if (!Number.isFinite(ms)) return null;
  const at = new Date(ms);
  const timeZone = 'America/Chicago';
  const time = at.toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit', timeZoneName: 'short' });
  const day = (d: Date) => d.toLocaleDateString('en-US', { timeZone });
  if (now !== null && day(at) !== day(new Date(now))) {
    return `${at.toLocaleDateString('en-US', { timeZone, month: 'short', day: 'numeric' })}, ${time}`;
  }
  return time;
}

export default function RiverCard({ riverGroup, meta, distanceMiles, href: canonicalHref }: RiverCardProps) {
  const { riverName, riverSlug, condition, primaryGauge, primaryThreshold, allGauges } = riverGroup;

  // River facts, quieter than conditions and placed near the footer. Length is
  // labelled as the RIVER's length so it cannot read as a suggested float.
  const metaBits: string[] = [];
  if (distanceMiles != null && Number.isFinite(distanceMiles)) {
    metaBits.push(`${Math.max(1, Math.round(distanceMiles))} mi away`);
  }
  if (meta?.state) metaBits.push(meta.state);
  if (meta?.lengthMiles != null && Number.isFinite(meta.lengthMiles)) metaBits.push(`River length ${Math.round(meta.lengthMiles)} mi`);
  const typeLabel = riverTypeLabel(meta?.riverType);
  if (typeLabel) metaBits.push(typeLabel);
  if (meta?.difficultyTier) metaBits.push(DIFFICULTY_TIER_LABELS[meta.difficultyTier]);

  const [showFull, setShowFull] = useState(false);

  // Whether the collapsed (2-line clamped) summary is actually truncated. Drives
  // the More/Less toggle, including for the static fallback.
  const quoteRef = useRef<HTMLParagraphElement>(null);
  const [isClamped, setIsClamped] = useState(false);

  // The reading's AGE depends on the clock, and a cached render can be minutes
  // or hours old by the time it hydrates. So the server and first client render
  // show only the observation's own time, and the old-reading flag is added
  // once mounted. That flag describes the OBSERVATION, never the page fetch.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => { setNow(Date.now()); }, []);

  // Eddy update comes from the batched /api/eddy-updates call — one request
  // shared by every card on the grid (and the home page) via React Query.
  const { data: eddyUpdates, isLoading: eddyLoading } = useEddyUpdates();
  const eddyUpdate = riverSlug ? eddyUpdates?.[riverSlug] ?? null : null;
  const usableEddyUpdate = eddyUpdate && conditionSnapshotMatches(
    {
      conditionCode: eddyUpdate.conditionCode,
      gaugeHeightFt: eddyUpdate.gaugeHeightFt,
      dischargeCfs: eddyUpdate.dischargeCfs,
    },
    {
      conditionCode: condition.code,
      gaugeHeightFt: primaryGauge.gaugeHeightFt,
      dischargeCfs: primaryGauge.dischargeCfs,
    },
    primaryThreshold.thresholdUnit,
  ) ? eddyUpdate : null;

  // Static fallback text — shared with the full river report page so the quote
  // reads identically across the card and the report (see buildStaticEddyText).
  const buildStaticText = () =>
    buildStaticEddyText({
      conditionCode: condition.code,
      gaugeHeightFt: primaryGauge.gaugeHeightFt,
      dischargeCfs: primaryGauge.dischargeCfs,
      optimalMin: primaryThreshold.levelOptimalMin,
      optimalMax: primaryThreshold.levelOptimalMax,
      thresholdUnit: primaryThreshold.thresholdUnit,
      riverNote: riverSlug ? RIVER_NOTES[riverSlug] : null,
    });

  const displayText = usableEddyUpdate?.summaryText ?? buildStaticText();

  // Measure whether the collapsed summary overflows its 2-line clamp. Only
  // measured while collapsed; retained once expanded so Less stays put.
  useEffect(() => {
    if (showFull) return;
    const el = quoteRef.current;
    if (!el) return;
    const measure = () => setIsClamped(el.scrollHeight > el.clientHeight + 1);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [displayText, showFull, eddyLoading]);

  const canExpand = isClamped || showFull;

  const isCfsPrimary = primaryThreshold.thresholdUnit === 'cfs';
  const primaryValue = isCfsPrimary ? primaryGauge.dischargeCfs : primaryGauge.gaugeHeightFt;
  const primaryUnitLabel = isCfsPrimary ? 'cfs' : 'ft';
  const displayUnit = isCfsPrimary ? 'cfs' as const : 'ft' as const;

  const { trend, recent } = useGaugeTrendContext(primaryGauge.usgsSiteId, primaryValue, displayUnit);

  const gaugePlace = shortenGaugeName(primaryGauge.name);
  const clock = readingClock(primaryGauge.readingTimestamp, now);
  const freshness = now === null ? null : gaugeFreshness(primaryGauge.readingTimestamp, now);
  const oldReading = freshness === 'delayed' || freshness === 'historical';
  const age = oldReading && now !== null ? relativeAgeShort(primaryGauge.readingTimestamp, now) : null;

  const chartThresholds = {
    levelTooLow: primaryThreshold.levelTooLow,
    levelLow: primaryThreshold.levelLow,
    levelOptimalMin: primaryThreshold.levelOptimalMin,
    levelOptimalMax: primaryThreshold.levelOptimalMax,
    levelHigh: primaryThreshold.levelHigh,
    levelDangerous: primaryThreshold.levelDangerous,
  };

  const href = canonicalHref ?? (riverSlug ? `/rivers/${riverSlug}` : '#');
  const gaugeCount = allGauges.length;

  return (
    <Card as="article" variant="framed" className="flex min-w-0 flex-col">
      {/* Header: the river, and the one reading with the place it was taken. */}
      <Link
        href={href}
        prefetch={false}
        className="flex items-start justify-between gap-3 bg-primary-800 px-4 py-3.5 text-white transition-colors hover:bg-primary-900 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-primary-200 sm:px-5"
      >
        <div className="flex min-w-0 flex-1 items-start gap-2">
          <Droplets className="mt-1 size-4 shrink-0 text-primary-200" aria-hidden="true" />
          {/* Wraps rather than truncates: a phone shows the whole name. */}
          <h2 className="font-heading text-xl font-bold leading-6 text-white">{riverName}</h2>
        </div>
        <div className="shrink-0 text-right" data-river-reading>
          {primaryValue !== null ? (
            <p className={`whitespace-nowrap leading-8 ${oldReading ? 'opacity-80' : ''}`}>
              <span className="font-mono text-[26px] font-medium tabular-nums tracking-tight sm:text-[28px]">
                {isCfsPrimary ? primaryValue.toLocaleString() : primaryValue.toFixed(2)}
              </span>{' '}
              <span className="text-[13px] text-primary-100">{primaryUnitLabel}</span>
            </p>
          ) : (
            <p className="text-sm text-primary-100">No reading</p>
          )}
          <p className="text-[13px] font-semibold leading-[18px] text-white" title={primaryGauge.name}>At {gaugePlace}</p>
          {clock && (oldReading ? (
            <p className="mt-1 inline-flex items-center gap-1 whitespace-nowrap rounded-full bg-amber-100 px-2 py-px text-xs font-medium leading-[18px] text-amber-900">
              <Clock className="size-3 shrink-0" aria-hidden="true" />
              <span><span className="sr-only">Outdated reading: </span>{clock}{age ? ` · ${age}` : ''}</span>
            </p>
          ) : (
            <p className="text-xs leading-4 text-primary-200">Reading {clock}</p>
          ))}
        </div>
      </Link>

      {/* Eddy's practical read: one badge, the trend, the advice. */}
      <section aria-label="Conditions" className="flex gap-3 border-b border-neutral-200 bg-secondary-100 px-4 pb-1.5 pt-3 sm:px-5">
        <div className="relative size-12 shrink-0">
          <Image src={getEddyImageForCondition(condition.code)} alt="" fill className="object-contain" sizes="48px" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <ConditionBadge code={condition.code} size="sm" />
            {trend && <TrendLabel trend={trend} />}
          </div>
          {eddyLoading && !eddyUpdate ? (
            <p className="mt-1.5 text-[15px] leading-6 text-neutral-500">Loading Eddy’s read…</p>
          ) : (
            <p ref={quoteRef} className={`mt-1.5 text-[15px] font-medium leading-6 text-neutral-900 ${showFull ? '' : 'line-clamp-2'}`}>
              <span className="sr-only">Eddy says: </span>{displayText}
            </p>
          )}
          <div className="flex min-h-11 items-center justify-between gap-2">
            {recent ? (
              <div className="flex items-center">
                <span className="text-[13px] text-neutral-600 first-letter:uppercase">{recent.short}</span>
                <span className="-ml-1.5">
                  <DamInfoTip title="Recent levels">
                    <p>{recent.descriptor} of readings at {gaugePlace}: this reading is {recent.short} for that window.</p>
                    <p>It is not a seasonal average. A river can sit below its recent levels and still be well above normal for the time of year.</p>
                  </DamInfoTip>
                </span>
              </div>
            ) : <span />}
            {canExpand && (
              <button
                type="button"
                onClick={() => setShowFull(!showFull)}
                aria-expanded={showFull}
                className="-mr-2 inline-flex min-h-11 min-w-11 items-center justify-center gap-1 rounded px-2 text-[13px] font-semibold text-primary-700 hover:text-primary-900 focus-visible:outline-2 focus-visible:outline-primary-600"
              >
                {showFull ? <>Less <ChevronUp className="size-3.5" aria-hidden="true" /></> : <>More <ChevronDown className="size-3.5" aria-hidden="true" /></>}
              </button>
            )}
          </div>
        </div>
      </section>

      {/* The chart is the primary gauge's, and says so. It stays a static
          preview that opens the report: a scrub here would compete with page
          scroll, and detailed inspection belongs to the report's chart. */}
      <section aria-label={`Flow at ${gaugePlace}`} className="px-4 pt-0.5 sm:px-5">
        <div className="flex items-center justify-between gap-3">
          <p className="min-w-0 text-[13px] text-neutral-700"><span className="font-semibold">{gaugePlace} gauge</span> · 14 days</p>
          {gaugeCount > 1 && (
            <Link href={`${href}#status`} prefetch={false} className="-mr-1 inline-flex min-h-11 shrink-0 items-center gap-0.5 rounded px-1 text-[13px] font-medium text-primary-700 hover:text-primary-900 focus-visible:outline-2 focus-visible:outline-primary-600">
              View all {gaugeCount} gauges<ChevronRight className="size-3.5" aria-hidden="true" />
            </Link>
          )}
        </div>
        <Link href={href} prefetch={false} tabIndex={-1} className="-mx-4 -mt-3 block sm:-mx-5">
          <FlowTrendChart
            gaugeSiteId={primaryGauge.usgsSiteId}
            days={14}
            thresholds={chartThresholds}
            latestValue={primaryValue}
            displayUnit={displayUnit}
            chartClassName="h-32"
            interactive={false}
            showCurrent={false}
          />
        </Link>
      </section>

      <div className="flex flex-1 flex-col px-4 pb-1 sm:px-5">
        {metaBits.length > 0 && <p className="text-[13px] leading-[18px] text-neutral-600">{metaBits.join(' · ')}</p>}

        <div className="mt-auto pt-2">
          <div className="flex items-center justify-between gap-3 border-t border-neutral-200">
            <Link
              href={href}
              prefetch={false}
              className="inline-flex min-h-11 items-center gap-1.5 rounded text-sm font-semibold text-primary-700 hover:text-primary-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-600"
            >
              Full river report<span className="sr-only"> for {riverName}</span>
              <ArrowRight className="size-3.5" aria-hidden="true" />
            </Link>
            <Link
              href={riverSlug ? `/plan?river=${riverSlug}&submitPhoto=true` : '#'}
              prefetch={false}
              className="inline-flex min-h-11 items-center gap-1.5 rounded text-[13px] font-medium text-neutral-600 hover:text-primary-700 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-600"
            >
              <Camera className="size-3.5" aria-hidden="true" />
              Add photo
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}
