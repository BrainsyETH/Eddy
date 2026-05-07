'use client';

// src/components/gauge/RiverGaugeDetail.tsx
// Full-page river gauge detail view with tab switching between gauges

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, Clock, Share2, Check, ChevronDown, ChevronUp, Camera } from 'lucide-react';

import { computeCondition, getConditionShortLabel, getConditionTailwindColor, type ConditionThresholds } from '@/lib/conditions';
import { TEXT_BY_CONDITION, LABEL_BY_CONDITION, getEddyImageForCondition } from '@/constants';
import { CONDITION_CARD_BLURBS } from '@/data/eddy-quotes';
import type { ConditionCode } from '@/types/api';
import type { EddyUpdateResponse } from '@/app/api/eddy-update/[riverSlug]/route';
import { useRiverGroup } from '@/hooks/useRiverGroups';
import { useGaugeHistoryPrefetch } from '@/hooks/useGaugeHistory';
import FlowTrendChart from '@/components/ui/FlowTrendChart';
import GaugeWeather from '@/components/ui/GaugeWeather';
import CurrentReadingCard from '@/components/gauge/CurrentReadingCard';
import ThresholdTable from '@/components/gauge/ThresholdTable';
import GaugeTabBar from '@/components/gauge/GaugeTabBar';
import SiteFooter from '@/components/ui/SiteFooter';

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

  // Eddy AI update
  const [eddyUpdate, setEddyUpdate] = useState<EddyUpdateResponse['update'] | null>(null);
  const [eddyLoading, setEddyLoading] = useState(false);
  const [eddyShowFull, setEddyShowFull] = useState(false);

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

  // Reading age
  const ageText = useMemo(() => {
    if (!activeGauge?.readingAgeHours) return null;
    if (activeGauge.readingAgeHours < 1) {
      const mins = Math.round(activeGauge.readingAgeHours * 60);
      return mins < 2 ? 'Just now' : `${mins}m ago`;
    }
    if (activeGauge.readingAgeHours < 24) return `${Math.round(activeGauge.readingAgeHours)}h ago`;
    return `${Math.round(activeGauge.readingAgeHours / 24)}d ago`;
  }, [activeGauge]);

  // Share handler
  const handleShare = async () => {
    const shareUrl = `${window.location.origin}/gauges/${riverSlug}`;
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

  const eddyConditionCode = primaryCondition.code;
  const textClass = TEXT_BY_CONDITION[eddyConditionCode] ?? TEXT_BY_CONDITION.unknown;
  const labelInfo = LABEL_BY_CONDITION[eddyConditionCode] ?? LABEL_BY_CONDITION.unknown;

  const buildStaticText = () => {
    const blurb = CONDITION_CARD_BLURBS[primaryCondition.code] || CONDITION_CARD_BLURBS.unknown;
    const parts: string[] = [];
    if (primaryGauge?.gaugeHeightFt !== null && primaryGauge?.gaugeHeightFt !== undefined) {
      parts.push(`Reading ${primaryGauge.gaugeHeightFt.toFixed(1)} ft at ${primaryGauge.name}.`);
    }
    parts.push(blurb);
    const optMin = primaryThreshold?.levelOptimalMin;
    const optMax = primaryThreshold?.levelOptimalMax;
    const unit = primaryThreshold?.thresholdUnit === 'cfs' ? 'cfs' : 'ft';
    if (optMin != null && optMax != null) {
      parts.push(`Optimal range is ${optMin}\u2013${optMax} ${unit}.`);
    }
    return parts.join(' ');
  };

  const eddyDisplayText = eddyUpdate?.summaryText && !eddyShowFull
    ? eddyUpdate.summaryText
    : eddyUpdate ? eddyUpdate.quoteText : buildStaticText();

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
      <div className="min-h-screen bg-neutral-50">
        <div className="max-w-5xl mx-auto px-4 py-8">
          <div className="animate-pulse space-y-6">
            <div className="h-6 w-32 bg-neutral-200 rounded" />
            <div className="h-10 w-72 bg-neutral-200 rounded" />
            <div className="h-5 w-96 bg-neutral-200 rounded" />
            <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6 mt-8">
              <div className="h-64 bg-neutral-200 rounded-xl" />
              <div className="space-y-4">
                <div className="h-36 bg-neutral-200 rounded-xl" />
                <div className="h-24 bg-neutral-200 rounded-xl" />
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!riverGroup || !activeGauge) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-neutral-900 mb-2">River Not Found</h1>
          <p className="text-neutral-600 mb-4">Could not find river &ldquo;{riverSlug}&rdquo;.</p>
          <Link href="/gauges" className="text-primary-600 hover:text-primary-700 font-medium">
            &larr; Back to all rivers
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <div className="max-w-5xl mx-auto px-4 py-6 md:py-8">
        {/* Back link */}
        <Link
          href="/gauges"
          className="inline-flex items-center gap-1.5 text-sm text-neutral-500 hover:text-neutral-700 transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          All Rivers
        </Link>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-sm text-neutral-500">
              {riverGroup.allGauges.length} gauge{riverGroup.allGauges.length !== 1 ? 's' : ''}
            </span>
          </div>

          <h1 className="text-3xl md:text-4xl font-bold text-neutral-900 mb-1" style={{ fontFamily: 'var(--font-display)' }}>
            {riverGroup.riverName}
          </h1>

          <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-500">
            <span>{activeGauge.name}</span>
            <span className="text-neutral-300">&middot;</span>
            <a
              href={`https://waterdata.usgs.gov/monitoring-location/${activeGauge.usgsSiteId}/`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-primary-600 hover:text-primary-700 font-mono flex items-center gap-1"
            >
              USGS {activeGauge.usgsSiteId}
              <ExternalLink className="w-3 h-3" />
            </a>
            {ageText && (
              <>
                <span className="text-neutral-300">&middot;</span>
                <span className="flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {ageText}
                </span>
              </>
            )}
            <div className="flex items-center gap-3 ml-auto">
              <Link
                href={`/plan?river=${riverSlug}&submitPhoto=true`}
                className="flex items-center gap-1 text-neutral-400 hover:text-teal-600 transition-colors"
              >
                <Camera className="w-3.5 h-3.5" />
                Add Photo
              </Link>
              <button
                onClick={handleShare}
                className={`flex items-center gap-1 transition-colors ${
                  shareStatus === 'copied'
                    ? 'text-emerald-600'
                    : 'text-neutral-500 hover:text-primary-600'
                }`}
              >
                {shareStatus === 'copied' ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
                {shareStatus === 'copied' ? 'Copied!' : 'Share'}
              </button>
            </div>
          </div>
        </div>

        {/* Gauge Tab Bar */}
        {tabs.length > 1 && (
          <div className="mb-6">
            <GaugeTabBar
              gauges={tabs}
              activeSiteId={activeSiteId || ''}
              onTabChange={setActiveSiteId}
            />
          </div>
        )}

        {/* Chart + Reading Row */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 mb-8">
          {/* Chart */}
          <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between px-5 pt-4 pb-0">
              <h2 className="text-base font-bold text-neutral-900">
                {dateRange}-Day {effectiveUnit === 'ft' ? 'Stage' : 'Flow'} Trend
              </h2>
              <div className="flex gap-2">
                {/* Unit toggle — show when gauge reports both ft and cfs */}
                {canToggleUnit && (
                  <div className="flex rounded-lg border border-neutral-300 overflow-hidden">
                    <button
                      onClick={() => handleUnitToggle('ft')}
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

          {/* Right column: Current Reading + Weather */}
          <div className="flex flex-col gap-4">
            <CurrentReadingCard
              key={`reading-${activeSiteId}`}
              siteId={activeGauge.usgsSiteId}
              gaugeHeightFt={activeGauge.gaugeHeightFt}
              dischargeCfs={activeGauge.dischargeCfs}
              thresholdUnit={activeThreshold?.thresholdUnit || 'ft'}
              conditionCode={condition.code}
            />
            <GaugeWeather
              key={`weather-${activeSiteId}`}
              lat={activeGauge.coordinates.lat}
              lon={activeGauge.coordinates.lng}
              enabled={true}
              variant="compact"
            />
          </div>
        </div>

        {/* Eddy Says Section */}
        <div className="bg-white border border-neutral-200 rounded-xl overflow-hidden mb-8">
          <div className="px-4 py-4 sm:px-6 sm:py-5">
            {/* Header row: avatar + label + badge + timestamp */}
            <div className="flex items-start gap-4">
              <div className="flex-shrink-0 w-14 h-14 sm:w-16 sm:h-16 relative">
                <Image
                  src={getEddyImageForCondition(eddyConditionCode)}
                  alt="Eddy the Otter"
                  fill
                  className="object-contain"
                  sizes="64px"
                />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 mb-1.5">
                  <span className="text-sm font-bold tracking-wide uppercase text-neutral-500">Eddy Says&hellip;</span>
                  <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${labelInfo.className}`}>
                    {labelInfo.text}
                  </span>
                  {eddyUpdate?.generatedAt && (
                    <span className="text-[10px] text-neutral-400">
                      &middot; {(() => {
                        const diffMs = Date.now() - new Date(eddyUpdate.generatedAt).getTime();
                        const mins = Math.floor(diffMs / 60000);
                        if (mins < 1) return 'Updated just now';
                        if (mins < 60) return `Updated ${mins}m ago`;
                        const hours = Math.floor(mins / 60);
                        if (hours < 2) return 'Updated 1 hr ago';
                        if (hours < 24) return `Updated ${hours} hrs ago`;
                        return `Updated ${Math.floor(hours / 24)}d ago`;
                      })()}
                    </span>
                  )}
                  {primaryGauge && (
                    <span className="text-[10px] text-neutral-400 ml-auto hidden sm:inline">
                      via {primaryGauge.name}
                    </span>
                  )}
                </div>

                {/* Summary + full narrative (expanded by default) */}
                {eddyLoading && !eddyUpdate ? (
                  <p className="text-sm text-neutral-500 italic">Loading Eddy&apos;s take...</p>
                ) : eddyUpdate?.summaryText ? (
                  <>
                    <div className={`rounded-lg px-3.5 py-2.5 mt-1 ${
                      eddyConditionCode === 'flowing' ? 'bg-emerald-200/50' :
                      eddyConditionCode === 'good' ? 'bg-lime-200/50' :
                      eddyConditionCode === 'low' ? 'bg-amber-200/50' :
                      eddyConditionCode === 'too_low' ? 'bg-stone-300/40' :
                      eddyConditionCode === 'high' ? 'bg-orange-200/50' :
                      eddyConditionCode === 'dangerous' ? 'bg-red-200/50' :
                      'bg-neutral-200/50'
                    }`}>
                      <p className={`text-sm sm:text-base leading-relaxed font-semibold ${textClass}`}>
                        &ldquo;{eddyUpdate.summaryText}&rdquo;
                      </p>
                    </div>

                    {/* Full narrative (shown by default, collapsible) */}
                    {!eddyShowFull && (
                      <p className="text-sm leading-relaxed font-medium mt-3 text-neutral-700">
                        &ldquo;{eddyUpdate.quoteText}&rdquo;
                      </p>
                    )}

                    <button
                      onClick={() => setEddyShowFull(!eddyShowFull)}
                      className="flex items-center gap-1 text-xs font-semibold transition-colors mt-2 text-neutral-500 hover:text-neutral-700"
                    >
                      {eddyShowFull ? (
                        <>Show full report <ChevronDown className="w-3 h-3" /></>
                      ) : (
                        <>Show less <ChevronUp className="w-3 h-3" /></>
                      )}
                    </button>
                  </>
                ) : (
                  <p className="text-sm sm:text-base leading-relaxed font-medium text-neutral-700">
                    &ldquo;{eddyDisplayText}&rdquo;
                  </p>
                )}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap items-center gap-2 mt-4 ml-0 sm:ml-[72px] sm:mt-3">
              <Link
                href={`/plan?river=${riverSlug}`}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#163F4A] text-white text-xs font-semibold rounded-md hover:bg-[#1A4A57] transition-colors shadow-[2px_2px_0_#0F2D35]"
              >
                Plan a Trip
              </Link>
              <button
                onClick={handleShare}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-white text-neutral-800 text-xs font-semibold rounded-md hover:bg-neutral-50 transition-colors border border-neutral-300 shadow-[2px_2px_0_#C2BAAC]"
              >
                {shareStatus === 'copied' ? <Check className="w-3.5 h-3.5" /> : <Share2 className="w-3.5 h-3.5" />}
                {shareStatus === 'copied' ? 'Copied!' : 'Share Report'}
              </button>
            </div>
          </div>
        </div>

        {/* Condition Thresholds Table */}
        {activeThreshold && (
          <div className="mb-8">
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
      </div>

      {/* Cross-link: Plan a float */}
      <div className="max-w-5xl mx-auto px-4 mt-8">
        <div className="bg-primary-50 border border-primary-200 rounded-xl p-5 flex items-center justify-between gap-4">
          <div>
            <p className="font-bold text-neutral-900 text-sm">Ready to float?</p>
            <p className="text-xs text-neutral-600 mt-0.5">Plan a trip on the {riverGroup.riverName} with live conditions and access points.</p>
          </div>
          <Link
            href={`/plan?river=${riverSlug}`}
            className="flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold text-white no-underline transition-colors hover:brightness-110"
            style={{ backgroundColor: '#F07052' }}
          >
            Plan Your Float
          </Link>
        </div>
      </div>

      <SiteFooter maxWidth="max-w-5xl" className="mt-8" />
    </div>
  );
}
