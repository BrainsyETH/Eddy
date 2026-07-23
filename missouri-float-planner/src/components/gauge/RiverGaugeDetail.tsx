'use client';

// src/components/gauge/RiverGaugeDetail.tsx
// Embeddable "Current Conditions" panel for a river — gauge tabs, trend chart,
// current reading, Eddy Says, and threshold table. Rendered inside the
// canonical river hub at /rivers/[slug].

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { ExternalLink, Clock } from 'lucide-react';

import { computeCondition, getConditionShortLabel, getConditionTailwindColor, type ConditionThresholds } from '@/lib/conditions';
import { CFS_EXPLAINER, CONDITION_COLORS } from '@/constants';
import InfoTip from '@/components/ui/InfoTip';
import { buildStaticEddyText, RIVER_NOTES } from '@/data/eddy-quotes';
import type { ConditionCode } from '@/types/api';
import type { EddyUpdateResponse } from '@/app/api/eddy-update/[riverSlug]/route';
import type { GaugeUpdateResponse } from '@/app/api/gauge-update/[siteId]/route';
import { useRiverGroup } from '@/hooks/useRiverGroups';
import { useGaugeHistoryPrefetch } from '@/hooks/useGaugeHistory';
import { useRiverOutlook } from '@/hooks/useRiverOutlook';
import FlowTrendChart from '@/components/ui/FlowTrendChart';
import CurrentReadingCard from '@/components/gauge/CurrentReadingCard';
import WillItHold from '@/components/gauge/WillItHold';
import EddyOutlookFooter from '@/components/gauge/EddyOutlookFooter';
import ThresholdTable from '@/components/gauge/ThresholdTable';
import GaugeTabBar from '@/components/gauge/GaugeTabBar';
import RiverVisualGallery from '@/components/river/RiverVisualGallery';
import { usePathname } from 'next/navigation';
import { buildEddyTakeSummary } from '@/lib/river-outlook';

interface RiverGaugeDetailProps {
  riverSlug: string;
}

export default function RiverGaugeDetail({ riverSlug }: RiverGaugeDetailProps) {
  const { riverGroup, isLoading } = useRiverGroup(riverSlug);
  const prefetchHistory = useGaugeHistoryPrefetch();
  const [activeSiteId, setActiveSiteId] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState(14);
  const [shareStatus, setShareStatus] = useState<'idle' | 'copied'>('idle');
  const [displayUnit, setDisplayUnit] = useState<'ft' | 'cfs' | null>(null);

  // Dedicated, shareable Add-a-Photo page for this river. The hub is always at
  // the canonical /rivers/[state]/[slug], so append the segment to the path.
  const pathname = usePathname();
  const addPhotoHref = `${pathname}/add-photo`;

  // Eddy AI update (river-level, pinned to primary gauge)
  const [eddyUpdate, setEddyUpdate] = useState<EddyUpdateResponse['update'] | null>(null);
  const [eddyLoading, setEddyLoading] = useState(false);
  const [isEddyReportOpen, setIsEddyReportOpen] = useState(false);

  // Per-gauge Haiku update (only fetched when on a secondary tab)
  const [gaugeUpdate, setGaugeUpdate] = useState<GaugeUpdateResponse['update'] | null>(null);
  const [gaugeUpdateLoading, setGaugeUpdateLoading] = useState(false);

  // Set default active gauge when river group loads
  useEffect(() => {
    if (riverGroup && !activeSiteId) {
      setActiveSiteId(riverGroup.primaryGauge.usgsSiteId);
    }
  }, [riverGroup, activeSiteId]);

  // Prefetch history for all gauges in this river
  useEffect(() => {
    if (!riverGroup) return;
    const timeout = setTimeout(() => {
      const siteIds = riverGroup.allGauges.map(g => g.usgsSiteId);
      prefetchHistory(siteIds, 14);
    }, 500);
    return () => clearTimeout(timeout);
  }, [riverGroup, prefetchHistory]);

  // Fetch Eddy update for this river
  useEffect(() => {
    if (!riverSlug) return;
    let cancelled = false;
    setEddyLoading(true);

    async function fetchEddy() {
      try {
        const res = await fetch(`/api/eddy-update/${riverSlug}`);
        if (!res.ok) return;
        const data: EddyUpdateResponse = await res.json();
        if (!cancelled) {
          setEddyUpdate(data.available ? data.update : null);
        }
      } catch {
        // silently fail
      } finally {
        if (!cancelled) setEddyLoading(false);
      }
    }
    fetchEddy();
    return () => { cancelled = true; };
  }, [riverSlug]);

  // Fetch per-gauge update when active tab is a secondary gauge.
  // When on the primary tab we leave gaugeUpdate null and the render falls
  // back to the river-level eddyUpdate above.
  const isOnPrimaryTab = riverGroup ? activeSiteId === riverGroup.primaryGauge.usgsSiteId : true;
  useEffect(() => {
    setIsEddyReportOpen(false);
  }, [activeSiteId]);

  useEffect(() => {
    if (!activeSiteId || isOnPrimaryTab) {
      setGaugeUpdate(null);
      return;
    }
    let cancelled = false;
    setGaugeUpdateLoading(true);

    async function fetchGaugeUpdate() {
      try {
        const res = await fetch(`/api/gauge-update/${activeSiteId}`);
        if (!res.ok) return;
        const data: GaugeUpdateResponse = await res.json();
        if (!cancelled) setGaugeUpdate(data.available ? data.update : null);
      } catch {
        // silently fail — UI falls back to static blurb
      } finally {
        if (!cancelled) setGaugeUpdateLoading(false);
      }
    }
    fetchGaugeUpdate();
    return () => { cancelled = true; };
  }, [activeSiteId, isOnPrimaryTab]);

  // Active gauge derived state
  const activeGauge = useMemo(() => {
    if (!riverGroup || !activeSiteId) return null;
    return riverGroup.allGauges.find(g => g.usgsSiteId === activeSiteId) || riverGroup.primaryGauge;
  }, [riverGroup, activeSiteId]);

  // Get the threshold for this river from the active gauge
  const activeThreshold = useMemo(() => {
    if (!activeGauge || !riverGroup) return null;
    return activeGauge.thresholds?.find(t => t.riverId === riverGroup.riverId) ||
      activeGauge.thresholds?.find(t => t.isPrimary) ||
      activeGauge.thresholds?.[0] || null;
  }, [activeGauge, riverGroup]);

  // Primary unit from threshold data
  const primaryUnit = activeThreshold?.thresholdUnit || 'ft';

  // Initialize displayUnit from threshold when it loads, with localStorage persistence
  useEffect(() => {
    if (!activeThreshold) return;
    const stored = localStorage.getItem(`gauge-unit-${riverSlug}`);
    if (stored === 'ft' || stored === 'cfs') {
      setDisplayUnit(stored);
    } else {
      setDisplayUnit(activeThreshold.thresholdUnit);
    }
  }, [activeThreshold, riverSlug]);

  // Persist unit toggle
  const handleUnitToggle = useCallback((unit: 'ft' | 'cfs') => {
    setDisplayUnit(unit);
    localStorage.setItem(`gauge-unit-${riverSlug}`, unit);
  }, [riverSlug]);

  // Determine if we're showing alt thresholds
  const effectiveUnit = displayUnit || primaryUnit;
  const showingAlt = effectiveUnit !== primaryUnit;

  // Compute chart thresholds based on selected unit
  const chartThresholds = useMemo(() => {
    if (!activeThreshold) return null;
    if (showingAlt) {
      return {
        levelTooLow: activeThreshold.altLevelTooLow,
        levelLow: activeThreshold.altLevelLow,
        levelOptimalMin: activeThreshold.altLevelOptimalMin,
        levelOptimalMax: activeThreshold.altLevelOptimalMax,
        levelHigh: activeThreshold.altLevelHigh,
        levelDangerous: activeThreshold.altLevelDangerous,
      };
    }
    return {
      levelTooLow: activeThreshold.levelTooLow,
      levelLow: activeThreshold.levelLow,
      levelOptimalMin: activeThreshold.levelOptimalMin,
      levelOptimalMax: activeThreshold.levelOptimalMax,
      levelHigh: activeThreshold.levelHigh,
      levelDangerous: activeThreshold.levelDangerous,
    };
  }, [activeThreshold, showingAlt]);

  // Alt thresholds for ThresholdTable
  const altThresholds = useMemo(() => {
    if (!activeThreshold) return null;
    const hasAny = activeThreshold.altLevelTooLow !== null ||
      activeThreshold.altLevelLow !== null ||
      activeThreshold.altLevelOptimalMin !== null ||
      activeThreshold.altLevelOptimalMax !== null ||
      activeThreshold.altLevelHigh !== null ||
      activeThreshold.altLevelDangerous !== null;
    if (!hasAny) return null;
    return {
      levelTooLow: activeThreshold.altLevelTooLow,
      levelLow: activeThreshold.altLevelLow,
      levelOptimalMin: activeThreshold.altLevelOptimalMin,
      levelOptimalMax: activeThreshold.altLevelOptimalMax,
      levelHigh: activeThreshold.altLevelHigh,
      levelDangerous: activeThreshold.altLevelDangerous,
    };
  }, [activeThreshold]);

  const altUnit = primaryUnit === 'ft' ? 'cfs' as const : 'ft' as const;

  // NWS forecasts are stage-only. Use the stored foot ladder regardless of
  // which unit the user currently has selected, and never compare feet to CFS.
  const stageThresholds = useMemo<ConditionThresholds | null>(() => {
    if (!activeThreshold) return null;
    const values = primaryUnit === 'ft'
      ? {
          levelTooLow: activeThreshold.levelTooLow,
          levelLow: activeThreshold.levelLow,
          levelOptimalMin: activeThreshold.levelOptimalMin,
          levelOptimalMax: activeThreshold.levelOptimalMax,
          levelHigh: activeThreshold.levelHigh,
          levelDangerous: activeThreshold.levelDangerous,
        }
      : altThresholds;
    return values ? { ...values, thresholdUnit: 'ft' } : null;
  }, [activeThreshold, altThresholds, primaryUnit]);

  const outlook = useRiverOutlook({
    siteId: activeGauge?.usgsSiteId ?? null,
    lat: activeGauge?.coordinates.lat ?? null,
    lon: activeGauge?.coordinates.lng ?? null,
    trendUnit: activeThreshold?.thresholdUnit || 'ft',
    stageThresholds,
  });

  const latestValue = effectiveUnit === 'cfs' ? activeGauge?.dischargeCfs : activeGauge?.gaugeHeightFt;

  // Compute condition for active gauge
  const condition = useMemo(() => {
    if (!activeGauge || !activeThreshold) {
      return { code: 'unknown' as ConditionCode, label: 'Unknown', tailwindColor: 'bg-neutral-400' };
    }
    const thresholds: ConditionThresholds = {
      levelTooLow: activeThreshold.levelTooLow,
      levelLow: activeThreshold.levelLow,
      levelOptimalMin: activeThreshold.levelOptimalMin,
      levelOptimalMax: activeThreshold.levelOptimalMax,
      levelHigh: activeThreshold.levelHigh,
      levelDangerous: activeThreshold.levelDangerous,
      thresholdUnit: activeThreshold.thresholdUnit,
    };
    const result = computeCondition(activeGauge.gaugeHeightFt, thresholds, activeGauge.dischargeCfs);
    return {
      code: result.code,
      label: getConditionShortLabel(result.code),
      tailwindColor: getConditionTailwindColor(result.code),
    };
  }, [activeGauge, activeThreshold]);

  const eddyTakeSummary = useMemo(
    () => buildEddyTakeSummary(outlook, condition.code),
    [outlook, condition.code],
  );

  // Reading age
  const ageText = useMemo(() => {
    if (activeGauge?.readingAgeHours == null) return null;
    if (activeGauge.readingAgeHours < 1) {
      const mins = Math.round(activeGauge.readingAgeHours * 60);
      return mins < 2 ? 'Just now' : `${mins}m ago`;
    }
    if (activeGauge.readingAgeHours < 24) return `${Math.round(activeGauge.readingAgeHours)}h ago`;
    return `${Math.round(activeGauge.readingAgeHours / 24)}d ago`;
  }, [activeGauge]);

  // Share handler
  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/rivers/${riverSlug}`;
    const isMobile = window.matchMedia('(pointer: coarse)').matches;
    if (isMobile && navigator.share) {
      try { await navigator.share({ url: shareUrl }); return; } catch { /* cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setShareStatus('copied');
      setTimeout(() => setShareStatus('idle'), 2000);
    } catch { /* clipboard failed */ }
  };

  // Eddy Says — pinned to primary gauge condition so it doesn't change
  // when user switches between gauge tabs. The AI update is river-level,
  // not per-gauge, so it should always reflect the primary gauge.
  const primaryGauge = riverGroup?.primaryGauge;
  const primaryThreshold = useMemo(() => {
    if (!primaryGauge || !riverGroup) return null;
    return primaryGauge.thresholds?.find(t => t.riverId === riverGroup.riverId) ||
      primaryGauge.thresholds?.find(t => t.isPrimary) ||
      primaryGauge.thresholds?.[0] || null;
  }, [primaryGauge, riverGroup]);

  const primaryCondition = useMemo(() => {
    if (!primaryGauge || !primaryThreshold) {
      return { code: 'unknown' as ConditionCode, label: 'Unknown' };
    }
    const thresholds: ConditionThresholds = {
      levelTooLow: primaryThreshold.levelTooLow,
      levelLow: primaryThreshold.levelLow,
      levelOptimalMin: primaryThreshold.levelOptimalMin,
      levelOptimalMax: primaryThreshold.levelOptimalMax,
      levelHigh: primaryThreshold.levelHigh,
      levelDangerous: primaryThreshold.levelDangerous,
      thresholdUnit: primaryThreshold.thresholdUnit,
    };
    const result = computeCondition(primaryGauge.gaugeHeightFt, thresholds, primaryGauge.dischargeCfs);
    return { code: result.code, label: getConditionShortLabel(result.code) };
  }, [primaryGauge, primaryThreshold]);

  // When on a secondary tab, surface the per-gauge Haiku update; otherwise
  // pin to the primary's Sonnet update. The shared shape lets the existing
  // render block stay identical regardless of source.
  const onSecondaryTabWithUpdate = !isOnPrimaryTab;
  const activeEddyUpdate = onSecondaryTabWithUpdate
    ? (gaugeUpdate
        ? {
            quoteText: gaugeUpdate.quoteText,
            summaryText: gaugeUpdate.summaryText,
            generatedAt: gaugeUpdate.generatedAt,
          }
        : null)
    : eddyUpdate;
  const activeEddyLoading = onSecondaryTabWithUpdate ? gaugeUpdateLoading : eddyLoading;

  // Static fallback text \u2014 shared with the river report card (RiverCard) via
  // buildStaticEddyText so the quote reads identically across both surfaces.
  const buildStaticText = () => {
    const sourceGauge = onSecondaryTabWithUpdate ? activeGauge : primaryGauge;
    const sourceThreshold = onSecondaryTabWithUpdate ? activeThreshold : primaryThreshold;
    const sourceCode = onSecondaryTabWithUpdate ? condition.code : primaryCondition.code;
    return buildStaticEddyText({
      conditionCode: sourceCode,
      gaugeHeightFt: sourceGauge?.gaugeHeightFt ?? null,
      dischargeCfs: sourceGauge?.dischargeCfs ?? null,
      optimalMin: sourceThreshold?.levelOptimalMin,
      optimalMax: sourceThreshold?.levelOptimalMax,
      thresholdUnit: sourceThreshold?.thresholdUnit,
      riverNote: RIVER_NOTES[riverSlug] ?? null,
    });
  };

  const eddyFullReportText = activeEddyUpdate?.quoteText || buildStaticText();
  const eddySourceGaugeName = (onSecondaryTabWithUpdate ? activeGauge : primaryGauge)?.name ?? null;

  // Tab data for GaugeTabBar
  const tabs = useMemo(() => {
    if (!riverGroup) return [];
    const primarySiteId = riverGroup.primaryGauge.usgsSiteId;
    return riverGroup.allGauges
      .map(g => ({
        siteId: g.usgsSiteId,
        name: g.name,
        isPrimaryForRiver: g.usgsSiteId === primarySiteId,
      }))
      .sort((a, b) => {
        if (a.isPrimaryForRiver) return -1;
        if (b.isPrimaryForRiver) return 1;
        return a.name.localeCompare(b.name);
      });
  }, [riverGroup]);

  // Show unit toggle when the gauge reports both ft and cfs data
  // (alt thresholds are a bonus — threshold lines just won't draw in the alt unit if missing)
  const canToggleUnit = activeGauge?.gaugeHeightFt != null && activeGauge?.dischargeCfs != null;

  // Loading state
  if (isLoading) {
    return (
      <section className="animate-pulse space-y-6">
        <div className="h-7 w-48 bg-neutral-200 rounded" />
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6">
          <div className="h-64 bg-neutral-200 rounded-xl" />
          <div className="space-y-4">
            <div className="h-36 bg-neutral-200 rounded-xl" />
            <div className="h-24 bg-neutral-200 rounded-xl" />
          </div>
        </div>
      </section>
    );
  }

  if (!riverGroup || !activeGauge) {
    return (
      <section className="bg-white border border-neutral-200 rounded-xl p-6 text-center">
        <p className="text-sm text-neutral-600">
          Live gauge data isn&apos;t available for this river right now.
        </p>
      </section>
    );
  }

  return (
    <div>
        {/* Gauge picker first — switching gauges re-points the verdict, chart,
            and thresholds below, so no separate per-gauge condition list. */}
        {tabs.length > 1 && (
          <div className="mb-3">
            <GaugeTabBar
              gauges={tabs}
              activeSiteId={activeSiteId || ''}
              onTabChange={setActiveSiteId}
            />
          </div>
        )}

        {/* Selected-gauge meta — identity + freshness only. Condition and
            reading live on the reading card (which also carries the trend);
            Share sits in the hero, Add Photo in the photo gallery. */}
        <div className="text-sm text-neutral-500 mb-5 sm:mb-6 min-w-0">
          <span className="font-medium text-neutral-600">{activeGauge.name}</span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-neutral-500 mt-0.5">
            <a
              href={`https://waterdata.usgs.gov/monitoring-location/${activeGauge.usgsSiteId}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 hover:text-primary-700 font-mono inline-flex items-center gap-1"
            >
              USGS {activeGauge.usgsSiteId}
              <ExternalLink className="w-3 h-3" />
            </a>
            {ageText && (
              <>
                <span className="text-neutral-300">&middot;</span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {ageText}
                </span>
              </>
            )}
          </span>
        </div>

        {/* Now, next, and interpretation share one decision surface. Their data
            roles stay distinct; the outer shell removes card fragmentation. */}
        <div className="space-y-6">
        <section
          className="overflow-hidden rounded-xl border border-t-4 border-neutral-200 bg-primary-50"
          style={{
            borderTopColor: condition.code === 'flowing'
              ? 'var(--cond-flowing-solid)'
              : (CONDITION_COLORS[condition.code] ?? CONDITION_COLORS.unknown),
          }}
          aria-label="Current reading and 72-hour river outlook"
        >
          <div className="grid grid-cols-1 items-stretch lg:grid-cols-[340px_minmax(0,1fr)]">
            <CurrentReadingCard
              key={`reading-${activeSiteId}`}
              siteId={activeGauge.usgsSiteId}
              gaugeHeightFt={activeGauge.gaugeHeightFt}
              dischargeCfs={activeGauge.dischargeCfs}
              thresholdUnit={activeThreshold?.thresholdUnit || 'ft'}
              conditionCode={condition.code}
              readingAgeHours={activeGauge.readingAgeHours}
              className="h-full"
              embedded
            />
            <div className="border-t border-neutral-200 lg:border-l lg:border-t-0">
              <WillItHold
                key={`outlook-${activeSiteId}`}
                outlook={outlook}
                embedded
                showSummary={false}
              />
            </div>
          </div>

          <EddyOutlookFooter
            riverSlug={riverSlug}
            conditionCode={condition.code}
            outlookSummary={eddyTakeSummary}
            isGuidance={outlook.isGuidance}
            fullReportText={eddyFullReportText}
            fullReportLoading={activeEddyLoading && !activeEddyUpdate}
            generatedAt={activeEddyUpdate?.generatedAt}
            gaugeName={eddySourceGaugeName}
            isOpen={isEddyReportOpen}
            onToggle={() => setIsEddyReportOpen((open) => !open)}
            shareStatus={shareStatus}
            onShare={handleShare}
          />
        </section>

        {/* Condition Thresholds Table */}
        {activeThreshold && (
          <div>
            <ThresholdTable
              thresholdUnit={activeThreshold.thresholdUnit}
              levelTooLow={activeThreshold.levelTooLow}
              levelLow={activeThreshold.levelLow}
              levelOptimalMin={activeThreshold.levelOptimalMin}
              levelOptimalMax={activeThreshold.levelOptimalMax}
              levelHigh={activeThreshold.levelHigh}
              levelDangerous={activeThreshold.levelDangerous}
              altThresholds={altThresholds}
              altUnit={altUnit}
              thresholdDescriptions={activeGauge.thresholdDescriptions}
              currentCondition={condition.code}
              gaugeHeightFt={activeGauge.gaugeHeightFt}
              dischargeCfs={activeGauge.dischargeCfs}
            />
          </div>
        )}

        {/* Show the current visual condition before asking floaters to parse the
            longer historical trend. */}
        <div>
          <RiverVisualGallery riverSlug={riverSlug} addPhotoHref={addPhotoHref} layout="wide" />
        </div>

        {/* Historical trend deep dive. */}
          <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
            <div className="flex flex-col gap-3 px-5 pt-4 pb-0 sm:flex-row sm:items-center sm:justify-between">
              <h2 className="text-base font-bold text-neutral-900 whitespace-nowrap">
                {dateRange}-Day {effectiveUnit === 'ft' ? 'Stage' : 'Flow'} Trend
              </h2>
              <div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-end">
                <InfoTip
                  title={CFS_EXPLAINER.title}
                  body={CFS_EXPLAINER.body}
                  ariaLabel="What is CFS?"
                  colors={{
                    trigger: '#857D70',
                    triggerBorder: '#C2BAAC',
                    popBg: '#FFFFFF',
                    popBorder: '#DBD5CA',
                    title: '#2D2A24',
                    body: '#524D43',
                    focus: '#2D7889',
                  }}
                />
                {/* Unit toggle — show when gauge reports both ft and cfs */}
                {canToggleUnit && (
                  <div className="flex rounded-lg border border-neutral-300 overflow-hidden">
                    <button
                      onClick={() => handleUnitToggle('ft')}
                      aria-pressed={effectiveUnit === 'ft'}
                      title="Gauge height in feet"
                      className={`px-3 py-1 text-xs font-semibold transition-colors ${
                        effectiveUnit === 'ft'
                          ? 'bg-primary-500 text-white'
                          : 'bg-white text-neutral-600 hover:bg-neutral-50'
                      }`}
                    >
                      ft
                    </button>
                    <button
                      onClick={() => handleUnitToggle('cfs')}
                      aria-pressed={effectiveUnit === 'cfs'}
                      title="Flow in cubic feet per second"
                      className={`px-3 py-1 text-xs font-semibold transition-colors ${
                        effectiveUnit === 'cfs'
                          ? 'bg-primary-500 text-white'
                          : 'bg-white text-neutral-600 hover:bg-neutral-50'
                      }`}
                    >
                      cfs
                    </button>
                  </div>
                )}
                {/* Date range toggle */}
                <div className="flex rounded-lg border border-neutral-300 overflow-hidden">
                  {[{ days: 7, label: '7D' }, { days: 14, label: '14D' }, { days: 30, label: '30D' }].map((opt) => (
                    <button
                      key={opt.days}
                      onClick={() => setDateRange(opt.days)}
                      aria-pressed={dateRange === opt.days}
                      className={`px-3 py-1 text-xs font-semibold transition-colors ${
                        dateRange === opt.days
                          ? 'bg-primary-500 text-white'
                          : 'bg-white text-neutral-600 hover:bg-neutral-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <FlowTrendChart
              key={`${activeSiteId}-${effectiveUnit}`}
              gaugeSiteId={activeGauge.usgsSiteId}
              days={dateRange}
              thresholds={chartThresholds}
              latestValue={latestValue}
              displayUnit={effectiveUnit}
              chartClassName="h-48 md:h-56"
            />
          </div>

        </div>

    </div>
  );
}
