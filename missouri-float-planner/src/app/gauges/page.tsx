'use client';

// src/app/gauges/page.tsx
// Dashboard-style gauge stations page with filters and cards linking to detail pages

import React, { useEffect, useState, useMemo } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  ChevronDown,
  ChevronUp,
  Droplets,
  Clock,
  X,
  Share2,
  Check,
  Layers,
  Search,
  ArrowRight,
} from 'lucide-react';

import { computeCondition, getConditionTailwindColor, getConditionShortLabel, type ConditionThresholds } from '@/lib/conditions';
import type { GaugesResponse, GaugeStation } from '@/app/api/gauges/route';
import type { ConditionCode } from '@/types/api';
import SiteFooter from '@/components/ui/SiteFooter';
import { useGaugeHistoryPrefetch } from '@/hooks/useGaugeHistory';
import type { EddyUpdateResponse } from '@/app/api/eddy-update/[riverSlug]/route';
import { RIVER_NOTES, CONDITION_CARD_BLURBS } from '@/data/eddy-quotes';
import { EDDY_IMAGES, getEddyImageForCondition, BG_BY_CONDITION, TEXT_BY_CONDITION, LABEL_BY_CONDITION } from '@/constants';

// Pill background color for active condition filter
const getComputedPillColor = (code: ConditionCode): string => {
  switch (code) {
    case 'too_low': return '#737373';
    case 'low': return '#eab308';
    case 'okay': return '#84cc16';
    case 'optimal': return '#10b981';
    case 'high': return '#f97316';
    case 'dangerous': return '#ef4444';
    default: return '#737373';
  }
};

// Eddy Says card for grouped river view
function GroupEddyBlurb({
  riverSlug,
  conditionCode,
  gauges,
  eddyCache,
  setEddyCache,
}: {
  riverSlug: string | null;
  conditionCode: ConditionCode;
  gauges: { name: string; gaugeHeightFt: number | null; primaryRiver?: { levelOptimalMin: number | null; levelOptimalMax: number | null; thresholdUnit: string; isPrimary: boolean } | null }[];
  eddyCache: Record<string, EddyUpdateResponse['update'] | null>;
  setEddyCache: React.Dispatch<React.SetStateAction<Record<string, EddyUpdateResponse['update'] | null>>>;
}) {
  const [localLoading, setLocalLoading] = useState(false);
  const [showFull, setShowFull] = useState(false);

  useEffect(() => {
    if (!riverSlug || riverSlug in eddyCache) return;
    let cancelled = false;
    setLocalLoading(true);

    async function fetchEddy() {
      try {
        const res = await fetch(`/api/eddy-update/${riverSlug}`);
        if (!res.ok) return;
        const data: EddyUpdateResponse = await res.json();
        if (!cancelled) {
          setEddyCache(prev => ({ ...prev, [riverSlug!]: data.available ? data.update : null }));
        }
      } catch {
        if (!cancelled) {
          setEddyCache(prev => ({ ...prev, [riverSlug!]: null }));
        }
      } finally {
        if (!cancelled) setLocalLoading(false);
      }
    }
    fetchEddy();
    return () => { cancelled = true; };
  }, [riverSlug, eddyCache, setEddyCache]);

  const update = riverSlug ? eddyCache[riverSlug] ?? null : null;

  const buildStaticText = () => {
    const primary = gauges.find(g => g.primaryRiver?.isPrimary) || gauges[0];
    const blurb = CONDITION_CARD_BLURBS[conditionCode] || CONDITION_CARD_BLURBS.unknown;
    const pr = primary?.primaryRiver;
    const optMin = pr?.levelOptimalMin;
    const optMax = pr?.levelOptimalMax;
    const unit = pr?.thresholdUnit === 'cfs' ? 'cfs' : 'ft';
    const optRange = (optMin != null && optMax != null) ? `${optMin}\u2013${optMax} ${unit}` : null;
    const notes = riverSlug ? RIVER_NOTES[riverSlug] : null;
    const parts: string[] = [];
    if (primary?.gaugeHeightFt !== null && primary?.gaugeHeightFt !== undefined) {
      parts.push(`Reading ${primary.gaugeHeightFt.toFixed(1)} ft at the ${primary.name || 'primary gauge'}.`);
    }
    parts.push(blurb);
    if (optRange) parts.push(`Optimal range is ${optRange}.`);
    if (notes) parts.push(notes);
    return parts.join(' ');
  };

  const displayConditionCode = update?.conditionCode ? (update.conditionCode as ConditionCode) : conditionCode;
  const bgClass = BG_BY_CONDITION[displayConditionCode] ?? BG_BY_CONDITION.unknown;
  const textClass = TEXT_BY_CONDITION[displayConditionCode] ?? TEXT_BY_CONDITION.unknown;
  const label = LABEL_BY_CONDITION[displayConditionCode] ?? LABEL_BY_CONDITION.unknown;
  const displayText = update?.summaryText && !showFull ? update.summaryText : (update ? update.quoteText : buildStaticText());

  return (
    <div className="mb-3">
      <div className={`border rounded-xl overflow-hidden ${bgClass}`}>
        <div className="flex items-start gap-3 px-3 py-3 sm:px-4 sm:py-4">
          <div className="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 relative">
            <Image
              src={getEddyImageForCondition(displayConditionCode)}
              alt="Eddy the Otter"
              fill
              className="object-contain"
              sizes="56px"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold tracking-wide uppercase opacity-60">Eddy says</span>
              <span className={`text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full ${label.className}`}>
                {label.text}
              </span>
            </div>
            {localLoading && !update ? (
              <p className="text-sm text-neutral-500 italic">Loading Eddy&apos;s take...</p>
            ) : (
              <p className={`text-sm sm:text-base leading-relaxed font-medium ${textClass}`}>
                &ldquo;{displayText}&rdquo;
              </p>
            )}
            {update?.summaryText && (
              <button
                onClick={() => setShowFull(!showFull)}
                className={`flex items-center gap-1 text-xs font-semibold transition-colors mt-1 ${textClass} opacity-60 hover:opacity-100`}
              >
                {showFull ? <>Show less <ChevronUp className="w-3 h-3" /></> : <>Read more <ChevronDown className="w-3 h-3" /></>}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}


export default function GaugesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [gaugeData, setGaugeData] = useState<GaugesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedRiver, setSelectedRiver] = useState<string>(searchParams.get('riverFilter') || 'all');
  const [selectedCondition, setSelectedCondition] = useState<ConditionCode | 'all'>((searchParams.get('condition') as ConditionCode) || 'all');
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [groupByRiver, setGroupByRiver] = useState(searchParams.get('group') !== 'flat');
  const [copiedGaugeId, setCopiedGaugeId] = useState<string | null>(null);
  const prefetchHistory = useGaugeHistoryPrefetch();

  // Eddy AI update cache
  const [eddyCache, setEddyCache] = useState<Record<string, EddyUpdateResponse['update'] | null>>({});

  // Persist filter state in URL
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    if (selectedRiver !== 'all') params.set('riverFilter', selectedRiver); else params.delete('riverFilter');
    if (selectedCondition !== 'all') params.set('condition', selectedCondition); else params.delete('condition');
    if (searchQuery) params.set('q', searchQuery); else params.delete('q');
    if (!groupByRiver) params.set('group', 'flat'); else params.delete('group');
    const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
    router.replace(newUrl, { scroll: false });
  }, [selectedRiver, selectedCondition, groupByRiver, searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  // Deep-link: ?gauge= redirects to detail page
  useEffect(() => {
    const gaugeParam = searchParams.get('gauge');
    if (gaugeParam) {
      router.replace(`/gauges/${gaugeParam}`);
    }
  }, [searchParams, router]);

  // Deep-link: ?river= resolves slug to river ID
  useEffect(() => {
    const riverSlug = searchParams.get('river');
    if (!riverSlug || !gaugeData?.gauges) return;

    async function resolveRiverSlug() {
      try {
        const res = await fetch('/api/rivers');
        if (!res.ok) return;
        const data = await res.json();
        const match = data.rivers?.find((r: { slug: string; id: string }) => r.slug === riverSlug);
        if (match) {
          setSelectedRiver(match.id);
          setSelectedCondition('all');
        }
      } catch { /* silently fail */ }
    }
    resolveRiverSlug();
  }, [searchParams, gaugeData]);

  useEffect(() => {
    async function fetchGauges() {
      try {
        const response = await fetch('/api/gauges');
        if (response.ok) {
          const data = await response.json();
          setGaugeData(data);
        }
      } catch (error) {
        console.error('Failed to fetch gauges:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchGauges();
  }, []);

  // Prefetch history for visible gauges
  useEffect(() => {
    if (!gaugeData?.gauges) return;
    const timeout = setTimeout(() => {
      const siteIds = gaugeData.gauges.slice(0, 9).map(g => g.usgsSiteId);
      prefetchHistory(siteIds, 7);
    }, 1000);
    return () => clearTimeout(timeout);
  }, [gaugeData, prefetchHistory]);

  // Helper to get condition
  const getCondition = (gauge: GaugeStation) => {
    const primaryRiver = gauge.thresholds?.find(t => t.isPrimary) || gauge.thresholds?.[0];
    if (!primaryRiver) {
      return { code: 'unknown' as ConditionCode, label: 'Unknown', tailwindColor: 'bg-neutral-400' };
    }
    const thresholdsForCompute: ConditionThresholds = {
      levelTooLow: primaryRiver.levelTooLow,
      levelLow: primaryRiver.levelLow,
      levelOptimalMin: primaryRiver.levelOptimalMin,
      levelOptimalMax: primaryRiver.levelOptimalMax,
      levelHigh: primaryRiver.levelHigh,
      levelDangerous: primaryRiver.levelDangerous,
      thresholdUnit: primaryRiver.thresholdUnit,
    };
    const result = computeCondition(gauge.gaugeHeightFt, thresholdsForCompute, gauge.dischargeCfs);
    return {
      code: result.code,
      label: getConditionShortLabel(result.code),
      tailwindColor: getConditionTailwindColor(result.code),
    };
  };

  // Get unique rivers for filter
  const rivers = useMemo(() => {
    if (!gaugeData?.gauges) return [];
    const riverMap = new Map<string, string>();
    gaugeData.gauges.forEach(gauge => {
      const primaryRiver = gauge.thresholds?.find(t => t.isPrimary) || gauge.thresholds?.[0];
      if (primaryRiver) {
        riverMap.set(primaryRiver.riverId, primaryRiver.riverName);
      }
    });
    return Array.from(riverMap.entries()).sort((a, b) => a[1].localeCompare(b[1]));
  }, [gaugeData]);

  // Filter and process gauges
  const processedGauges = useMemo(() => {
    if (!gaugeData?.gauges) return [];

    return gaugeData.gauges
      .filter(gauge => {
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          const nameMatch = gauge.name.toLowerCase().includes(q);
          const primaryRiver = gauge.thresholds?.find(t => t.isPrimary) || gauge.thresholds?.[0];
          const riverMatch = primaryRiver?.riverName?.toLowerCase().includes(q) || false;
          const siteIdMatch = gauge.usgsSiteId.includes(q);
          if (!nameMatch && !riverMatch && !siteIdMatch) return false;
        }
        if (selectedRiver !== 'all') {
          const hasRiver = gauge.thresholds?.some(t => t.riverId === selectedRiver);
          if (!hasRiver) return false;
        }
        if (selectedCondition !== 'all') {
          const condition = getCondition(gauge);
          if (condition.code !== selectedCondition) return false;
        }
        return true;
      })
      .map(gauge => ({
        ...gauge,
        condition: getCondition(gauge),
        primaryRiver: gauge.thresholds?.find(t => t.isPrimary) || gauge.thresholds?.[0],
      }))
      .sort((a, b) => {
        const conditionOrder: Record<ConditionCode, number> = {
          too_low: 0, low: 1, okay: 2, optimal: 3, high: 4, dangerous: 5, unknown: 6,
        };
        return conditionOrder[a.condition.code] - conditionOrder[b.condition.code];
      });
  }, [gaugeData, selectedRiver, selectedCondition, searchQuery]);

  // Stats for condition pills
  const stats = useMemo(() => {
    if (!gaugeData?.gauges) return { total: 0, optimal: 0, okay: 0, low: 0, tooLow: 0, high: 0, flood: 0 };
    const counts = { total: 0, optimal: 0, okay: 0, low: 0, high: 0, flood: 0, tooLow: 0 };
    gaugeData.gauges.forEach(gauge => {
      counts.total++;
      const condition = getCondition(gauge);
      switch (condition.code) {
        case 'optimal': counts.optimal++; break;
        case 'okay': counts.okay++; break;
        case 'low': counts.low++; break;
        case 'high': counts.high++; break;
        case 'dangerous': counts.flood++; break;
        case 'too_low': counts.tooLow++; break;
      }
    });
    return counts;
  }, [gaugeData]);

  const getAgeText = (gauge: GaugeStation) => {
    if (gauge.readingAgeHours === null) return null;
    if (gauge.readingAgeHours < 1) {
      const mins = Math.round(gauge.readingAgeHours * 60);
      return mins < 2 ? 'Just now' : `${mins}m ago`;
    }
    if (gauge.readingAgeHours < 24) return `${Math.round(gauge.readingAgeHours)}h ago`;
    return `${Math.round(gauge.readingAgeHours / 24)}d ago`;
  };

  const clearFilters = () => {
    setSelectedRiver('all');
    setSelectedCondition('all');
    setGroupByRiver(true);
    setSearchQuery('');
  };

  const hasActiveFilters = selectedRiver !== 'all' || selectedCondition !== 'all' || !groupByRiver || searchQuery !== '';

  // Share handler
  const handleShareGauge = async (e: React.MouseEvent, usgsSiteId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const shareUrl = `${window.location.origin}/gauges/${usgsSiteId}`;
    const isMobile = window.matchMedia('(pointer: coarse)').matches;
    if (isMobile && navigator.share) {
      try { await navigator.share({ url: shareUrl }); return; } catch { /* cancelled */ }
    }
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedGaugeId(usgsSiteId);
      setTimeout(() => setCopiedGaugeId(null), 2000);
    } catch {
      window.prompt('Copy this link:', shareUrl);
    }
  };

  // Render a gauge card — now links to detail page
  const renderGaugeCard = (gauge: typeof processedGauges[0]) => {
    const ageText = getAgeText(gauge);

    return (
      <Link
        key={gauge.id}
        href={`/gauges/${gauge.usgsSiteId}`}
        className="group bg-white rounded-xl border border-neutral-200 hover:border-primary-300 hover:shadow-md transition-all duration-200 overflow-hidden block"
      >
        <div className="p-4 sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex-1 min-w-0">
              {/* Condition badge + River */}
              <div className="flex items-center gap-2.5 mb-2">
                <span className={`px-2.5 py-1 rounded-md text-[11px] font-bold text-white ${gauge.condition.tailwindColor}`}>
                  {gauge.condition.label}
                </span>
                {!groupByRiver && (
                  <span className="text-xs text-neutral-500 truncate">
                    {gauge.primaryRiver?.riverName || 'Unknown River'}
                  </span>
                )}
              </div>

              {/* Gauge name */}
              <h3 className="text-base font-bold text-neutral-900 mb-1 group-hover:text-primary-700 transition-colors">
                {gauge.name}
              </h3>

              {/* Meta row */}
              <div className="flex items-center gap-2.5 text-xs text-neutral-500">
                <span className="font-mono">#{gauge.usgsSiteId}</span>
                {ageText && (
                  <>
                    <span className="text-neutral-300">·</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {ageText}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Reading value */}
            <div className="flex flex-col items-end text-right flex-shrink-0">
              {gauge.primaryRiver?.thresholdUnit === 'cfs' ? (
                <>
                  {gauge.dischargeCfs !== null && (
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl md:text-2xl font-bold text-neutral-900 tabular-nums">{gauge.dischargeCfs.toLocaleString()}</span>
                      <span className="text-xs font-medium text-neutral-500">cfs</span>
                    </div>
                  )}
                  {gauge.gaugeHeightFt !== null && (
                    <div className="text-xs text-neutral-500 mt-0.5 tabular-nums">{gauge.gaugeHeightFt.toFixed(2)} ft</div>
                  )}
                </>
              ) : (
                <>
                  {gauge.gaugeHeightFt !== null && (
                    <div className="flex items-baseline gap-1">
                      <span className="text-xl md:text-2xl font-bold text-neutral-900 tabular-nums">{gauge.gaugeHeightFt.toFixed(2)}</span>
                      <span className="text-xs font-medium text-neutral-500">ft</span>
                    </div>
                  )}
                  {gauge.dischargeCfs !== null && (
                    <div className="text-xs text-neutral-500 mt-0.5 tabular-nums">{gauge.dischargeCfs.toLocaleString()} cfs</div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Footer: share + view details */}
          <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-neutral-100">
            <div className="flex items-center gap-3">
              <button
                onClick={(e) => handleShareGauge(e, gauge.usgsSiteId)}
                className="text-xs text-neutral-400 hover:text-primary-600 flex items-center gap-1 transition-colors"
              >
                {copiedGaugeId === gauge.usgsSiteId ? (
                  <><Check className="w-3 h-3 text-emerald-500" /><span className="text-emerald-500">Copied!</span></>
                ) : (
                  <><Share2 className="w-3 h-3" />Share</>
                )}
              </button>
            </div>
            <span className="text-xs font-medium text-primary-600 flex items-center gap-1 group-hover:gap-2 transition-all">
              View Details
              <ArrowRight className="w-3.5 h-3.5" />
            </span>
          </div>
        </div>
      </Link>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-100 to-neutral-50">
      {/* Hero */}
      <section
        className="relative py-8 md:py-10 text-white overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0F2D35 0%, #1A4550 50%, #0F2D35 100%)' }}
      >
        <div className="absolute inset-0 opacity-10">
          <div className="absolute bottom-0 left-0 right-0 h-24"
               style={{ background: 'repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(255,255,255,0.03) 40px, rgba(255,255,255,0.03) 80px)' }} />
        </div>

        <div className="max-w-5xl mx-auto px-4">
          <div className="flex items-center gap-6 md:gap-8">
            <Image
              src={EDDY_IMAGES.flood}
              alt="Eddy the Otter"
              width={300}
              height={300}
              className="h-20 md:h-28 w-auto drop-shadow-[0_4px_24px_rgba(240,112,82,0.3)]"
              priority
            />
            <div>
              <h1
                className="text-2xl md:text-4xl font-bold mb-1"
                style={{ fontFamily: 'var(--font-display)', color: '#F07052' }}
              >
                River Levels
              </h1>
              <p className="text-sm md:text-base text-white/70 max-w-md">
                Real-time USGS gauge data for Missouri float rivers.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Main content */}
      <div className="max-w-5xl mx-auto px-4 py-6 md:py-8">
        {loading ? (
          <div className="space-y-6">
            <div className="bg-white border border-neutral-200 rounded-xl p-4 space-y-3">
              <div className="flex gap-3">
                <div className="skeleton h-10 flex-1 max-w-xs rounded-lg" />
                <div className="skeleton h-10 w-36 rounded-lg" />
                <div className="skeleton h-10 w-28 rounded-lg" />
              </div>
              <div className="flex gap-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="skeleton h-7 w-20 rounded-full" />
                ))}
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="bg-white rounded-xl border border-neutral-200 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="skeleton h-6 w-16 rounded-md" />
                        <div className="skeleton h-4 w-24 rounded" />
                      </div>
                      <div className="skeleton h-5 w-48 rounded mb-2" />
                      <div className="skeleton h-3 w-32 rounded" />
                    </div>
                    <div>
                      <div className="skeleton h-8 w-16 rounded" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Filter Bar */}
            <div className="bg-white border border-neutral-200 rounded-xl p-4 mb-6 space-y-3">
              {/* Row 1: Search + River + Group + Clear */}
              <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-3">
                <div className="relative flex-1 min-w-0 md:max-w-xs">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search gauges..."
                    className="w-full pl-9 pr-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  />
                </div>
                <select
                  value={selectedRiver}
                  onChange={(e) => setSelectedRiver(e.target.value)}
                  className="w-full md:w-auto px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="all">All Rivers</option>
                  {rivers.map(([id, name]) => (
                    <option key={id} value={id}>{name}</option>
                  ))}
                </select>
                <button
                  onClick={() => setGroupByRiver(!groupByRiver)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    groupByRiver
                      ? 'bg-primary-500 text-white shadow-sm'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  <span className="hidden sm:inline">Group by River</span>
                </button>
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Clear
                  </button>
                )}
              </div>

              {/* Row 2: Condition pills */}
              <div className="flex flex-wrap gap-2">
                {([
                  { key: 'too_low' as ConditionCode, count: stats.tooLow, label: 'Too Low', dot: 'bg-neutral-500' },
                  { key: 'low' as ConditionCode, count: stats.low, label: 'Low', dot: 'bg-yellow-500' },
                  { key: 'okay' as ConditionCode, count: stats.okay, label: 'Okay', dot: 'bg-lime-500' },
                  { key: 'optimal' as ConditionCode, count: stats.optimal, label: 'Optimal', dot: 'bg-emerald-500' },
                  { key: 'high' as ConditionCode, count: stats.high, label: 'High', dot: 'bg-orange-500' },
                  { key: 'dangerous' as ConditionCode, count: stats.flood, label: 'Flood', dot: 'bg-red-500' },
                ]).map(stat => {
                  const isActive = selectedCondition === stat.key;
                  return (
                    <button
                      key={stat.key}
                      onClick={() => setSelectedCondition(isActive ? 'all' : stat.key)}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                        isActive
                          ? 'text-white shadow-sm'
                          : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'
                      }`}
                      style={isActive ? { backgroundColor: getComputedPillColor(stat.key) } : undefined}
                    >
                      {!isActive && <span className={`w-2 h-2 rounded-full ${stat.dot}`} />}
                      {stat.label}
                      <span className={`tabular-nums ${isActive ? 'text-white/80' : 'text-neutral-500'}`}>{stat.count}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Gauge Cards */}
            {processedGauges.length > 0 ? (
              groupByRiver ? (
                <div className="space-y-8">
                  {(() => {
                    const riverGroups = new Map<string, { name: string; slug: string | null; gauges: typeof processedGauges }>();
                    processedGauges.forEach(gauge => {
                      const riverId = gauge.primaryRiver?.riverId || 'unknown';
                      const riverName = gauge.primaryRiver?.riverName || 'Unknown River';
                      const riverSlug = gauge.primaryRiver?.riverSlug || null;
                      if (!riverGroups.has(riverId)) {
                        riverGroups.set(riverId, { name: riverName, slug: riverSlug, gauges: [] });
                      }
                      riverGroups.get(riverId)!.gauges.push(gauge);
                    });
                    return Array.from(riverGroups.entries())
                      .sort(([, a], [, b]) => a.name.localeCompare(b.name))
                      .map(([riverId, group]) => (
                        <div key={riverId}>
                          <h2 className="text-lg font-bold text-neutral-900 mb-3 flex items-center gap-2">
                            <Droplets className="w-5 h-5 text-primary-500" />
                            {group.slug ? (
                              <Link href={`/rivers/${group.slug}`} className="hover:text-primary-600 transition-colors">
                                {group.name}
                              </Link>
                            ) : (
                              group.name
                            )}
                          </h2>
                          <GroupEddyBlurb
                            riverSlug={group.slug}
                            conditionCode={(() => {
                              const primary = group.gauges.find(g => g.primaryRiver?.isPrimary) || group.gauges[0];
                              return (primary?.condition.code || 'unknown') as ConditionCode;
                            })()}
                            gauges={group.gauges.map(g => ({
                              name: g.name,
                              gaugeHeightFt: g.gaugeHeightFt,
                              primaryRiver: g.primaryRiver ? {
                                levelOptimalMin: g.primaryRiver.levelOptimalMin,
                                levelOptimalMax: g.primaryRiver.levelOptimalMax,
                                thresholdUnit: g.primaryRiver.thresholdUnit,
                                isPrimary: g.primaryRiver.isPrimary,
                              } : null,
                            }))}
                            eddyCache={eddyCache}
                            setEddyCache={setEddyCache}
                          />
                          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                            {group.gauges.map((gauge) => renderGaugeCard(gauge))}
                          </div>
                        </div>
                      ));
                  })()}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {processedGauges.map((gauge) => renderGaugeCard(gauge))}
                </div>
              )
            ) : (
              <div className="bg-white border border-neutral-200 rounded-xl p-12 text-center">
                <p className="text-neutral-600">No gauges match your current filters.</p>
                <button
                  onClick={clearFilters}
                  className="mt-4 px-4 py-2 bg-primary-500 text-white rounded-lg font-medium hover:bg-primary-600 transition-colors"
                >
                  Clear Filters
                </button>
              </div>
            )}

            {/* Info box */}
            <div className="mt-8 bg-primary-50 border border-primary-200 rounded-xl p-6">
              <h3 className="text-base font-bold text-neutral-900 mb-2">About This Data</h3>
              <div className="text-sm text-neutral-700 space-y-2">
                <p>
                  All gauge data is provided by the <strong>United States Geological Survey (USGS)</strong> through
                  their Water Services API. Readings are updated hourly and typically lag real-time conditions by
                  15-60 minutes.
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      <SiteFooter maxWidth="max-w-5xl" className="mt-12" />

    </div>
  );
}
