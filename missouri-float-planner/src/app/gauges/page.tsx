'use client';

// src/app/gauges/page.tsx
// Dashboard-style gauge stations page with charts, filters, and engaging cards

import React, { useEffect, useState, useMemo } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Droplets,
  MapPin,
  Clock,
  ExternalLink,
  Activity,
  Gauge as GaugeIcon,
  TrendingUp,
  BarChart3,
  X
} from 'lucide-react';
import { computeCondition, getConditionTailwindColor, getConditionShortLabel, type ConditionThresholds } from '@/lib/conditions';
import type { GaugesResponse, GaugeStation } from '@/app/api/gauges/route';
import type { ConditionCode } from '@/types/api';
import { useGaugeHistory } from '@/hooks/useGaugeHistory';

// Date range options for charts
const DATE_RANGES = [
  { days: 7, label: '7 Days' },
  { days: 14, label: '14 Days' },
  { days: 30, label: '30 Days' },
];

// River-specific floating summaries (local knowledge)
const RIVER_SUMMARIES: Record<string, { title: string; summary: string; tip: string }> = {
  'current-river': {
    title: 'Current River',
    summary: 'Most floaters agree that anything above 2.0 ft at Akers is good to go. The Current is spring-fed, so it rarely gets too low for a fun float. Below 1.5 ft you\'ll be dragging in the riffles.',
    tip: 'The upper Current (Montauk to Akers) needs slightly more water than the lower sections.',
  },
  'eleven-point-river': {
    title: 'Eleven Point River',
    summary: 'A gem of the Ozarks with reliable spring flow. Most consider 2.5 ft and above at Bardley ideal. It\'s floatable down to about 2.0 ft, but expect some scraping on gravel bars.',
    tip: 'The Eleven Point has excellent water clarity—great for spotting wildlife and fish.',
  },
  'jacks-fork-river': {
    title: 'Jacks Fork River',
    summary: 'The Jacks Fork is shallower than the Current and more rain-dependent. At Alley Spring (primary gauge), 2.5–3.5 ft is ideal; below 2.0 ft you\'ll drag with gear, below 1.5 ft is tough even with an empty canoe. At Eminence (lower), 2.0–3.5 ft is good; ~1.5 ft is average but may drag loaded. River closes when Alley Spring hits 3.65 ft or Eminence hits 4.0 ft.',
    tip: 'The Jacks Fork rises and falls fast after rain. The upper sections near Mountain View need higher water. The Eminence gauge is useful for lower sections near Two Rivers.',
  },
};

export default function GaugesPage() {
  const [gaugeData, setGaugeData] = useState<GaugesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedGaugeId, setExpandedGaugeId] = useState<string | null>(null);
  const [selectedRiver, setSelectedRiver] = useState<string>('all');
  const [selectedCondition, setSelectedCondition] = useState<ConditionCode | 'all'>('all');
  const [dateRange, setDateRange] = useState(7);

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

  // Helper to get condition from gauge height and thresholds
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
    };

    const result = computeCondition(gauge.gaugeHeightFt, thresholdsForCompute);
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
        // Filter by river
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
        // Sort by condition priority (optimal first, then okay, etc.)
        const conditionOrder: Record<ConditionCode, number> = {
          optimal: 0,
          low: 1,
          very_low: 2,
          high: 3,
          too_low: 4,
          dangerous: 5,
          unknown: 6,
        };
        return conditionOrder[a.condition.code] - conditionOrder[b.condition.code];
      });
  }, [gaugeData, selectedRiver, selectedCondition]);

  // Calculate stats for overview cards
  const stats = useMemo(() => {
    if (!gaugeData?.gauges) return { total: 0, optimal: 0, okay: 0, low: 0, high: 0, flood: 0 };

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

  // Clear all filters
  const clearFilters = () => {
    setSelectedRiver('all');
    setSelectedCondition('all');
  };

  const hasActiveFilters = selectedRiver !== 'all' || selectedCondition !== 'all';

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
    <div className="min-h-screen bg-neutral-50">
      {/* Hero */}
      <section
        className="relative py-12 md:py-16 text-white"
        style={{ background: 'linear-gradient(to bottom right, #0F2D35, #163F4A, #0F2D35)' }}
      >
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-center gap-4 mb-4">
            <GaugeIcon className="w-10 h-10" style={{ color: '#F07052' }} />
            <h1
              className="text-3xl md:text-4xl font-bold"
              style={{ fontFamily: 'var(--font-display)', color: '#F07052' }}
            >
              Gauge Dashboard
            </h1>
          </div>
          <p className="text-base text-white/80 max-w-2xl mx-auto text-center">
            Real-time water levels and flow trends from USGS gauges across Missouri rivers.
          </p>
        </div>
      </section>

      {/* Main content */}
      <div className="max-w-6xl mx-auto px-4 py-8">
        {loading ? (
          <div className="bg-white border-2 border-neutral-200 rounded-xl p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-neutral-300 border-t-primary-500 rounded-full animate-spin"></div>
            <p className="text-neutral-600 mt-4">Loading gauge stations...</p>
          </div>
        ) : (
          <>
            {/* Stats Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
              <button
                onClick={() => setSelectedCondition('all')}
                className={`bg-white border-2 rounded-xl p-4 text-center transition-all hover:shadow-md ${
                  selectedCondition === 'all' ? 'border-primary-500 ring-2 ring-primary-200' : 'border-neutral-200'
                }`}
              >
                <div className="flex items-center justify-center gap-2 mb-1">
                  <BarChart3 className="w-5 h-5 text-neutral-500" />
                  <span className="text-2xl font-bold text-neutral-900">{stats.total}</span>
                </div>
                <p className="text-xs text-neutral-500 font-medium">Total Gauges</p>
              </button>

              <button
                onClick={() => setSelectedCondition('optimal')}
                className={`bg-white border-2 rounded-xl p-4 text-center transition-all hover:shadow-md ${
                  selectedCondition === 'optimal' ? 'border-emerald-500 ring-2 ring-emerald-200' : 'border-neutral-200'
                }`}
              >
                <div className="flex items-center justify-center gap-2 mb-1">
                  <span className="w-3 h-3 rounded-full bg-emerald-600"></span>
                  <span className="text-2xl font-bold text-emerald-600">{stats.optimal}</span>
                </div>
                <p className="text-xs text-neutral-500 font-medium">Optimal</p>
              </button>

              <button
                onClick={() => setSelectedCondition('low')}
                className={`bg-white border-2 rounded-xl p-4 text-center transition-all hover:shadow-md ${
                  selectedCondition === 'low' ? 'border-lime-500 ring-2 ring-lime-200' : 'border-neutral-200'
                }`}
              >
                <div className="flex items-center justify-center gap-2 mb-1">
                  <span className="w-3 h-3 rounded-full bg-lime-500"></span>
                  <span className="text-2xl font-bold text-lime-600">{stats.okay}</span>
                </div>
                <p className="text-xs text-neutral-500 font-medium">Okay</p>
              </button>

              <button
                onClick={() => setSelectedCondition('very_low')}
                className={`bg-white border-2 rounded-xl p-4 text-center transition-all hover:shadow-md ${
                  selectedCondition === 'very_low' ? 'border-yellow-500 ring-2 ring-yellow-200' : 'border-neutral-200'
                }`}
              >
                <div className="flex items-center justify-center gap-2 mb-1">
                  <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                  <span className="text-2xl font-bold text-yellow-600">{stats.low}</span>
                </div>
                <p className="text-xs text-neutral-500 font-medium">Low</p>
              </button>

              <button
                onClick={() => setSelectedCondition('high')}
                className={`bg-white border-2 rounded-xl p-4 text-center transition-all hover:shadow-md ${
                  selectedCondition === 'high' ? 'border-orange-500 ring-2 ring-orange-200' : 'border-neutral-200'
                }`}
              >
                <div className="flex items-center justify-center gap-2 mb-1">
                  <span className="w-3 h-3 rounded-full bg-orange-500"></span>
                  <span className="text-2xl font-bold text-orange-600">{stats.high}</span>
                </div>
                <p className="text-xs text-neutral-500 font-medium">High</p>
              </button>

              <button
                onClick={() => setSelectedCondition('dangerous')}
                className={`bg-white border-2 rounded-xl p-4 text-center transition-all hover:shadow-md ${
                  selectedCondition === 'dangerous' ? 'border-red-500 ring-2 ring-red-200' : 'border-neutral-200'
                }`}
              >
                <div className="flex items-center justify-center gap-2 mb-1">
                  <span className="w-3 h-3 rounded-full bg-red-600"></span>
                  <span className="text-2xl font-bold text-red-600">{stats.flood}</span>
                </div>
                <p className="text-xs text-neutral-500 font-medium">Flood</p>
              </button>
            </div>

            {/* Filter Bar */}
            <div className="bg-white border-2 border-neutral-200 rounded-xl p-4 mb-6">
              <div className="flex flex-wrap items-center gap-4">
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

                {/* Date range for charts */}
                <div className="flex items-center gap-2">
                  <label className="text-sm font-medium text-neutral-600">Chart Range:</label>
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

                {/* Results count */}
                <div className="ml-auto text-sm text-neutral-500">
                  Showing {processedGauges.length} of {stats.total} gauges
                </div>
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {processedGauges.map((gauge) => {
                  const isExpanded = expandedGaugeId === gauge.id;
                  const ageText = getAgeText(gauge);

                  return (
                    <div
                      key={gauge.id}
                      className={`bg-white border-2 rounded-xl overflow-hidden transition-all ${
                        isExpanded ? 'border-primary-400 shadow-lg col-span-1 md:col-span-2 lg:col-span-3' : 'border-neutral-200 hover:border-neutral-300 hover:shadow-md'
                      }`}
                    >
                      {/* Card Header */}
                      <button
                        onClick={() => setExpandedGaugeId(isExpanded ? null : gauge.id)}
                        className="w-full p-4 text-left"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            {/* Condition Badge */}
                            <div className="flex items-center gap-2 mb-2">
                              <span className={`px-3 py-1 rounded-full text-xs font-bold text-white ${gauge.condition.tailwindColor}`}>
                                {gauge.condition.label}
                              </span>
                              {ageText && (
                                <span className="text-xs text-neutral-400">{ageText}</span>
                              )}
                            </div>

                            {/* Gauge Name */}
                            <h3 className="font-bold text-neutral-900 truncate">{gauge.name}</h3>

                            {/* River & ID */}
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-neutral-500">
                                {gauge.primaryRiver?.riverName || 'Unknown River'}
                              </span>
                              <span className="text-neutral-300">•</span>
                              <a
                                href={`https://waterdata.usgs.gov/monitoring-location/${gauge.usgsSiteId}/`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs text-primary-600 hover:text-primary-700 font-mono flex items-center gap-1"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {gauge.usgsSiteId}
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            </div>
                          </div>

                          {/* Stats */}
                          <div className="flex flex-col items-end gap-1 text-right flex-shrink-0">
                            {gauge.gaugeHeightFt !== null && (
                              <div>
                                <span className="text-lg font-bold text-neutral-900">{gauge.gaugeHeightFt.toFixed(2)}</span>
                                <span className="text-xs text-neutral-500 ml-1">ft</span>
                              </div>
                            )}
                            {gauge.dischargeCfs !== null && (
                              <div className="text-xs text-neutral-500">
                                {gauge.dischargeCfs.toLocaleString()} cfs
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Expand indicator */}
                        <div className="flex items-center justify-center mt-3 pt-3 border-t border-neutral-100">
                          <span className="text-xs text-neutral-400 flex items-center gap-1">
                            {isExpanded ? (
                              <>
                                <ChevronUp className="w-4 h-4" />
                                Hide Details
                              </>
                            ) : (
                              <>
                                <ChevronDown className="w-4 h-4" />
                                View Chart & Details
                              </>
                            )}
                          </span>
                        </div>
                      </button>

                      {/* Expanded Content */}
                      {isExpanded && (
                        <div className="border-t-2 border-neutral-100 p-4 bg-neutral-50">
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
                              {/* Current Readings */}
                              <div>
                                <h4 className="text-sm font-semibold text-neutral-700 mb-3 flex items-center gap-2">
                                  <Activity className="w-4 h-4" />
                                  Current Readings
                                </h4>
                                <div className="grid grid-cols-2 gap-3">
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
                                </div>
                              </div>

                              {/* Thresholds */}
                              {gauge.primaryRiver && (
                                <div>
                                  <h4 className="text-sm font-semibold text-neutral-700 mb-3">
                                    Thresholds for {gauge.primaryRiver.riverName}
                                  </h4>
                                  <div className="bg-white border border-neutral-200 rounded-lg p-3">
                                    <div className="space-y-2 text-sm">
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                                          <span className="text-neutral-600">Optimal</span>
                                        </div>
                                        <span className="font-mono text-neutral-900">
                                          {gauge.primaryRiver.levelOptimalMin !== null && gauge.primaryRiver.levelOptimalMax !== null
                                            ? `${gauge.primaryRiver.levelOptimalMin} - ${gauge.primaryRiver.levelOptimalMax} ft`
                                            : 'N/A'}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <span className="w-2.5 h-2.5 rounded-full bg-lime-500"></span>
                                          <span className="text-neutral-600">Okay</span>
                                        </div>
                                        <span className="font-mono text-neutral-900">
                                          {gauge.primaryRiver.levelLow !== null && gauge.primaryRiver.levelOptimalMin !== null
                                            ? `${gauge.primaryRiver.levelLow} - ${(gauge.primaryRiver.levelOptimalMin - 0.01).toFixed(2)} ft`
                                            : gauge.primaryRiver.levelLow !== null
                                            ? `≥ ${gauge.primaryRiver.levelLow} ft`
                                            : 'N/A'}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <span className="w-2.5 h-2.5 rounded-full bg-yellow-500"></span>
                                          <span className="text-neutral-600">Low</span>
                                        </div>
                                        <span className="font-mono text-neutral-900">
                                          {gauge.primaryRiver.levelTooLow !== null && gauge.primaryRiver.levelLow !== null
                                            ? `${gauge.primaryRiver.levelTooLow} - ${(gauge.primaryRiver.levelLow - 0.01).toFixed(2)} ft`
                                            : gauge.primaryRiver.levelTooLow !== null
                                            ? `≥ ${gauge.primaryRiver.levelTooLow} ft`
                                            : 'N/A'}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <span className="w-2.5 h-2.5 rounded-full bg-neutral-400"></span>
                                          <span className="text-neutral-600">Too Low</span>
                                        </div>
                                        <span className="font-mono text-neutral-900">
                                          {gauge.primaryRiver.levelTooLow !== null
                                            ? `< ${gauge.primaryRiver.levelTooLow} ft`
                                            : 'N/A'}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>
                                          <span className="text-neutral-600">High</span>
                                        </div>
                                        <span className="font-mono text-neutral-900">
                                          {gauge.primaryRiver.levelHigh !== null && gauge.primaryRiver.levelDangerous !== null
                                            ? `${gauge.primaryRiver.levelHigh} - ${(gauge.primaryRiver.levelDangerous - 0.01).toFixed(2)} ft`
                                            : gauge.primaryRiver.levelHigh !== null
                                            ? `≥ ${gauge.primaryRiver.levelHigh} ft`
                                            : 'N/A'}
                                        </span>
                                      </div>
                                      <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                          <span className="w-2.5 h-2.5 rounded-full bg-red-600"></span>
                                          <span className="text-neutral-600">Flood</span>
                                        </div>
                                        <span className="font-mono text-neutral-900">
                                          {gauge.primaryRiver.levelDangerous !== null
                                            ? `≥ ${gauge.primaryRiver.levelDangerous} ft`
                                            : 'N/A'}
                                        </span>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}

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
