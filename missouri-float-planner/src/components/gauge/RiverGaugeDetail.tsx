'use client';

// src/components/gauge/RiverGaugeDetail.tsx
// Full-page river gauge detail view with tab switching between gauges

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { ArrowLeft, ExternalLink, Clock, Share2, Check, ChevronDown, ChevronUp } from 'lucide-react';

import { computeCondition, getConditionShortLabel, getConditionTailwindColor, type ConditionThresholds } from '@/lib/conditions';
import { BG_BY_CONDITION, TEXT_BY_CONDITION, LABEL_BY_CONDITION, getEddyImageForCondition } from '@/constants';
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
  const [dateRange, setDateRange] = useState(7);
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
      prefetchHistory(siteIds, 7);
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

  // Eddy Says
  const eddyConditionCode = (eddyUpdate?.conditionCode as ConditionCode) || condition.code;
  const bgClass = BG_BY_CONDITION[eddyConditionCode] ?? BG_BY_CONDITION.unknown;
  const textClass = TEXT_BY_CONDITION[eddyConditionCode] ?? TEXT_BY_CONDITION.unknown;
  const labelInfo = LABEL_BY_CONDITION[eddyConditionCode] ?? LABEL_BY_CONDITION.unknown;

  const buildStaticText = () => {
    const blurb = CONDITION_CARD_BLURBS[condition.code] || CONDITION_CARD_BLURBS.unknown;
    const parts: string[] = [];
    if (activeGauge?.gaugeHeightFt !== null && activeGauge?.gaugeHeightFt !== undefined) {
      parts.push(`Reading ${activeGauge.gaugeHeightFt.toFixed(1)} ft at ${activeGauge.name}.`);
    }
    parts.push(blurb);
    const optMin = activeThreshold?.levelOptimalMin;
    const optMax = activeThreshold?.levelOptimalMax;
    const unit = activeThreshold?.thresholdUnit === 'cfs' ? 'cfs' : 'ft';
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
    return riverGroup.allGauges.map(g => ({
      siteId: g.usgsSiteId,
      name: g.name,
      isPrimaryForRiver: g.usgsSiteId === riverGroup.primaryGauge.usgsSiteId,
    }));
  }, [riverGroup]);

  // Check if alt thresholds have data (for showing unit toggle on chart)
  const hasAltThresholds = altThresholds !== null;

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
            <span className={`px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-sm ${condition.tailwindColor}`}>
              {condition.label}
            </span>
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
            <button
              onClick={handleShare}
              className={`flex items-center gap-1 transition-colors ml-auto ${
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
                {/* Unit toggle */}
                {hasAltThresholds && (
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
                  {[{ days: 7, label: '7D' }, { days: 30, label: '30D' }].map((opt) => (
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
        <div className={`border rounded-xl overflow-hidden mb-8 ${bgClass}`}>
          <div className="flex items-start gap-4 px-4 py-4 sm:px-6 sm:py-5">
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
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-sm font-bold tracking-wide uppercase opacity-60">Eddy Says&hellip;</span>
                <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${labelInfo.className}`}>
                  {labelInfo.text}
                </span>
              </div>

              {eddyLoading && !eddyUpdate ? (
                <p className="text-sm text-neutral-500 italic">Loading Eddy&apos;s take...</p>
              ) : (
                <p className={`text-sm sm:text-base leading-relaxed font-medium ${textClass}`}>
                  &ldquo;{eddyDisplayText}&rdquo;
                </p>
              )}

              {eddyUpdate?.summaryText && (
                <button
                  onClick={() => setEddyShowFull(!eddyShowFull)}
                  className={`flex items-center gap-1 text-xs font-semibold transition-colors mt-1.5 ${textClass} opacity-60 hover:opacity-100`}
                >
                  {eddyShowFull ? (
                    <>Show less <ChevronUp className="w-3 h-3" /></>
                  ) : (
                    <>Read more <ChevronDown className="w-3 h-3" /></>
                  )}
                </button>
              )}
            </div>

            {/* Plan Trip CTA */}
            <Link
              href={`/rivers/${riverSlug}`}
              className="flex-shrink-0 self-center px-5 py-2.5 bg-[#163F4A] text-white text-sm font-semibold rounded-lg hover:bg-[#1A4A57] transition-colors shadow-sm"
            >
              Plan Trip
            </Link>
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
            />
          </div>
        )}
      </div>

      <SiteFooter maxWidth="max-w-5xl" className="mt-8" />
    </div>
  );
}
