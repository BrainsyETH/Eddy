'use client';

// src/app/gauges/page.tsx
// Dashboard-style gauge stations page with charts, filters, and engaging cards

import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  ChevronDown,
  ChevronUp,
  Droplets,
  MapPin,
  Clock,
  ExternalLink,
  Activity,
  TrendingUp,
  X,
  Flag,
  Share2,
  Check,
  Layers,
  Search
} from 'lucide-react';

import { computeCondition, getConditionTailwindColor, getConditionShortLabel, type ConditionThresholds } from '@/lib/conditions';
import type { GaugesResponse, GaugeStation } from '@/app/api/gauges/route';
import type { ConditionCode } from '@/types/api';
import GaugeWeather from '@/components/ui/GaugeWeather';
import FeedbackModal from '@/components/ui/FeedbackModal';
import SiteFooter from '@/components/ui/SiteFooter';
import FlowTrendChart from '@/components/ui/FlowTrendChart';
import { useGaugeHistoryPrefetch } from '@/hooks/useGaugeHistory';
import type { FeedbackContext } from '@/types/api';
import type { EddyUpdateResponse } from '@/app/api/eddy-update/[riverSlug]/route';
import { RIVER_NOTES, CONDITION_CARD_BLURBS } from '@/data/eddy-quotes';

import { EDDY_IMAGES, getEddyImageForCondition } from '@/constants';

// Map condition codes to Eddy Says card theme colors
const getEddyCardTheme = (code: ConditionCode) => {
  switch (code) {
    case 'optimal':
      return { bg: 'bg-gradient-to-r from-emerald-50 to-teal-50', border: 'border-emerald-200', text: 'text-emerald-900', accent: 'text-emerald-900' };
    case 'okay':
      return { bg: 'bg-gradient-to-r from-lime-50 to-emerald-50', border: 'border-lime-200', text: 'text-lime-900', accent: 'text-lime-900' };
    case 'low':
      return { bg: 'bg-gradient-to-r from-yellow-50 to-amber-50', border: 'border-yellow-200', text: 'text-yellow-900', accent: 'text-yellow-900' };
    case 'too_low':
      return { bg: 'bg-gradient-to-r from-neutral-50 to-neutral-100', border: 'border-neutral-300', text: 'text-neutral-700', accent: 'text-neutral-700' };
    case 'high':
      return { bg: 'bg-gradient-to-r from-orange-50 to-amber-50', border: 'border-orange-200', text: 'text-orange-900', accent: 'text-orange-900' };
    case 'dangerous':
      return { bg: 'bg-gradient-to-r from-red-50 to-orange-50', border: 'border-red-200', text: 'text-red-900', accent: 'text-red-900' };
    default:
      return { bg: 'bg-gradient-to-r from-emerald-50 to-teal-50', border: 'border-emerald-200', text: 'text-emerald-900', accent: 'text-emerald-900' };
  }
};

// Desktop drawer width (used for panel and main content margin)
const DRAWER_WIDTH_PX = 540;

// Pill background color for active condition filter
const getComputedPillColor = (code: ConditionCode): string => {
  switch (code) {
    case 'too_low': return '#737373'; // neutral-500
    case 'low': return '#eab308'; // yellow-500
    case 'okay': return '#84cc16'; // lime-500
    case 'optimal': return '#10b981'; // emerald-500
    case 'high': return '#f97316'; // orange-500
    case 'dangerous': return '#ef4444'; // red-500
    default: return '#737373';
  }
};

// Date range options for charts
const DATE_RANGES = [
  { days: 7, label: '7 Days' },
  { days: 14, label: '14 Days' },
  { days: 30, label: '30 Days' },
];

// Compact Eddy Says blurb for grouped river view — lazy-loads AI update on expand
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
  const [isOpen, setIsOpen] = useState(false);
  const [localLoading, setLocalLoading] = useState(false);

  // Fetch on first expand
  useEffect(() => {
    if (!isOpen || !riverSlug || riverSlug in eddyCache) return;

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
  }, [isOpen, riverSlug, eddyCache, setEddyCache]);

  const update = riverSlug ? eddyCache[riverSlug] ?? null : null;
  const theme = getEddyCardTheme(conditionCode);

  // Build static fallback
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

  return (
    <div className="mb-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center gap-2 text-xs font-semibold transition-colors ${theme.accent} opacity-60 hover:opacity-100`}
      >
        <Image
          src={getEddyImageForCondition(conditionCode)}
          alt="Eddy"
          width={20}
          height={20}
          className="w-5 h-5 object-contain"
        />
        Eddy says
        {isOpen ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {isOpen && (
        <div className={`${theme.bg} border ${theme.border} rounded-lg p-3 mt-2`}>
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-10 h-10 relative">
              <Image
                src={getEddyImageForCondition(conditionCode)}
                alt="Eddy the Otter"
                fill
                className="object-contain"
                sizes="40px"
              />
            </div>
            <div className="flex-1 min-w-0">
              {localLoading && !update ? (
                <p className="text-sm text-neutral-500 italic">Loading Eddy&apos;s take...</p>
              ) : (
                <p className={`text-sm leading-relaxed font-medium ${theme.text}`}>
                  &ldquo;{update ? (update.summaryText || update.quoteText) : buildStaticText()}&rdquo;
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


export default function GaugesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [gaugeData, setGaugeData] = useState<GaugesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedGaugeId, setExpandedGaugeId] = useState<string | null>(null);
  const [selectedRiver, setSelectedRiver] = useState<string>(searchParams.get('riverFilter') || 'all');
  const [selectedCondition, setSelectedCondition] = useState<ConditionCode | 'all'>((searchParams.get('condition') as ConditionCode) || 'all');
  const [dateRange, setDateRange] = useState(Number(searchParams.get('days')) || 7);
  const [searchQuery, setSearchQuery] = useState(searchParams.get('q') || '');
  const [groupByRiver, setGroupByRiver] = useState(searchParams.get('group') !== 'flat');
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackContext, setFeedbackContext] = useState<FeedbackContext | undefined>(undefined);
  const [copiedGaugeId, setCopiedGaugeId] = useState<string | null>(null);
  const prefetchHistory = useGaugeHistoryPrefetch();

  // Persist filter state in URL search params
  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    // Keep existing deep-link params like ?river= and ?gauge=
    if (selectedRiver !== 'all') params.set('riverFilter', selectedRiver); else params.delete('riverFilter');
    if (selectedCondition !== 'all') params.set('condition', selectedCondition); else params.delete('condition');
    if (dateRange !== 7) params.set('days', String(dateRange)); else params.delete('days');
    if (searchQuery) params.set('q', searchQuery); else params.delete('q');
    if (!groupByRiver) params.set('group', 'flat'); else params.delete('group');
    const newUrl = params.toString() ? `?${params.toString()}` : window.location.pathname;
    router.replace(newUrl, { scroll: false });
  }, [selectedRiver, selectedCondition, dateRange, groupByRiver, searchQuery]); // eslint-disable-line react-hooks/exhaustive-deps

  // Eddy AI update cache: keyed by river slug
  const [eddyCache, setEddyCache] = useState<Record<string, EddyUpdateResponse['update'] | null>>({});
  const [eddyLoading, setEddyLoading] = useState(false);
  const [eddyShowFull, setEddyShowFull] = useState(false);
  const [eddyShareStatus, setEddyShareStatus] = useState<'idle' | 'copied'>('idle');
  const gaugeCardRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const drawerBodyRef = useRef<HTMLDivElement>(null);
  const drawerCloseButtonRef = useRef<HTMLButtonElement>(null);

  // Detect desktop for drawer vs inline expansion
  const [isDesktop, setIsDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    setIsDesktop(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  // When drawer opens: scroll body to top and focus close button
  useEffect(() => {
    if (!isDesktop || !expandedGaugeId) return;
    const raf = requestAnimationFrame(() => {
      drawerBodyRef.current?.scrollTo(0, 0);
      drawerCloseButtonRef.current?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [isDesktop, expandedGaugeId]);

  // Escape key closes the drawer
  useEffect(() => {
    if (!isDesktop || !expandedGaugeId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandedGaugeId(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isDesktop, expandedGaugeId]);

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

  // Prefetch 7-day history for visible gauges when data loads
  useEffect(() => {
    if (!gaugeData?.gauges) return;
    // Prefetch first 9 gauges (visible above the fold) with a slight delay to not block initial render
    const timeout = setTimeout(() => {
      const siteIds = gaugeData.gauges.slice(0, 9).map(g => g.usgsSiteId);
      prefetchHistory(siteIds, 7);
    }, 1000);
    return () => clearTimeout(timeout);
  }, [gaugeData, prefetchHistory]);

  // Deep-link: auto-select river from ?river= query param (slug-based)
  useEffect(() => {
    const riverSlug = searchParams.get('river');
    if (!riverSlug || !gaugeData?.gauges) return;

    // Fetch rivers API to resolve slug → river UUID
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
      } catch {
        // silently fail
      }
    }
    resolveRiverSlug();
  }, [searchParams, gaugeData]);

  // Deep-link: auto-expand and scroll to gauge from ?gauge= query param
  useEffect(() => {
    const gaugeParam = searchParams.get('gauge');
    if (!gaugeParam || !gaugeData?.gauges) return;

    // Find gauge by USGS site ID
    const targetGauge = gaugeData.gauges.find(g => g.usgsSiteId === gaugeParam);
    if (!targetGauge) return;

    // Clear filters so the gauge is visible
    setSelectedRiver('all');
    setSelectedCondition('all');

    // Expand the gauge card
    setExpandedGaugeId(targetGauge.id);

    // Scroll to it after a brief delay for rendering
    setTimeout(() => {
      const el = gaugeCardRefs.current[targetGauge.id];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  }, [searchParams, gaugeData]);

  // Close desktop drawer on Escape
  useEffect(() => {
    if (!isDesktop || !expandedGaugeId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandedGaugeId(null);
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isDesktop, expandedGaugeId]);

  // Lock body scroll when desktop drawer is open
  useEffect(() => {
    if (isDesktop && expandedGaugeId) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [isDesktop, expandedGaugeId]);

  // Share a gauge link
  const handleShareGauge = useCallback(async (e: React.MouseEvent, usgsSiteId: string) => {
    e.stopPropagation();
    const shareUrl = `${window.location.origin}/gauges/${usgsSiteId}`;

    const isMobile = window.matchMedia('(pointer: coarse)').matches;
    if (isMobile && navigator.share) {
      try {
        await navigator.share({ url: shareUrl });
        return;
      } catch {
        // User cancelled or share failed, fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedGaugeId(usgsSiteId);
      setTimeout(() => setCopiedGaugeId(null), 2000);
    } catch {
      window.prompt('Copy this link:', shareUrl);
    }
  }, []);

  // Helper to get condition from gauge reading and thresholds
  // Supports both ft and cfs threshold units
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
        // Filter by search query (gauge name)
        if (searchQuery) {
          const q = searchQuery.toLowerCase();
          const nameMatch = gauge.name.toLowerCase().includes(q);
          const primaryRiver = gauge.thresholds?.find(t => t.isPrimary) || gauge.thresholds?.[0];
          const riverMatch = primaryRiver?.riverName?.toLowerCase().includes(q) || false;
          const siteIdMatch = gauge.usgsSiteId.includes(q);
          if (!nameMatch && !riverMatch && !siteIdMatch) return false;
        }

        // Filter by specific river
        if (selectedRiver !== 'all') {
          const hasRiver = gauge.thresholds?.some(t => t.riverId === selectedRiver);
          if (!hasRiver) return false;
        }

        // Filter by condition
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
        // Sort by water level progression (Too Low → Low → Okay → Optimal → High → Flood)
        const conditionOrder: Record<ConditionCode, number> = {
          too_low: 0,
          low: 1,
          okay: 2,
          optimal: 3,
          high: 4,
          dangerous: 5,
          unknown: 6,
        };
        return conditionOrder[a.condition.code] - conditionOrder[b.condition.code];
      });
  }, [gaugeData, selectedRiver, selectedCondition, searchQuery]);

  // Calculate stats for overview cards
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

  // Get reading age text
  const getAgeText = (gauge: GaugeStation) => {
    if (gauge.readingAgeHours === null) return null;
    if (gauge.readingAgeHours < 1) return 'Just now';
    if (gauge.readingAgeHours < 24) return `${Math.round(gauge.readingAgeHours)}h ago`;
    return `${Math.round(gauge.readingAgeHours / 24)}d ago`;
  };

  // Clear all filters
  const clearFilters = () => {
    setSelectedRiver('all');
    setSelectedCondition('all');
    setGroupByRiver(true);
    setSearchQuery('');
  };

  const hasActiveFilters = selectedRiver !== 'all' || selectedCondition !== 'all' || !groupByRiver || searchQuery !== '';

  // Open feedback modal with gauge context
  const openFeedbackModal = (gauge: GaugeStation & { condition: { code: ConditionCode; label: string; tailwindColor: string }; primaryRiver: NonNullable<GaugeStation['thresholds']>[0] | undefined }) => {
    setFeedbackContext({
      type: 'gauge',
      id: gauge.usgsSiteId,
      name: gauge.name,
      data: {
        usgsSiteId: gauge.usgsSiteId,
        gaugeName: gauge.name,
        riverName: gauge.primaryRiver?.riverName,
        gaugeHeightFt: gauge.gaugeHeightFt,
        dischargeCfs: gauge.dischargeCfs,
        condition: gauge.condition.label,
        readingTimestamp: gauge.readingTimestamp,
        coordinates: gauge.coordinates,
      },
    });
    setFeedbackModalOpen(true);
  };

  // Derive river slug from gauge data when a specific river is selected
  const selectedRiverSlug = useMemo(() => {
    if (selectedRiver === 'all' || !gaugeData?.gauges) return null;

    // Look for the slug in threshold data
    for (const gauge of gaugeData.gauges) {
      const match = gauge.thresholds?.find(t => t.riverId === selectedRiver);
      if (match?.riverSlug) return match.riverSlug;
    }

    // Fallback: derive from river name
    const riverEntry = rivers.find(([id]) => id === selectedRiver);
    if (!riverEntry) return null;
    return riverEntry[1].toLowerCase()
      .replace(/\s+river$/i, '')
      .replace(/\s+creek$/i, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }, [selectedRiver, rivers, gaugeData]);

  // Fetch Eddy AI update when a river is selected (cached per slug)
  useEffect(() => {
    setEddyShowFull(false); // Reset toggle on river change
    if (!selectedRiverSlug) return;
    if (selectedRiverSlug in eddyCache) return; // already cached

    let cancelled = false;
    setEddyLoading(true);

    async function fetchEddy() {
      try {
        const res = await fetch(`/api/eddy-update/${selectedRiverSlug}`);
        if (!res.ok) return;
        const data: EddyUpdateResponse = await res.json();
        if (!cancelled) {
          setEddyCache(prev => ({ ...prev, [selectedRiverSlug!]: data.available ? data.update : null }));
        }
      } catch {
        if (!cancelled) {
          setEddyCache(prev => ({ ...prev, [selectedRiverSlug!]: null }));
        }
      } finally {
        if (!cancelled) setEddyLoading(false);
      }
    }

    fetchEddy();
    return () => { cancelled = true; };
  }, [selectedRiverSlug, eddyCache]);

  const eddyUpdate = selectedRiverSlug ? eddyCache[selectedRiverSlug] ?? null : null;

  // Render a single gauge card (used by both flat and grouped views)
  const renderGaugeCard = (gauge: typeof processedGauges[0]) => {
    const isExpanded = expandedGaugeId === gauge.id;
    const ageText = getAgeText(gauge);

    return (
      <div
        key={gauge.id}
        ref={(el) => { gaugeCardRefs.current[gauge.id] = el; }}
        className={`bg-white rounded-2xl overflow-hidden transition-colors duration-200 ${
          isExpanded
            ? 'ring-2 ring-primary-400 shadow-lg border border-primary-200'
            : 'border border-neutral-200 hover:border-neutral-300 hover:shadow-md'
        }`}
      >
        {/* Card Header */}
        <button
          onClick={() => setExpandedGaugeId(isExpanded ? null : gauge.id)}
          className="relative w-full p-5 text-left"
        >
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              {/* Condition Badge + River Name */}
              <div className="flex items-center gap-3 mb-3">
                <span className={`px-3 py-1.5 rounded-lg text-xs font-bold text-white shadow-sm ${gauge.condition.tailwindColor}`}>
                  {gauge.condition.label}
                </span>
                {gauge.primaryRiver?.riverSlug ? (
                  <Link href={`/rivers/${gauge.primaryRiver.riverSlug}`} className="text-sm font-medium text-neutral-600 hover:text-primary-600 transition-colors">
                    {gauge.primaryRiver.riverName || 'Unknown River'}
                  </Link>
                ) : (
                  <span className="text-sm font-medium text-neutral-600">
                    {gauge.primaryRiver?.riverName || 'Unknown River'}
                  </span>
                )}
              </div>

              {/* Gauge Name */}
              <h3 className="text-lg font-bold text-neutral-900 mb-1">{gauge.name}</h3>

              {/* USGS ID + Age */}
              <div className="flex items-center gap-3 text-xs text-neutral-600">
                <a
                  href={`https://waterdata.usgs.gov/monitoring-location/${gauge.usgsSiteId}/`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-700 font-mono flex items-center gap-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  #{gauge.usgsSiteId}
                  <ExternalLink className="w-3 h-3" />
                </a>
                {ageText && (
                  <>
                    <span className="text-neutral-300">•</span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {ageText}
                    </span>
                  </>
                )}
              </div>
            </div>

            {/* Large Water Level Display - capped at text-2xl on mobile, tabular-nums */}
            <div className="flex flex-col items-end text-right flex-shrink-0">
              {gauge.primaryRiver?.thresholdUnit === 'cfs' ? (
                <>
                  {gauge.dischargeCfs !== null && (
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl md:text-4xl font-bold text-neutral-900 tabular-nums">{gauge.dischargeCfs.toLocaleString()}</span>
                      <span className="text-sm font-medium text-neutral-600">cfs</span>
                    </div>
                  )}
                  {gauge.gaugeHeightFt !== null && (
                    <div className="text-sm text-neutral-600 mt-1 tabular-nums">
                      {gauge.gaugeHeightFt.toFixed(2)} ft
                    </div>
                  )}
                </>
              ) : (
                <>
                  {gauge.gaugeHeightFt !== null && (
                    <div className="flex items-baseline gap-1">
                      <span className="text-2xl md:text-4xl font-bold text-neutral-900 tabular-nums">{gauge.gaugeHeightFt.toFixed(2)}</span>
                      <span className="text-sm font-medium text-neutral-600">ft</span>
                    </div>
                  )}
                  {gauge.dischargeCfs !== null && (
                    <div className="text-sm text-neutral-600 mt-1 tabular-nums">
                      {gauge.dischargeCfs.toLocaleString()} cfs
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Expand indicator, Share, and Report Issue */}
          <div className="flex items-center justify-between mt-4 pt-3 border-t border-neutral-100">
            <div className="flex items-center gap-3">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  openFeedbackModal(gauge);
                }}
                className="text-xs text-neutral-500 hover:text-accent-500 flex items-center gap-1 transition-colors"
              >
                <Flag className="w-3 h-3" />
                Report Issue
              </button>
              <button
                onClick={(e) => handleShareGauge(e, gauge.usgsSiteId)}
                className="text-xs text-neutral-500 hover:text-primary-600 flex items-center gap-1 transition-colors"
              >
                {copiedGaugeId === gauge.usgsSiteId ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-500" />
                    <span className="text-emerald-500">Copied!</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-3 h-3" />
                    Share
                  </>
                )}
              </button>
            </div>
            <span className="text-xs font-medium text-neutral-600 flex items-center gap-1.5 transition-colors">
              {isExpanded ? (
                <>
                  <ChevronUp className="w-4 h-4" />
                  Hide Details
                </>
              ) : (
                <>
                  <ChevronDown className="w-4 h-4" />
                  View Chart & Weather
                </>
              )}
            </span>
          </div>
        </button>

        {/* Expanded Content — inline on desktop only; mobile uses bottom sheet */}
        {isExpanded && !isDesktop && null}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-neutral-100 to-neutral-50">
      {/* Hero - More compact on desktop */}
      <section
        className="relative py-10 md:py-12 text-white overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0F2D35 0%, #1A4550 50%, #0F2D35 100%)' }}
      >
        {/* Decorative water ripple effect */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute bottom-0 left-0 right-0 h-32"
               style={{ background: 'repeating-linear-gradient(90deg, transparent, transparent 40px, rgba(255,255,255,0.03) 40px, rgba(255,255,255,0.03) 80px)' }} />
        </div>

        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col md:flex-row items-center justify-center gap-6 md:gap-10">
            <Image
              src={EDDY_IMAGES.flood}
              alt="Eddy the Otter"
              width={400}
              height={400}
              className="h-32 md:h-40 w-auto drop-shadow-[0_4px_24px_rgba(240,112,82,0.3)]"
              priority
            />
            <div className="text-center md:text-left">
              <h1
                className="text-3xl md:text-5xl font-bold mb-2"
                style={{ fontFamily: 'var(--font-display)', color: '#F07052' }}
              >
                River Levels
              </h1>
              <p className="text-base md:text-lg text-white/80 max-w-lg">
                Real-time USGS gauge data for Ozark rivers. Check conditions before you float.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Main content — shrink when desktop drawer is open */}
      <div
        className="max-w-7xl mx-auto px-4 py-6 md:py-8 transition-[margin-right] duration-200"
        style={{ marginRight: isDesktop && expandedGaugeId ? DRAWER_WIDTH_PX : undefined }}
      >
        {loading ? (
          <div className="space-y-6">
            {/* Skeleton filter bar */}
            <div className="bg-white border-2 border-neutral-200 rounded-xl p-4 space-y-3">
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
            {/* Skeleton gauge cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 9 }).map((_, i) => (
                <div key={i} className="bg-white rounded-2xl border border-neutral-200 p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="skeleton h-6 w-16 rounded-lg" />
                        <div className="skeleton h-4 w-24 rounded" />
                      </div>
                      <div className="skeleton h-5 w-48 rounded mb-2" />
                      <div className="skeleton h-3 w-32 rounded" />
                    </div>
                    <div>
                      <div className="skeleton h-9 w-20 rounded" />
                      <div className="skeleton h-4 w-14 rounded mt-1 ml-auto" />
                    </div>
                  </div>
                  <div className="skeleton h-px w-full mt-4 mb-3" />
                  <div className="skeleton h-4 w-36 rounded" />
                </div>
              ))}
            </div>
          </div>
        ) : (
          <>
            {/* Filter Bar — unified with condition pills, search, river select, and group toggle */}
            <div className="bg-white border-2 border-neutral-200 rounded-xl p-4 mb-6 space-y-3">
              {/* Row 1: Search + River select + Group toggle + Clear */}
              <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-center md:gap-3">
                {/* Search */}
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

                {/* River filter */}
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

                {/* Group by River toggle */}
                <button
                  onClick={() => setGroupByRiver(!groupByRiver)}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold transition-colors ${
                    groupByRiver
                      ? 'bg-primary-500 text-white shadow-sm'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                  title="Group gauges by river"
                >
                  <Layers className="w-4 h-4" />
                  <span className="hidden sm:inline">Group by River</span>
                </button>

                {/* Clear filters */}
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

              {/* Row 2: Condition filter pills */}
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
                          ? `${stat.dot.replace('bg-', 'bg-')} text-white shadow-sm`
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

            {/* Eddy Says (AI update when specific river selected, with static fallback) */}
            {selectedRiver !== 'all' && (() => {
              const eddyConditionCode: ConditionCode = (eddyUpdate?.conditionCode as ConditionCode) || (() => {
                const riverGauges = processedGauges.filter(g => g.primaryRiver?.riverId === selectedRiver);
                const primary = riverGauges.find(g => g.primaryRiver?.isPrimary) || riverGauges[0];
                return primary?.condition.code || 'unknown';
              })();
              const eddyTheme = getEddyCardTheme(eddyConditionCode);
              return (
              <div className={`${eddyTheme.bg} border-2 ${eddyTheme.border} rounded-xl p-5 mb-6`}>
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-12 h-12 relative">
                    <Image
                      src={getEddyImageForCondition(eddyConditionCode)}
                      alt="Eddy the Otter"
                      fill
                      className="object-contain"
                      sizes="48px"
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold tracking-wide uppercase opacity-60">Eddy says</span>
                      {eddyUpdate?.generatedAt && (
                        <span className="text-[10px] text-neutral-500 ml-auto whitespace-nowrap">
                          {(() => {
                            const hours = (Date.now() - new Date(eddyUpdate.generatedAt).getTime()) / (1000 * 60 * 60);
                            if (hours < 1) return 'Updated just now';
                            if (hours < 2) return 'Updated 1 hr ago';
                            return `Updated ${Math.round(hours)} hrs ago`;
                          })()}
                        </span>
                      )}
                    </div>
                    {eddyLoading && !(selectedRiverSlug && selectedRiverSlug in eddyCache) ? (
                      <p className="text-sm text-neutral-500 italic">Loading Eddy&apos;s take...</p>
                    ) : eddyUpdate ? (
                      <>
                        <p className={`text-sm sm:text-base leading-relaxed font-medium ${eddyTheme.text}`}>
                          &ldquo;{eddyUpdate.summaryText && !eddyShowFull
                            ? eddyUpdate.summaryText
                            : eddyUpdate.quoteText}&rdquo;
                        </p>
                        <div className="flex items-center gap-3 mt-1.5">
                          {eddyUpdate.summaryText && (
                            <button
                              onClick={() => setEddyShowFull(!eddyShowFull)}
                              className={`flex items-center gap-1 text-xs font-semibold ${eddyTheme.accent} opacity-60 hover:opacity-100 transition-colors`}
                            >
                              {eddyShowFull ? (
                                <>Show less <ChevronUp className="w-3 h-3" /></>
                              ) : (
                                <>Read more <ChevronDown className="w-3 h-3" /></>
                              )}
                            </button>
                          )}
                          <button
                            onClick={async () => {
                              const url = `${window.location.origin}/gauges?river=${selectedRiverSlug}`;
                              const isMobile = window.matchMedia('(pointer: coarse)').matches;
                              if (isMobile && navigator.share) {
                                try {
                                  await navigator.share({ url });
                                  return;
                                } catch { /* cancelled */ }
                              }
                              try {
                                await navigator.clipboard.writeText(url);
                                setEddyShareStatus('copied');
                                setTimeout(() => setEddyShareStatus('idle'), 2000);
                              } catch { /* clipboard failed */ }
                            }}
                            className={`flex items-center gap-1 text-xs font-semibold ${eddyTheme.accent} opacity-50 hover:opacity-100 transition-colors ml-auto`}
                            title="Share this report"
                          >
                            <Share2 className="w-3 h-3" />
                            <span className="hidden sm:inline">
                              {eddyShareStatus === 'copied' ? 'Copied' : 'Share'}
                            </span>
                          </button>
                        </div>
                      </>
                    ) : (() => {
                      // Static fallback: build from gauge conditions + DB thresholds
                      const riverGauges = processedGauges.filter(g => g.primaryRiver?.riverId === selectedRiver);
                      const primary = riverGauges.find(g => g.primaryRiver?.isPrimary) || riverGauges[0];
                      const condCode = (primary?.condition.code || 'unknown') as ConditionCode;
                      const blurb = CONDITION_CARD_BLURBS[condCode];
                      const gauge = primary?.gaugeHeightFt;
                      const pr = primary?.primaryRiver;
                      const optMin = pr?.levelOptimalMin;
                      const optMax = pr?.levelOptimalMax;
                      const unit = pr?.thresholdUnit === 'cfs' ? 'cfs' : 'ft';
                      const optRange = (optMin != null && optMax != null) ? `${optMin}\u2013${optMax} ${unit}` : null;
                      const notes = selectedRiverSlug ? RIVER_NOTES[selectedRiverSlug] : null;
                      const parts: string[] = [];
                      if (gauge !== null && gauge !== undefined) {
                        parts.push(`Reading ${gauge.toFixed(1)} ft at the ${primary?.name || 'primary gauge'}.`);
                      }
                      parts.push(blurb);
                      if (optRange) parts.push(`Optimal range is ${optRange}.`);
                      if (notes) parts.push(notes);
                      return (
                        <p className={`text-sm sm:text-base leading-relaxed font-medium ${eddyTheme.text}`}>
                          &ldquo;{parts.join(' ')}&rdquo;
                        </p>
                      );
                    })()}
                  </div>
                </div>
              </div>
              );
            })()}

            {/* Gauge Cards Grid */}
            {processedGauges.length > 0 ? (
              groupByRiver ? (
                // Group by River view
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
                            <span className="text-sm font-normal text-neutral-500">({group.gauges.length})</span>
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
                // Flat grid view
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {processedGauges.map((gauge) => renderGaugeCard(gauge))}
                </div>
              )
            ) : (
              <div className="bg-white border-2 border-neutral-200 rounded-xl p-12 text-center">
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
            <div className="mt-8 bg-primary-50 border-2 border-primary-200 rounded-xl p-6">
              <h3 className="text-lg font-bold text-neutral-900 mb-2">About This Data</h3>
              <div className="text-sm text-neutral-700 space-y-2">
                <p>
                  All gauge data is provided by the <strong>United States Geological Survey (USGS)</strong> through
                  their Water Services API. Readings are updated hourly and typically lag real-time conditions by
                  15-60 minutes.
                </p>
                <p>
                  <strong>Gauge Height</strong> measures the water level in feet above an arbitrary datum point at
                  the gauge location. <strong>Discharge</strong> measures the flow rate in cubic feet per second (cfs).
                </p>
              </div>
            </div>
          </>
        )}
      </div>

      <SiteFooter subtitle="Water data from USGS &middot; Updated hourly" maxWidth="max-w-6xl" className="mt-12" />

      {/* Desktop Slide-Over Drawer */}
      {isDesktop && expandedGaugeId && (() => {
        const drawerGauge = processedGauges.find(g => g.id === expandedGaugeId);
        if (!drawerGauge) return null;
        return (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/20 z-40 transition-opacity"
              onClick={() => setExpandedGaugeId(null)}
              aria-hidden="true"
            />
            {/* Panel — uses CSS keyframe slideInFromRight defined in globals.css */}
            <div
              className="fixed inset-y-0 right-0 max-w-[90vw] bg-white shadow-2xl z-50 flex flex-col"
              style={{ width: DRAWER_WIDTH_PX, animation: 'slideInFromRight 0.2s ease-out forwards' }}
              role="dialog"
              aria-modal="true"
              aria-label={`${drawerGauge.name} details`}
            >
              {/* Drawer Header */}
              <div className="flex items-start justify-between gap-4 px-6 py-5 border-b border-neutral-200 bg-white flex-shrink-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold text-white ${drawerGauge.condition.tailwindColor}`}>
                      {drawerGauge.condition.label}
                    </span>
                    <span className="text-sm text-neutral-600">{drawerGauge.primaryRiver?.riverName}</span>
                  </div>
                  <h2 className="text-lg font-bold text-neutral-900 truncate">{drawerGauge.name}</h2>
                  <div className="flex items-center gap-3 text-xs text-neutral-600 mt-1">
                    <a
                      href={`https://waterdata.usgs.gov/monitoring-location/${drawerGauge.usgsSiteId}/`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 hover:text-primary-700 font-mono flex items-center gap-1"
                    >
                      #{drawerGauge.usgsSiteId}
                      <ExternalLink className="w-3 h-3" />
                    </a>
                    {getAgeText(drawerGauge) && (
                      <>
                        <span className="text-neutral-300">·</span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {getAgeText(drawerGauge)}
                        </span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-2">
                    <button
                      onClick={(e) => handleShareGauge(e, drawerGauge.usgsSiteId)}
                      className="text-xs text-neutral-500 hover:text-primary-600 flex items-center gap-1 transition-colors"
                    >
                      {copiedGaugeId === drawerGauge.usgsSiteId ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-500" />
                          <span className="text-emerald-500">Copied!</span>
                        </>
                      ) : (
                        <>
                          <Share2 className="w-3 h-3" />
                          Share
                        </>
                      )}
                    </button>
                    <button
                      onClick={() => openFeedbackModal(drawerGauge)}
                      className="text-xs text-neutral-500 hover:text-accent-500 flex items-center gap-1 transition-colors"
                    >
                      <Flag className="w-3 h-3" />
                      Report Issue
                    </button>
                  </div>
                </div>
                <button
                  ref={drawerCloseButtonRef}
                  onClick={() => setExpandedGaugeId(null)}
                  className="p-2 -m-2 rounded-lg text-neutral-500 hover:text-neutral-600 hover:bg-neutral-100 transition-colors flex-shrink-0"
                  aria-label="Close details"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {/* Drawer Body — scrollable */}
              <div ref={drawerBodyRef} className="flex-1 overflow-y-auto">
                <GaugeExpandedPanel
                  gauge={drawerGauge}
                  dateRange={dateRange}
                  setDateRange={setDateRange}
                  variant="drawer"
                />
              </div>
            </div>
          </>
        );
      })()}

      {/* Mobile Bottom Sheet */}
      {!isDesktop && expandedGaugeId && (() => {
        const sheetGauge = processedGauges.find(g => g.id === expandedGaugeId);
        if (!sheetGauge) return null;
        return (
          <>
            {/* Backdrop */}
            <div
              className="fixed inset-0 bg-black/30 z-40"
              onClick={() => setExpandedGaugeId(null)}
              aria-hidden="true"
            />
            {/* Bottom Sheet */}
            <div
              className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl flex flex-col"
              style={{ maxHeight: '85vh', animation: 'slideUpSheet 0.25s ease-out forwards' }}
              role="dialog"
              aria-modal="true"
              aria-label={`${sheetGauge.name} details`}
            >
              {/* Drag handle */}
              <div className="flex justify-center pt-3 pb-1 flex-shrink-0">
                <div className="w-10 h-1 rounded-full bg-neutral-300" />
              </div>
              {/* Sheet Header */}
              <div className="flex items-start justify-between gap-3 px-5 pb-3 border-b border-neutral-200 flex-shrink-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`px-2.5 py-1 rounded-lg text-xs font-bold text-white ${sheetGauge.condition.tailwindColor}`}>
                      {sheetGauge.condition.label}
                    </span>
                    <span className="text-sm text-neutral-600">{sheetGauge.primaryRiver?.riverName}</span>
                  </div>
                  <h2 className="text-base font-bold text-neutral-900">{sheetGauge.name}</h2>
                </div>
                <button
                  onClick={() => setExpandedGaugeId(null)}
                  className="p-2 -m-2 rounded-lg text-neutral-500 hover:text-neutral-600 hover:bg-neutral-100 transition-colors flex-shrink-0"
                  aria-label="Close details"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              {/* Sheet Body — scrollable */}
              <div className="flex-1 overflow-y-auto overscroll-contain">
                <GaugeExpandedPanel
                  gauge={sheetGauge}
                  dateRange={dateRange}
                  setDateRange={setDateRange}
                  variant="inline"
                />
              </div>
            </div>
          </>
        );
      })()}

      {/* Feedback Modal */}
      <FeedbackModal
        isOpen={feedbackModalOpen}
        onClose={() => setFeedbackModalOpen(false)}
        context={feedbackContext}
      />
    </div>
  );
}

// Expanded panel for a gauge card with per-card unit toggle
function GaugeExpandedPanel({
  gauge,
  dateRange,
  setDateRange,
  variant = 'inline',
}: {
  gauge: {
    id: string;
    usgsSiteId: string;
    name: string;
    coordinates: { lat: number; lng: number };
    gaugeHeightFt: number | null;
    dischargeCfs: number | null;
    readingTimestamp: string | null;
    thresholdDescriptions: { tooLow?: string; low?: string; okay?: string; optimal?: string; high?: string; flood?: string } | null;
    condition: { code: ConditionCode; label: string; tailwindColor: string };
    primaryRiver?: NonNullable<GaugeStation['thresholds']>[0];
  };
  dateRange: number;
  setDateRange: (d: number) => void;
  variant?: 'drawer' | 'inline';
}) {
  const primaryUnit = gauge.primaryRiver?.thresholdUnit === 'cfs' ? 'cfs' : 'ft';
  const altUnit = primaryUnit === 'cfs' ? 'ft' : 'cfs';
  const storageKey = `eddy-gauge-unit-${gauge.usgsSiteId}`;
  const [displayUnit, setDisplayUnitState] = useState<'ft' | 'cfs'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(storageKey);
      if (saved === 'ft' || saved === 'cfs') return saved;
    }
    return primaryUnit;
  });
  const setDisplayUnit = (unit: 'ft' | 'cfs') => {
    setDisplayUnitState(unit);
    if (typeof window !== 'undefined') {
      localStorage.setItem(storageKey, unit);
    }
  };
  const showingAlt = displayUnit !== primaryUnit;

  // Pick thresholds based on which unit we're displaying
  const pr = gauge.primaryRiver;
  const tv = pr ? (showingAlt
    ? {
        levelTooLow: pr.altLevelTooLow ?? null,
        levelLow: pr.altLevelLow ?? null,
        levelOptimalMin: pr.altLevelOptimalMin ?? null,
        levelOptimalMax: pr.altLevelOptimalMax ?? null,
        levelHigh: pr.altLevelHigh ?? null,
        levelDangerous: pr.altLevelDangerous ?? null,
      }
    : {
        levelTooLow: pr.levelTooLow,
        levelLow: pr.levelLow,
        levelOptimalMin: pr.levelOptimalMin,
        levelOptimalMax: pr.levelOptimalMax,
        levelHigh: pr.levelHigh,
        levelDangerous: pr.levelDangerous,
      }
  ) : null;

  // Check if alt thresholds have any data
  const hasAltThresholds = pr && (
    pr.altLevelTooLow !== null || pr.altLevelLow !== null ||
    pr.altLevelOptimalMin !== null || pr.altLevelOptimalMax !== null ||
    pr.altLevelHigh !== null || pr.altLevelDangerous !== null
  );

  const isDrawer = variant === 'drawer';

  return (
    <div className="border-t-2 border-neutral-100 p-4 pb-6 bg-neutral-50">
      {/* Top Row: Weather (left) + Current Readings (right) — single column in drawer */}
      <div className={`grid grid-cols-1 gap-6 mb-6 ${!isDrawer ? 'lg:grid-cols-2' : ''}`}>
        <div>
          <GaugeWeather
            lat={gauge.coordinates.lat}
            lon={gauge.coordinates.lng}
            enabled={true}
          />
        </div>

        <div>
          <h4 className="text-sm font-semibold text-neutral-700 mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Current Readings
          </h4>
          {(() => {
            const useCfs = displayUnit === 'cfs';
            const primaryLabel = useCfs ? 'Flow' : 'Stage';
            const primaryIcon = useCfs ? <Activity className="w-4 h-4 text-primary-600" /> : <Droplets className="w-4 h-4 text-primary-600" />;
            const primaryValue = useCfs
              ? (gauge.dischargeCfs !== null ? `${gauge.dischargeCfs.toLocaleString()} cfs` : 'N/A')
              : (gauge.gaugeHeightFt !== null ? `${gauge.gaugeHeightFt.toFixed(2)} ft` : 'N/A');
            const secondaryLabel = useCfs ? 'Stage' : 'Flow';
            const secondaryIcon = useCfs ? <Droplets className="w-4 h-4 text-neutral-500" /> : <Activity className="w-4 h-4 text-neutral-500" />;
            const secondaryValue = useCfs
              ? (gauge.gaugeHeightFt !== null ? `${gauge.gaugeHeightFt.toFixed(2)} ft` : 'N/A')
              : (gauge.dischargeCfs !== null ? `${gauge.dischargeCfs.toLocaleString()} cfs` : 'N/A');

            return (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white border-2 border-primary-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    {primaryIcon}
                    <span className="text-xs font-medium text-primary-600 uppercase">{primaryLabel}</span>
                  </div>
                  <div className="text-2xl font-bold text-neutral-900">
                    {primaryValue}
                  </div>
                </div>
                <div className="bg-white border border-neutral-200 rounded-lg p-3">
                  <div className="flex items-center gap-2 mb-1">
                    {secondaryIcon}
                    <span className="text-xs font-medium text-neutral-500 uppercase">{secondaryLabel}</span>
                  </div>
                  <div className="text-lg text-neutral-600">
                    {secondaryValue}
                  </div>
                </div>
                <div className="bg-white border border-neutral-200 rounded-lg p-3 flex items-center justify-center">
                  <Image
                    src={getEddyImageForCondition(gauge.condition.code)}
                    alt={`Eddy - ${gauge.condition.label}`}
                    width={80}
                    height={80}
                    className="w-16 h-16 object-contain"
                  />
                </div>
              </div>
            );
          })()}
        </div>
      </div>

      {/* Bottom Row: Chart (left) + Thresholds/Details (right) — single column in drawer */}
      <div className={`grid grid-cols-1 gap-6 ${!isDrawer ? 'lg:grid-cols-2' : ''}`}>
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-neutral-700 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              {dateRange}-Day {displayUnit === 'ft' ? 'Stage' : 'Flow'} Trend
            </h4>
            <div className="flex rounded-lg border border-neutral-300 overflow-hidden">
              {DATE_RANGES.map(range => (
                <button
                  key={range.days}
                  onClick={(e) => { e.stopPropagation(); setDateRange(range.days); }}
                  className={`px-2 py-1 text-xs font-medium transition-colors ${
                    dateRange === range.days
                      ? 'bg-primary-500 text-white'
                      : 'bg-white text-neutral-600 hover:bg-neutral-50'
                  }`}
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>
          <div className="bg-neutral-50 border border-neutral-200 rounded-xl overflow-hidden">
            <FlowTrendChart
              gaugeSiteId={gauge.usgsSiteId}
              days={dateRange}
              displayUnit={displayUnit}
              latestValue={displayUnit === 'cfs' ? gauge.dischargeCfs : gauge.gaugeHeightFt}
              thresholds={tv}
              chartClassName={isDrawer ? 'h-56' : undefined}
            />
          </div>
        </div>

        <div className="space-y-4">
          {/* Thresholds - uses toggled unit values */}
          {pr && tv && (() => {
            const unit = displayUnit;
            const formatValue = (val: number | null) => {
              if (val === null) return null;
              return unit === 'cfs' ? val.toLocaleString() : val.toFixed(2);
            };
            const descriptions = gauge.thresholdDescriptions;
            const decrementValue = unit === 'cfs' ? 1 : 0.01;

            return (
              <div>
                <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
                  <h4 className="text-sm font-semibold text-neutral-700">
                    Condition Thresholds
                  </h4>
                  {hasAltThresholds ? (
                    <div className="flex rounded-md border border-neutral-300 overflow-hidden">
                      <button
                        onClick={() => setDisplayUnit(primaryUnit as 'ft' | 'cfs')}
                        className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                          displayUnit === primaryUnit
                            ? 'bg-primary-500 text-white'
                            : 'bg-white text-neutral-500 hover:bg-neutral-50'
                        }`}
                      >
                        {primaryUnit === 'ft' ? 'Gauge Ht (ft)' : 'Flow (cfs)'}
                      </button>
                      <button
                        onClick={() => setDisplayUnit(altUnit as 'ft' | 'cfs')}
                        className={`px-2.5 py-1 text-xs font-medium transition-colors ${
                          displayUnit === altUnit
                            ? 'bg-primary-500 text-white'
                            : 'bg-white text-neutral-500 hover:bg-neutral-50'
                        }`}
                      >
                        {altUnit === 'ft' ? 'Gauge Ht (ft)' : 'Flow (cfs)'}
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs font-normal text-neutral-500">
                      ({unit === 'cfs' ? 'flow' : 'gauge height'})
                    </span>
                  )}
                </div>
                <div className="bg-white border border-neutral-200 rounded-lg p-3">
                  <div className="space-y-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                        <span className="text-neutral-600 font-medium">Optimal</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono text-neutral-900">
                          {tv.levelOptimalMin !== null && tv.levelOptimalMax !== null
                            ? `${formatValue(tv.levelOptimalMin)} - ${formatValue(tv.levelOptimalMax)} ${unit}`
                            : 'N/A'}
                        </span>
                        {descriptions?.optimal && (
                          <p className="text-xs text-neutral-500 mt-0.5">{descriptions.optimal}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="w-2.5 h-2.5 rounded-full bg-lime-500"></span>
                        <span className="text-neutral-600 font-medium">Okay</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono text-neutral-900">
                          {tv.levelLow !== null && tv.levelOptimalMin !== null
                            ? `${formatValue(tv.levelLow)} - ${formatValue(tv.levelOptimalMin - decrementValue)} ${unit}`
                            : tv.levelLow !== null
                            ? `≥ ${formatValue(tv.levelLow)} ${unit}`
                            : 'N/A'}
                        </span>
                        {descriptions?.okay && (
                          <p className="text-xs text-neutral-500 mt-0.5">{descriptions.okay}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="w-2.5 h-2.5 rounded-full bg-yellow-500"></span>
                        <span className="text-neutral-600 font-medium">Low</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono text-neutral-900">
                          {tv.levelTooLow !== null && tv.levelLow !== null
                            ? `${formatValue(tv.levelTooLow)} - ${formatValue(tv.levelLow - decrementValue)} ${unit}`
                            : tv.levelTooLow !== null
                            ? `≥ ${formatValue(tv.levelTooLow)} ${unit}`
                            : 'N/A'}
                        </span>
                        {descriptions?.low && (
                          <p className="text-xs text-neutral-500 mt-0.5">{descriptions.low}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="w-2.5 h-2.5 rounded-full bg-neutral-400"></span>
                        <span className="text-neutral-600 font-medium">Too Low</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono text-neutral-900">
                          {tv.levelTooLow !== null
                            ? `< ${formatValue(tv.levelTooLow)} ${unit}`
                            : 'N/A'}
                        </span>
                        {descriptions?.tooLow && (
                          <p className="text-xs text-neutral-500 mt-0.5">{descriptions.tooLow}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>
                        <span className="text-neutral-600 font-medium">High</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono text-neutral-900">
                          {tv.levelHigh !== null && tv.levelDangerous !== null
                            ? `${formatValue(tv.levelHigh)} - ${formatValue(tv.levelDangerous - decrementValue)} ${unit}`
                            : tv.levelHigh !== null
                            ? `≥ ${formatValue(tv.levelHigh)} ${unit}`
                            : 'N/A'}
                        </span>
                        {descriptions?.high && (
                          <p className="text-xs text-neutral-500 mt-0.5">{descriptions.high}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-600"></span>
                        <span className="text-neutral-600 font-medium">Flood</span>
                      </div>
                      <div className="text-right">
                        <span className="font-mono text-neutral-900">
                          {tv.levelDangerous !== null
                            ? `≥ ${formatValue(tv.levelDangerous)} ${unit}`
                            : 'N/A'}
                        </span>
                        {descriptions?.flood && (
                          <p className="text-xs text-neutral-500 mt-0.5">{descriptions.flood}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Footer: Location + Updated in one compact row */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-neutral-500 mt-1">
            <span className="flex items-center gap-2">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
              {gauge.coordinates.lat.toFixed(5)}, {gauge.coordinates.lng.toFixed(5)}
            </span>
            {gauge.readingTimestamp && (
              <span className="flex items-center gap-2">
                <Clock className="w-3.5 h-3.5 flex-shrink-0" />
                Updated {new Date(gauge.readingTimestamp).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// FlowTrendChartWithDays removed — using shared FlowTrendChart from @/components/ui/FlowTrendChart
