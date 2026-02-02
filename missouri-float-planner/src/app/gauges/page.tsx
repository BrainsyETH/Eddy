'use client';

// src/app/gauges/page.tsx
// Dashboard-style gauge stations page with charts, filters, and engaging cards

import React, { useEffect, useState, useMemo } from 'react';
import Image from 'next/image';
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
  Flag
} from 'lucide-react';

import { computeCondition, getConditionTailwindColor, getConditionShortLabel, type ConditionThresholds } from '@/lib/conditions';
import type { GaugesResponse, GaugeStation } from '@/app/api/gauges/route';
import type { ConditionCode } from '@/types/api';
import { useGaugeHistory } from '@/hooks/useGaugeHistory';
import GaugeWeather from '@/components/ui/GaugeWeather';
import FeedbackModal from '@/components/ui/FeedbackModal';
import type { FeedbackContext } from '@/types/api';

const EDDY_FLOOD_IMAGE = 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_flood.png';

// Eddy otter images for different conditions
const EDDY_CONDITION_IMAGES: Record<string, string> = {
  green: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png',
  red: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_red.png',
  yellow: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_yellow.png',
  flag: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20with%20a%20flag.png',
};

// Map condition codes to Eddy images
const getEddyImageForCondition = (code: ConditionCode): string => {
  switch (code) {
    case 'optimal':
    case 'low': // "Okay - Floatable"
      return EDDY_CONDITION_IMAGES.green;
    case 'high':
    case 'dangerous': // Flood
      return EDDY_CONDITION_IMAGES.red;
    case 'very_low': // "Low - Scraping Likely"
      return EDDY_CONDITION_IMAGES.yellow;
    case 'too_low':
    case 'unknown':
    default:
      return EDDY_CONDITION_IMAGES.flag;
  }
};

// Date range options for charts
const DATE_RANGES = [
  { days: 7, label: '7 Days' },
  { days: 14, label: '14 Days' },
  { days: 30, label: '30 Days' },
];

// ONSR (Ozark National Scenic Riverways) rivers
const ONSR_RIVERS = ['current river', 'eleven point river', 'jacks fork river', 'jacks fork'];

// River-specific floating summaries (local knowledge - SAFETY FIRST)
const RIVER_SUMMARIES: Record<string, { title: string; summary: string; tip: string }> = {
  'current-river': {
    title: 'Current River',
    summary: 'The Akers gauge is the primary reference. 2.0–3.0 ft is optimal. The Current is spring-fed and forgiving, but above 3.5 ft conditions deteriorate. At 4.0 ft the river closes. Below 1.5 ft you\'ll drag in riffles. Van Buren (lower river) runs higher—optimal 3.0–4.0 ft, closes at 5.0 ft.',
    tip: 'Spring rains can cause rapid rises. If the gauge is climbing, consider another day. The upper Current (Montauk to Akers) needs slightly more water than lower sections.',
  },
  'eleven-point-river': {
    title: 'Eleven Point River',
    summary: 'The Bardley gauge (16 mi downstream from Greer) is the key reference. 3.0–3.5 ft is optimal. Average is ~3.0 ft. Above 4 ft we recommend another day—water gets murky and conditions deteriorate. At 5 ft, outfitters stop and Forest Service closes the river.',
    tip: 'Mid-June through mid-September offers the best floating with clear water. Spring rains (March–May) cause rapid rises and muddy conditions. When in doubt, wait it out.',
  },
  'jacks-fork-river': {
    title: 'Jacks Fork River',
    summary: 'The Jacks Fork is shallower and more rain-dependent. At Alley Spring (primary), 2.5–3.0 ft is ideal. Above 3.5 ft we recommend another day—river closes at 4.0 ft. Below 2.0 ft you\'ll drag with gear. At Eminence (lower), 2.0–3.0 ft is good; average is ~1.5 ft but may drag loaded.',
    tip: 'The Jacks Fork rises and falls FAST after rain. Flash floods are a serious concern. If rain is forecast or the gauge is rising, postpone your trip.',
  },
};

// Gauge-specific threshold descriptions (local knowledge)
// Keys are USGS site IDs
type ThresholdDescriptions = {
  tooLow: string;
  low: string;
  okay: string;
  optimal: string;
  high: string;
  flood: string;
};

const GAUGE_THRESHOLD_DESCRIPTIONS: Record<string, ThresholdDescriptions> = {
  // Doniphan - uses CFS thresholds due to datum issues
  '07068000': {
    tooLow: 'Genuinely scrapy, ~1,000 cfs',
    low: 'Floatable but slow, some dragging',
    okay: 'Decent conditions, typical summer levels',
    optimal: 'Good flow, 2,000-4,000 cfs, clear water likely',
    high: 'Fast and muddy, experienced only',
    flood: 'Dangerous conditions, do not float',
  },
  // Akers - primary Current River gauge
  '07064533': {
    tooLow: 'Significant dragging, walking your boat',
    low: 'May scrape in riffles, especially loaded',
    okay: 'Floatable with some dragging',
    optimal: 'Good floating, minimal dragging',
    high: 'River closes at NPS flood level',
    flood: 'Dangerous, river closed',
  },
  // Van Buren
  '07067000': {
    tooLow: 'Very shallow, not recommended',
    low: 'Marginal floating',
    okay: 'Floatable, just below average',
    optimal: 'Tubes best below 4.0, good floating',
    high: 'Motor vessels only beyond this',
    flood: 'Flood level, do not float',
  },
  // Montauk
  '07064440': {
    tooLow: 'Constant dragging, walking boat',
    low: 'Floatable but scrapy',
    okay: 'Decent, some dragging above Welch Spring',
    optimal: 'Sweet spot, avg 1.8 ft, best clarity',
    high: 'Fast and likely muddy',
    flood: 'Dangerous, rises extremely fast',
  },
  // Eleven Point - Bardley
  '07071500': {
    tooLow: 'Scraping likely, below avg 1.7 ft',
    low: 'Floatable but some dragging',
    okay: 'Decent conditions',
    optimal: 'Good floating, ideal range',
    high: 'Suggest another day, murky/muddy',
    flood: 'Forest Service closes, do not float',
  },
  // Jacks Fork - Alley Spring
  '07065200': {
    tooLow: 'Significant dragging',
    low: 'Some dragging expected',
    okay: 'Average level, minimal dragging',
    optimal: 'Good conditions',
    high: 'River closes here',
    flood: 'Flood level, dangerous',
  },
};

export default function GaugesPage() {
  const [gaugeData, setGaugeData] = useState<GaugesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedGaugeId, setExpandedGaugeId] = useState<string | null>(null);
  const [selectedRiver, setSelectedRiver] = useState<string>('all');
  const [selectedCondition, setSelectedCondition] = useState<ConditionCode | 'all'>('all');
  const [dateRange, setDateRange] = useState(7);
  const [onsrOnly, setOnsrOnly] = useState(true); // ONSR filter on by default
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);
  const [feedbackContext, setFeedbackContext] = useState<FeedbackContext | undefined>(undefined);

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
        // Filter by ONSR rivers (exclude unknown/empty river names)
        if (onsrOnly) {
          const primaryRiver = gauge.thresholds?.find(t => t.isPrimary) || gauge.thresholds?.[0];
          const riverName = primaryRiver?.riverName?.toLowerCase() || '';
          // Skip gauges with no river or unknown river
          if (!riverName || riverName === 'unknown' || riverName.includes('unknown')) return false;
          const isOnsr = ONSR_RIVERS.some(r => riverName.includes(r) || r.includes(riverName));
          if (!isOnsr) return false;
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
          very_low: 1,
          low: 2,
          optimal: 3,
          high: 4,
          dangerous: 5,
          unknown: 6,
        };
        return conditionOrder[a.condition.code] - conditionOrder[b.condition.code];
      });
  }, [gaugeData, selectedRiver, selectedCondition, onsrOnly]);

  // Calculate stats for overview cards
  const stats = useMemo(() => {
    if (!gaugeData?.gauges) return { total: 0, optimal: 0, okay: 0, low: 0, tooLow: 0, high: 0, flood: 0 };

    const counts = { total: 0, optimal: 0, okay: 0, low: 0, high: 0, flood: 0, tooLow: 0 };
    gaugeData.gauges.forEach(gauge => {
      counts.total++;
      const condition = getCondition(gauge);
      switch (condition.code) {
        case 'optimal': counts.optimal++; break;
        case 'low': counts.okay++; break;
        case 'very_low': counts.low++; break;
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

  // Clear all filters (ONSR stays on by default)
  const clearFilters = () => {
    setSelectedRiver('all');
    setSelectedCondition('all');
    setOnsrOnly(true);
  };

  const hasActiveFilters = selectedRiver !== 'all' || selectedCondition !== 'all' || !onsrOnly;

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

  // Get river summary if a specific river is selected
  const selectedRiverSummary = useMemo(() => {
    if (selectedRiver === 'all') return null;

    // Find the river name from the rivers list
    const riverEntry = rivers.find(([id]) => id === selectedRiver);
    if (!riverEntry) return null;

    const riverName = riverEntry[1];

    // Convert river name to slug format for lookup
    const slug = riverName.toLowerCase().replace(/\s+/g, '-');

    return RIVER_SUMMARIES[slug] || null;
  }, [selectedRiver, rivers]);

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
              src={EDDY_FLOOD_IMAGE}
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

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-4 py-6 md:py-8">
        {loading ? (
          <div className="bg-white border-2 border-neutral-200 rounded-2xl p-12 text-center shadow-sm">
            <div className="inline-block w-10 h-10 border-4 border-neutral-300 border-t-primary-500 rounded-full animate-spin"></div>
            <p className="text-neutral-600 mt-4 font-medium">Loading gauge stations...</p>
          </div>
        ) : (
          <>
            {/* Stats Overview - Large colorful cards on desktop */}
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2 md:gap-3 mb-6">
              <button
                onClick={() => setSelectedCondition(selectedCondition === 'too_low' ? 'all' : 'too_low')}
                className={`group relative overflow-hidden rounded-xl p-3 md:p-4 text-center transition-all hover:scale-105 ${
                  selectedCondition === 'too_low'
                    ? 'bg-neutral-600 text-white shadow-lg shadow-neutral-500/20 ring-2 ring-neutral-400'
                    : 'bg-white hover:shadow-lg border border-neutral-200'
                }`}
              >
                <div className={`absolute inset-0 bg-gradient-to-br from-neutral-400/20 to-transparent ${selectedCondition !== 'too_low' ? 'opacity-0 group-hover:opacity-100' : ''} transition-opacity`} />
                <span className={`block text-3xl md:text-4xl font-bold ${selectedCondition === 'too_low' ? 'text-white' : 'text-neutral-600'}`}>{stats.tooLow}</span>
                <span className={`block text-xs font-semibold mt-1 ${selectedCondition === 'too_low' ? 'text-neutral-200' : 'text-neutral-500'}`}>Too Low</span>
              </button>

              <button
                onClick={() => setSelectedCondition(selectedCondition === 'very_low' ? 'all' : 'very_low')}
                className={`group relative overflow-hidden rounded-xl p-3 md:p-4 text-center transition-all hover:scale-105 ${
                  selectedCondition === 'very_low'
                    ? 'bg-yellow-500 text-white shadow-lg shadow-yellow-500/20 ring-2 ring-yellow-400'
                    : 'bg-white hover:shadow-lg border border-neutral-200'
                }`}
              >
                <div className={`absolute inset-0 bg-gradient-to-br from-yellow-400/20 to-transparent ${selectedCondition !== 'very_low' ? 'opacity-0 group-hover:opacity-100' : ''} transition-opacity`} />
                <span className={`block text-3xl md:text-4xl font-bold ${selectedCondition === 'very_low' ? 'text-white' : 'text-yellow-600'}`}>{stats.low}</span>
                <span className={`block text-xs font-semibold mt-1 ${selectedCondition === 'very_low' ? 'text-yellow-100' : 'text-neutral-500'}`}>Low</span>
              </button>

              <button
                onClick={() => setSelectedCondition(selectedCondition === 'low' ? 'all' : 'low')}
                className={`group relative overflow-hidden rounded-xl p-3 md:p-4 text-center transition-all hover:scale-105 ${
                  selectedCondition === 'low'
                    ? 'bg-lime-500 text-white shadow-lg shadow-lime-500/20 ring-2 ring-lime-400'
                    : 'bg-white hover:shadow-lg border border-neutral-200'
                }`}
              >
                <div className={`absolute inset-0 bg-gradient-to-br from-lime-400/20 to-transparent ${selectedCondition !== 'low' ? 'opacity-0 group-hover:opacity-100' : ''} transition-opacity`} />
                <span className={`block text-3xl md:text-4xl font-bold ${selectedCondition === 'low' ? 'text-white' : 'text-lime-600'}`}>{stats.okay}</span>
                <span className={`block text-xs font-semibold mt-1 ${selectedCondition === 'low' ? 'text-lime-100' : 'text-neutral-500'}`}>Okay</span>
              </button>

              <button
                onClick={() => setSelectedCondition(selectedCondition === 'optimal' ? 'all' : 'optimal')}
                className={`group relative overflow-hidden rounded-xl p-3 md:p-4 text-center transition-all hover:scale-105 ${
                  selectedCondition === 'optimal'
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-500/20 ring-2 ring-emerald-400'
                    : 'bg-white hover:shadow-lg border border-neutral-200'
                }`}
              >
                <div className={`absolute inset-0 bg-gradient-to-br from-emerald-400/20 to-transparent ${selectedCondition !== 'optimal' ? 'opacity-0 group-hover:opacity-100' : ''} transition-opacity`} />
                <span className={`block text-3xl md:text-4xl font-bold ${selectedCondition === 'optimal' ? 'text-white' : 'text-emerald-600'}`}>{stats.optimal}</span>
                <span className={`block text-xs font-semibold mt-1 ${selectedCondition === 'optimal' ? 'text-emerald-100' : 'text-neutral-500'}`}>Optimal</span>
              </button>

              <button
                onClick={() => setSelectedCondition(selectedCondition === 'high' ? 'all' : 'high')}
                className={`group relative overflow-hidden rounded-xl p-3 md:p-4 text-center transition-all hover:scale-105 ${
                  selectedCondition === 'high'
                    ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20 ring-2 ring-orange-400'
                    : 'bg-white hover:shadow-lg border border-neutral-200'
                }`}
              >
                <div className={`absolute inset-0 bg-gradient-to-br from-orange-400/20 to-transparent ${selectedCondition !== 'high' ? 'opacity-0 group-hover:opacity-100' : ''} transition-opacity`} />
                <span className={`block text-3xl md:text-4xl font-bold ${selectedCondition === 'high' ? 'text-white' : 'text-orange-600'}`}>{stats.high}</span>
                <span className={`block text-xs font-semibold mt-1 ${selectedCondition === 'high' ? 'text-orange-100' : 'text-neutral-500'}`}>High</span>
              </button>

              <button
                onClick={() => setSelectedCondition(selectedCondition === 'dangerous' ? 'all' : 'dangerous')}
                className={`group relative overflow-hidden rounded-xl p-3 md:p-4 text-center transition-all hover:scale-105 ${
                  selectedCondition === 'dangerous'
                    ? 'bg-red-600 text-white shadow-lg shadow-red-500/20 ring-2 ring-red-400'
                    : 'bg-white hover:shadow-lg border border-neutral-200'
                }`}
              >
                <div className={`absolute inset-0 bg-gradient-to-br from-red-400/20 to-transparent ${selectedCondition !== 'dangerous' ? 'opacity-0 group-hover:opacity-100' : ''} transition-opacity`} />
                <span className={`block text-3xl md:text-4xl font-bold ${selectedCondition === 'dangerous' ? 'text-white' : 'text-red-600'}`}>{stats.flood}</span>
                <span className={`block text-xs font-semibold mt-1 ${selectedCondition === 'dangerous' ? 'text-red-100' : 'text-neutral-500'}`}>Flood</span>
              </button>
            </div>

            {/* Filter Bar */}
            <div className="bg-white border-2 border-neutral-200 rounded-xl p-4 mb-6">
              <div className="flex flex-wrap items-center justify-center gap-4">
                {/* River filter */}
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-neutral-600">River:</label>
                  <select
                    value={selectedRiver}
                    onChange={(e) => setSelectedRiver(e.target.value)}
                    className="px-3 py-2 border border-neutral-300 rounded-lg text-sm focus:ring-2 focus:ring-primary-500 focus:border-primary-500"
                  >
                    <option value="all">All Rivers</option>
                    {rivers.map(([id, name]) => (
                      <option key={id} value={id}>{name}</option>
                    ))}
                  </select>
                </div>

                {/* ONSR Toggle */}
                <button
                  onClick={() => setOnsrOnly(!onsrOnly)}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all ${
                    onsrOnly
                      ? 'bg-[#7B2D3B] text-white shadow-md'
                      : 'bg-neutral-100 text-neutral-600 hover:bg-neutral-200'
                  }`}
                  title="Ozark National Scenic Riverways - Current, Eleven Point, Jacks Fork"
                >
                  ONSR
                </button>

                {/* Date range for charts */}
                <div className="flex rounded-lg border border-neutral-300 overflow-hidden">
                  {DATE_RANGES.map(range => (
                    <button
                      key={range.days}
                      onClick={() => setDateRange(range.days)}
                      className={`px-3 py-2 text-sm font-medium transition-colors ${
                        dateRange === range.days
                          ? 'bg-primary-500 text-white'
                          : 'bg-white text-neutral-600 hover:bg-neutral-50'
                      }`}
                    >
                      {range.label}
                    </button>
                  ))}
                </div>

                {/* Clear filters */}
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
                  >
                    <X className="w-4 h-4" />
                    Clear Filters
                  </button>
                )}
              </div>
            </div>

            {/* River Summary (when specific river selected) */}
            {selectedRiverSummary && (
              <div className="bg-gradient-to-r from-primary-50 to-accent-50 border-2 border-primary-200 rounded-xl p-5 mb-6">
                <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 bg-primary-500 rounded-full flex items-center justify-center">
                    <Droplets className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-neutral-900 mb-1">
                      {selectedRiverSummary.title} — Local Knowledge
                    </h3>
                    <p className="text-sm text-neutral-700 mb-2">
                      {selectedRiverSummary.summary}
                    </p>
                    <p className="text-xs text-primary-700 bg-primary-100 rounded-lg px-3 py-1.5 inline-block">
                      <span className="font-semibold">💡 Tip:</span> {selectedRiverSummary.tip}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Gauge Cards Grid */}
            {processedGauges.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {processedGauges.map((gauge) => {
                  const isExpanded = expandedGaugeId === gauge.id;
                  const ageText = getAgeText(gauge);

                  return (
                    <div
                      key={gauge.id}
                      className={`bg-white rounded-2xl overflow-hidden transition-all duration-200 ${
                        isExpanded
                          ? 'border-2 border-primary-400 shadow-xl col-span-1 md:col-span-2 xl:col-span-3'
                          : 'border border-neutral-200 hover:border-neutral-300 hover:shadow-lg'
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
                              <span className="text-sm font-medium text-neutral-600">
                                {gauge.primaryRiver?.riverName || 'Unknown River'}
                              </span>
                            </div>

                            {/* Gauge Name */}
                            <h3 className="text-lg font-bold text-neutral-900 mb-1">{gauge.name}</h3>

                            {/* USGS ID + Age */}
                            <div className="flex items-center gap-3 text-xs text-neutral-500">
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

                          {/* Large Water Level Display */}
                          <div className="flex flex-col items-end text-right flex-shrink-0">
                            {gauge.gaugeHeightFt !== null && (
                              <div className="flex items-baseline gap-1">
                                <span className="text-3xl md:text-4xl font-bold text-neutral-900">{gauge.gaugeHeightFt.toFixed(2)}</span>
                                <span className="text-sm font-medium text-neutral-500">ft</span>
                              </div>
                            )}
                            {gauge.dischargeCfs !== null && (
                              <div className="text-sm text-neutral-500 mt-1">
                                {gauge.dischargeCfs.toLocaleString()} cfs
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Expand indicator and Report Issue */}
                        <div className="flex items-center justify-between mt-4 pt-3 border-t border-neutral-100">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openFeedbackModal(gauge);
                            }}
                            className="text-xs text-neutral-400 hover:text-accent-500 flex items-center gap-1 transition-colors"
                          >
                            <Flag className="w-3 h-3" />
                            Report Issue
                          </button>
                          <span className="text-xs font-medium text-neutral-500 flex items-center gap-1.5 group-hover:text-primary-600 transition-colors">
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

                      {/* Expanded Content */}
                      {isExpanded && (
                        <div className="border-t-2 border-neutral-100 p-4 bg-neutral-50">
                          {/* Top Row: Weather (left) + Current Readings (right) - matching widths */}
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                            {/* Left Column - Weather */}
                            <div>
                              <GaugeWeather
                                lat={gauge.coordinates.lat}
                                lon={gauge.coordinates.lng}
                                enabled={isExpanded}
                              />
                            </div>

                            {/* Right Column - Current Readings */}
                            <div>
                              <h4 className="text-sm font-semibold text-neutral-700 mb-3 flex items-center gap-2">
                                <Activity className="w-4 h-4" />
                                Current Readings
                              </h4>
                              <div className="grid grid-cols-3 gap-3">
                                <div className="bg-white border border-neutral-200 rounded-lg p-3">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Droplets className="w-4 h-4 text-primary-600" />
                                    <span className="text-xs font-medium text-neutral-500 uppercase">Stage</span>
                                  </div>
                                  <div className="text-2xl font-bold text-neutral-900">
                                    {gauge.gaugeHeightFt !== null ? `${gauge.gaugeHeightFt.toFixed(2)} ft` : 'N/A'}
                                  </div>
                                </div>
                                <div className="bg-white border border-neutral-200 rounded-lg p-3">
                                  <div className="flex items-center gap-2 mb-1">
                                    <Activity className="w-4 h-4 text-primary-600" />
                                    <span className="text-xs font-medium text-neutral-500 uppercase">Flow</span>
                                  </div>
                                  <div className="text-2xl font-bold text-neutral-900">
                                    {gauge.dischargeCfs !== null ? `${gauge.dischargeCfs.toLocaleString()} cfs` : 'N/A'}
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
                            </div>
                          </div>

                          {/* Bottom Row: Chart (left) + Thresholds/Details (right) */}
                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            {/* Left Column - Chart */}
                            <div>
                              <h4 className="text-sm font-semibold text-neutral-700 mb-3 flex items-center gap-2">
                                <TrendingUp className="w-4 h-4" />
                                {dateRange}-Day Flow Trend
                              </h4>
                              <div className="bg-neutral-900 rounded-xl overflow-hidden">
                                <FlowTrendChartWithDays gaugeSiteId={gauge.usgsSiteId} days={dateRange} />
                              </div>
                            </div>

                            {/* Right Column - Details */}
                            <div className="space-y-4">

                              {/* Thresholds */}
                              {gauge.primaryRiver && (() => {
                                const unit = gauge.primaryRiver.thresholdUnit === 'cfs' ? 'cfs' : 'ft';
                                const formatValue = (val: number | null) => {
                                  if (val === null) return null;
                                  return unit === 'cfs' ? val.toLocaleString() : val.toFixed(2);
                                };
                                const descriptions = GAUGE_THRESHOLD_DESCRIPTIONS[gauge.usgsSiteId];
                                return (
                                <div>
                                  <h4 className="text-sm font-semibold text-neutral-700 mb-3">
                                    Thresholds for {gauge.primaryRiver.riverName}
                                    {unit === 'cfs' && <span className="ml-2 text-xs font-normal text-primary-600">(using flow)</span>}
                                  </h4>
                                  <div className="bg-white border border-neutral-200 rounded-lg p-3">
                                    <div className="space-y-3 text-sm">
                                      <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-2 flex-shrink-0">
                                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                                          <span className="text-neutral-600 font-medium">Optimal</span>
                                        </div>
                                        <div className="text-right">
                                          <span className="font-mono text-neutral-900">
                                            {gauge.primaryRiver.levelOptimalMin !== null && gauge.primaryRiver.levelOptimalMax !== null
                                              ? `${formatValue(gauge.primaryRiver.levelOptimalMin)} - ${formatValue(gauge.primaryRiver.levelOptimalMax)} ${unit}`
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
                                            {gauge.primaryRiver.levelLow !== null && gauge.primaryRiver.levelOptimalMin !== null
                                              ? `${formatValue(gauge.primaryRiver.levelLow)} - ${formatValue(unit === 'cfs' ? gauge.primaryRiver.levelOptimalMin - 1 : gauge.primaryRiver.levelOptimalMin - 0.01)} ${unit}`
                                              : gauge.primaryRiver.levelLow !== null
                                              ? `≥ ${formatValue(gauge.primaryRiver.levelLow)} ${unit}`
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
                                            {gauge.primaryRiver.levelTooLow !== null && gauge.primaryRiver.levelLow !== null
                                              ? `${formatValue(gauge.primaryRiver.levelTooLow)} - ${formatValue(unit === 'cfs' ? gauge.primaryRiver.levelLow - 1 : gauge.primaryRiver.levelLow - 0.01)} ${unit}`
                                              : gauge.primaryRiver.levelTooLow !== null
                                              ? `≥ ${formatValue(gauge.primaryRiver.levelTooLow)} ${unit}`
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
                                            {gauge.primaryRiver.levelTooLow !== null
                                              ? `< ${formatValue(gauge.primaryRiver.levelTooLow)} ${unit}`
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
                                            {gauge.primaryRiver.levelHigh !== null && gauge.primaryRiver.levelDangerous !== null
                                              ? `${formatValue(gauge.primaryRiver.levelHigh)} - ${formatValue(unit === 'cfs' ? gauge.primaryRiver.levelDangerous - 1 : gauge.primaryRiver.levelDangerous - 0.01)} ${unit}`
                                              : gauge.primaryRiver.levelHigh !== null
                                              ? `≥ ${formatValue(gauge.primaryRiver.levelHigh)} ${unit}`
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
                                            {gauge.primaryRiver.levelDangerous !== null
                                              ? `≥ ${formatValue(gauge.primaryRiver.levelDangerous)} ${unit}`
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

                              {/* Location */}
                              <div className="flex items-center gap-2 text-xs text-neutral-500">
                                <MapPin className="w-3.5 h-3.5" />
                                <span>{gauge.coordinates.lat.toFixed(5)}, {gauge.coordinates.lng.toFixed(5)}</span>
                              </div>

                              {/* Last Updated */}
                              {gauge.readingTimestamp && (
                                <div className="flex items-center gap-2 text-xs text-neutral-500">
                                  <Clock className="w-3.5 h-3.5" />
                                  <span>
                                    Updated {new Date(gauge.readingTimestamp).toLocaleString('en-US', {
                                      month: 'short',
                                      day: 'numeric',
                                      hour: 'numeric',
                                      minute: '2-digit',
                                    })}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
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

      {/* Footer */}
      <footer className="bg-primary-800 border-t-2 border-neutral-900 px-4 py-8 mt-12">
        <div className="max-w-6xl mx-auto text-center">
          <p className="text-primary-200 mb-2">
            Eddy &middot; Missouri River Float Trip Planner
          </p>
          <p className="text-sm text-primary-300">
            Water data from USGS &middot; Updated hourly
          </p>
        </div>
      </footer>

      {/* Feedback Modal */}
      <FeedbackModal
        isOpen={feedbackModalOpen}
        onClose={() => setFeedbackModalOpen(false)}
        context={feedbackContext}
      />
    </div>
  );
}

// Wrapper component to use the hook with custom days
function FlowTrendChartWithDays({ gaugeSiteId, days }: { gaugeSiteId: string; days: number }) {
  const { data: history, isLoading, error } = useGaugeHistory(gaugeSiteId, days);

  // Process data for the chart
  const chartData = useMemo(() => {
    if (!history?.readings || history.readings.length === 0) return null;

    const readings = history.readings;
    const stats = history.stats;

    // Get min/max for scaling
    const minVal = stats.minDischarge ?? 0;
    const maxVal = stats.maxDischarge ?? 100;
    const range = maxVal - minVal || 1;

    // Sample points for the SVG path (max ~50 points for smooth chart)
    const sampleStep = Math.max(1, Math.floor(readings.length / 50));
    const sampledReadings = readings.filter((_: unknown, i: number) => i % sampleStep === 0);

    // Generate SVG path points
    const points = sampledReadings.map((reading: { dischargeCfs: number | null; timestamp: string }, index: number) => {
      const x = (index / (sampledReadings.length - 1)) * 100;
      const y = reading.dischargeCfs !== null
        ? 100 - ((reading.dischargeCfs - minVal) / range) * 100
        : 50;
      return { x, y, value: reading.dischargeCfs, timestamp: reading.timestamp };
    });

    // Create SVG path
    const pathD = points.map((p: { x: number; y: number }, i: number) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    // Create area path (fill under the line)
    const areaD = `${pathD} L ${points[points.length - 1].x} 100 L ${points[0].x} 100 Z`;

    return {
      points,
      pathD,
      areaD,
      minVal,
      maxVal,
      currentVal: readings[readings.length - 1]?.dischargeCfs,
      startDate: new Date(readings[0].timestamp),
      endDate: new Date(readings[readings.length - 1].timestamp),
    };
  }, [history]);

  if (isLoading) {
    return (
      <div className="p-4">
        <div className="flex items-center gap-2 text-neutral-400 text-sm">
          <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
          Loading trend data...
        </div>
      </div>
    );
  }

  if (error || !chartData) {
    return (
      <div className="p-4">
        <p className="text-neutral-400 text-sm">Flow trend data unavailable</p>
      </div>
    );
  }

  // Format numbers for display
  const formatCfs = (val: number) => {
    if (val >= 1000) return `${(val / 1000).toFixed(1)}k`;
    return val.toFixed(0);
  };

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-semibold text-white">Flow (cfs)</span>
        {chartData.currentVal !== null && (
          <span className="text-xs text-primary-400 font-medium">
            Current: {formatCfs(chartData.currentVal)} cfs
          </span>
        )}
      </div>

      {/* SVG Chart */}
      <div className="relative h-32">
        <svg
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          className="w-full h-full"
        >
          {/* Gradient fill */}
          <defs>
            <linearGradient id={`flowGradient-${gaugeSiteId}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgb(45, 120, 137)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="rgb(45, 120, 137)" stopOpacity="0.05" />
            </linearGradient>
          </defs>

          {/* Area fill */}
          <path d={chartData.areaD} fill={`url(#flowGradient-${gaugeSiteId})`} />

          {/* Line */}
          <path
            d={chartData.pathD}
            fill="none"
            stroke="rgb(45, 120, 137)"
            strokeWidth="2"
            vectorEffect="non-scaling-stroke"
          />

          {/* Current value dot */}
          {chartData.points.length > 0 && (
            <circle
              cx={chartData.points[chartData.points.length - 1].x}
              cy={chartData.points[chartData.points.length - 1].y}
              r="4"
              fill="rgb(45, 120, 137)"
              stroke="white"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {/* Y-axis labels */}
        <div className="absolute left-0 top-0 bottom-0 flex flex-col justify-between text-[10px] text-neutral-400 -ml-1">
          <span>{formatCfs(chartData.maxVal)}</span>
          <span>{formatCfs(chartData.minVal)}</span>
        </div>
      </div>

      {/* X-axis labels */}
      <div className="flex justify-between text-[10px] text-neutral-400 mt-1 px-2">
        <span>{formatDate(chartData.startDate)}</span>
        <span>{formatDate(chartData.endDate)}</span>
      </div>
    </div>
  );
}
