'use client';

// src/app/gauges/page.tsx
// Comprehensive gauge stations page showing all USGS data and thresholds

import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Droplets, MapPin, Clock, ExternalLink, Activity, Gauge as GaugeIcon } from 'lucide-react';
import { CONDITION_COLORS } from '@/constants';
import type { GaugesResponse, GaugeStation } from '@/app/api/gauges/route';

// Rivers to expand by default (start with all collapsed)
const DEFAULT_EXPANDED_RIVERS: string[] = [];

interface RiverGaugeGroup {
  riverName: string;
  riverId: string;
  gauges: GaugeStation[];
}

export default function GaugesPage() {
  const [gaugeData, setGaugeData] = useState<GaugesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedRivers, setExpandedRivers] = useState<Set<string>>(new Set(DEFAULT_EXPANDED_RIVERS));
  const [expandedGauges, setExpandedGauges] = useState<Set<string>>(new Set());

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

  const toggleRiver = (riverName: string) => {
    setExpandedRivers((prev) => {
      const next = new Set(prev);
      if (next.has(riverName)) {
        next.delete(riverName);
      } else {
        next.add(riverName);
      }
      return next;
    });
  };

  const toggleGauge = (gaugeId: string) => {
    setExpandedGauges((prev) => {
      const next = new Set(prev);
      if (next.has(gaugeId)) {
        next.delete(gaugeId);
      } else {
        next.add(gaugeId);
      }
      return next;
    });
  };

  const hasValidThresholds = (thresholds: NonNullable<GaugeStation['thresholds']>) => {
    if (!thresholds || thresholds.length === 0) return false;
    return thresholds.some(t =>
      t.levelTooLow !== null ||
      t.levelLow !== null ||
      t.levelOptimalMin !== null ||
      t.levelOptimalMax !== null ||
      t.levelHigh !== null ||
      t.levelDangerous !== null
    );
  };

  // Group gauges by river
  const riverGroups: RiverGaugeGroup[] = [];
  if (gaugeData?.gauges) {
    const riverMap = new Map<string, RiverGaugeGroup>();

    for (const gauge of gaugeData.gauges) {
      if (!gauge.thresholds || gauge.thresholds.length === 0) continue;

      // Use primary river association, or first river if no primary
      const primaryRiver = gauge.thresholds.find(t => t.isPrimary) || gauge.thresholds[0];

      if (!riverMap.has(primaryRiver.riverId)) {
        riverMap.set(primaryRiver.riverId, {
          riverName: primaryRiver.riverName,
          riverId: primaryRiver.riverId,
          gauges: [],
        });
      }

      riverMap.get(primaryRiver.riverId)!.gauges.push(gauge);
    }

    riverGroups.push(...Array.from(riverMap.values()).sort((a, b) =>
      a.riverName.localeCompare(b.riverName)
    ));
  }

  const getConditionColor = (gaugeHeight: number | null, thresholds: NonNullable<GaugeStation['thresholds']>[0]) => {
    if (gaugeHeight === null) return CONDITION_COLORS.unknown;

    if (thresholds.levelDangerous !== null && gaugeHeight >= thresholds.levelDangerous) {
      return CONDITION_COLORS.dangerous;
    }
    if (thresholds.levelHigh !== null && gaugeHeight >= thresholds.levelHigh) {
      return CONDITION_COLORS.high;
    }
    if (thresholds.levelOptimalMin !== null && thresholds.levelOptimalMax !== null &&
        gaugeHeight >= thresholds.levelOptimalMin && gaugeHeight <= thresholds.levelOptimalMax) {
      return CONDITION_COLORS.optimal;
    }
    if (thresholds.levelLow !== null && gaugeHeight >= thresholds.levelLow) {
      return CONDITION_COLORS.low;
    }
    if (thresholds.levelTooLow !== null && gaugeHeight >= thresholds.levelTooLow) {
      return CONDITION_COLORS.very_low;
    }
    return CONDITION_COLORS.too_low;
  };

  const getConditionLabel = (gaugeHeight: number | null, thresholds: NonNullable<GaugeStation['thresholds']>[0]) => {
    if (gaugeHeight === null) return 'Unknown';

    if (thresholds.levelDangerous !== null && gaugeHeight >= thresholds.levelDangerous) {
      return 'Dangerous';
    }
    if (thresholds.levelHigh !== null && gaugeHeight >= thresholds.levelHigh) {
      return 'High';
    }
    if (thresholds.levelOptimalMin !== null && thresholds.levelOptimalMax !== null &&
        gaugeHeight >= thresholds.levelOptimalMin && gaugeHeight <= thresholds.levelOptimalMax) {
      return 'Optimal';
    }
    if (thresholds.levelLow !== null && gaugeHeight >= thresholds.levelLow) {
      return 'Low';
    }
    if (thresholds.levelTooLow !== null && gaugeHeight >= thresholds.levelTooLow) {
      return 'Very Low';
    }
    return 'Too Low';
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      {/* Hero */}
      <section
        className="relative py-16 md:py-20 text-white"
        style={{ background: 'linear-gradient(to bottom right, #0F2D35, #163F4A, #0F2D35)' }}
      >
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center justify-center gap-4 mb-4">
            <GaugeIcon className="w-12 h-12" style={{ color: '#F07052' }} />
            <h1
              className="text-4xl md:text-5xl font-bold"
              style={{ fontFamily: 'var(--font-display)', color: '#F07052' }}
            >
              Gauge Stations
            </h1>
          </div>
          <p className="text-lg text-white/80 max-w-3xl mx-auto text-center">
            Real-time USGS gauge data and river-specific thresholds for all monitored rivers.
            Each gauge provides water level, flow rate, and condition assessments.
          </p>
        </div>
      </section>

      {/* Main content */}
      <div className="max-w-6xl mx-auto px-4 py-12">
        {loading ? (
          <div className="bg-white border-2 border-neutral-200 rounded-xl p-12 text-center">
            <div className="inline-block w-8 h-8 border-4 border-neutral-300 border-t-primary-500 rounded-full animate-spin"></div>
            <p className="text-neutral-600 mt-4">Loading gauge stations...</p>
          </div>
        ) : riverGroups.length > 0 ? (
          <div className="space-y-4">
            {riverGroups.map((riverGroup) => {
              const isExpanded = expandedRivers.has(riverGroup.riverName);

              return (
                <div
                  key={riverGroup.riverId}
                  className="bg-white border-2 border-neutral-200 rounded-xl overflow-hidden shadow-sm"
                >
                  {/* River header - clickable to expand/collapse */}
                  <button
                    onClick={() => toggleRiver(riverGroup.riverName)}
                    className="w-full px-6 py-4 flex items-center justify-between hover:bg-neutral-50 transition-colors text-left"
                    style={{ borderBottom: isExpanded ? '2px solid #e5e7eb' : 'none' }}
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? (
                        <ChevronDown className="w-6 h-6 text-neutral-500 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-6 h-6 text-neutral-500 flex-shrink-0" />
                      )}
                      <div>
                        <h2 className="text-2xl font-bold text-neutral-900">{riverGroup.riverName}</h2>
                        <p className="text-sm text-neutral-600">
                          {riverGroup.gauges.length} gauge {riverGroup.gauges.length === 1 ? 'station' : 'stations'}
                        </p>
                      </div>
                    </div>
                  </button>

                  {/* Expanded content */}
                  {isExpanded && (
                    <div className="p-6 space-y-4">
                      {riverGroup.gauges.map((gauge) => {
                        const primaryRiver = gauge.thresholds?.find(t => t.isPrimary) || gauge.thresholds?.[0];
                        const currentCondition = primaryRiver ? getConditionLabel(gauge.gaugeHeightFt, primaryRiver) : 'Unknown';
                        const conditionColor = primaryRiver ? getConditionColor(gauge.gaugeHeightFt, primaryRiver) : CONDITION_COLORS.unknown;
                        const isGaugeExpanded = expandedGauges.has(gauge.id);

                        return (
                          <div
                            key={gauge.id}
                            className="border-2 border-neutral-200 rounded-lg overflow-hidden"
                          >
                            {/* Gauge header - clickable to expand/collapse */}
                            <button
                              onClick={() => toggleGauge(gauge.id)}
                              className="w-full px-6 py-4 flex items-center justify-between hover:bg-neutral-50 transition-colors text-left"
                              style={{ borderBottom: isGaugeExpanded ? '2px solid #e5e7eb' : 'none' }}
                            >
                              <div className="flex items-center gap-3 flex-1">
                                {isGaugeExpanded ? (
                                  <ChevronDown className="w-5 h-5 text-neutral-500 flex-shrink-0" />
                                ) : (
                                  <ChevronRight className="w-5 h-5 text-neutral-500 flex-shrink-0" />
                                )}
                                <div className="flex-1">
                                  <div className="flex items-center gap-3 mb-1">
                                    <h3 className="text-xl font-bold text-neutral-900">{gauge.name}</h3>
                                    <a
                                      href={`https://waterdata.usgs.gov/monitoring-location/${gauge.usgsSiteId}/`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700 font-mono"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      {gauge.usgsSiteId}
                                      <ExternalLink className="w-3 h-3" />
                                    </a>
                                  </div>
                                  <div className="flex items-center gap-2 text-sm text-neutral-600">
                                    <MapPin className="w-4 h-4" />
                                    <span>
                                      {gauge.coordinates.lat.toFixed(5)}, {gauge.coordinates.lng.toFixed(5)}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Current condition badge */}
                              <div className="flex items-center gap-3 flex-shrink-0">
                                <div
                                  className="px-4 py-2 rounded-full text-white font-bold text-sm shadow-md"
                                  style={{ backgroundColor: conditionColor }}
                                >
                                  {currentCondition}
                                </div>
                              </div>
                            </button>

                            {/* Gauge details - only show when expanded */}
                            {isGaugeExpanded && (
                              <div className="p-6 space-y-6">
                                {/* Current readings */}
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                              <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4">
                                <div className="flex items-center gap-2 mb-2">
                                  <Droplets className="w-5 h-5 text-primary-600" />
                                  <span className="text-sm font-semibold text-neutral-600 uppercase tracking-wide">
                                    Gauge Height
                                  </span>
                                </div>
                                <div className="text-2xl font-bold text-neutral-900">
                                  {gauge.gaugeHeightFt !== null ? `${gauge.gaugeHeightFt.toFixed(2)} ft` : 'N/A'}
                                </div>
                              </div>

                              <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4">
                                <div className="flex items-center gap-2 mb-2">
                                  <Activity className="w-5 h-5 text-primary-600" />
                                  <span className="text-sm font-semibold text-neutral-600 uppercase tracking-wide">
                                    Discharge
                                  </span>
                                </div>
                                <div className="text-2xl font-bold text-neutral-900">
                                  {gauge.dischargeCfs !== null ? `${gauge.dischargeCfs.toLocaleString()} cfs` : 'N/A'}
                                </div>
                              </div>

                              <div className="bg-neutral-50 border border-neutral-200 rounded-lg p-4">
                                <div className="flex items-center gap-2 mb-2">
                                  <Clock className="w-5 h-5 text-primary-600" />
                                  <span className="text-sm font-semibold text-neutral-600 uppercase tracking-wide">
                                    Last Updated
                                  </span>
                                </div>
                                <div className="text-sm font-medium text-neutral-900">
                                  {gauge.readingTimestamp ? (
                                    <>
                                      {new Date(gauge.readingTimestamp).toLocaleString('en-US', {
                                        month: 'short',
                                        day: 'numeric',
                                        hour: 'numeric',
                                        minute: '2-digit',
                                      })}
                                      {gauge.readingAgeHours !== null && (
                                        <div className="text-xs text-neutral-600 mt-1">
                                          {gauge.readingAgeHours < 1
                                            ? '< 1 hour ago'
                                            : `${Math.round(gauge.readingAgeHours)} hours ago`}
                                        </div>
                                      )}
                                    </>
                                  ) : (
                                    'N/A'
                                  )}
                                </div>
                              </div>
                            </div>

                                {/* Thresholds table */}
                                {gauge.thresholds && hasValidThresholds(gauge.thresholds) && (
                                  <div>
                                    <h4 className="text-sm font-semibold text-neutral-600 uppercase tracking-wide mb-3">
                                      Condition Thresholds
                                    </h4>
                                <div className="overflow-x-auto">
                                  <table className="w-full text-sm">
                                    <thead>
                                      <tr className="border-b-2 border-neutral-200">
                                        <th className="text-left py-2 px-3 font-semibold text-neutral-600">Condition</th>
                                        <th className="text-right py-2 px-3 font-semibold text-neutral-600">Threshold (ft)</th>
                                        <th className="text-left py-2 px-3 font-semibold text-neutral-600">Description</th>
                                      </tr>
                                    </thead>
                                    <tbody className="divide-y divide-neutral-200">
                                      {gauge.thresholds.map((threshold) => (
                                        <React.Fragment key={threshold.riverId}>
                                          <tr className="bg-neutral-50">
                                            <td colSpan={3} className="py-2 px-3 font-semibold text-neutral-700">
                                              {threshold.riverName}
                                              {threshold.isPrimary && (
                                                <span className="ml-2 px-2 py-0.5 bg-accent-500 text-white text-xs font-semibold rounded">
                                                  PRIMARY
                                                </span>
                                              )}
                                            </td>
                                          </tr>
                                          <tr>
                                            <td className="py-3 px-3">
                                              <div className="flex items-center gap-2">
                                                <div
                                                  className="w-3 h-3 rounded-full"
                                                  style={{ backgroundColor: CONDITION_COLORS.dangerous }}
                                                ></div>
                                                <span className="font-medium">Dangerous</span>
                                              </div>
                                            </td>
                                            <td className="py-3 px-3 text-right font-mono">
                                              {threshold.levelDangerous !== null ? `≥ ${threshold.levelDangerous}` : 'N/A'}
                                            </td>
                                            <td className="py-3 px-3 text-neutral-600">Do not float</td>
                                          </tr>
                                          <tr>
                                            <td className="py-3 px-3">
                                              <div className="flex items-center gap-2">
                                                <div
                                                  className="w-3 h-3 rounded-full"
                                                  style={{ backgroundColor: CONDITION_COLORS.high }}
                                                ></div>
                                                <span className="font-medium">High</span>
                                              </div>
                                            </td>
                                            <td className="py-3 px-3 text-right font-mono">
                                              {threshold.levelHigh !== null && threshold.levelDangerous !== null
                                                ? `${threshold.levelHigh} - ${(threshold.levelDangerous - 0.01).toFixed(2)}`
                                                : threshold.levelHigh !== null
                                                ? `≥ ${threshold.levelHigh}`
                                                : 'N/A'}
                                            </td>
                                            <td className="py-3 px-3 text-neutral-600">Experienced only</td>
                                          </tr>
                                          <tr>
                                            <td className="py-3 px-3">
                                              <div className="flex items-center gap-2">
                                                <div
                                                  className="w-3 h-3 rounded-full"
                                                  style={{ backgroundColor: CONDITION_COLORS.optimal }}
                                                ></div>
                                                <span className="font-medium">Optimal</span>
                                              </div>
                                            </td>
                                            <td className="py-3 px-3 text-right font-mono">
                                              {threshold.levelOptimalMin !== null && threshold.levelOptimalMax !== null
                                                ? `${threshold.levelOptimalMin} - ${threshold.levelOptimalMax}`
                                                : 'N/A'}
                                            </td>
                                            <td className="py-3 px-3 text-neutral-600">Ideal conditions</td>
                                          </tr>
                                          <tr>
                                            <td className="py-3 px-3">
                                              <div className="flex items-center gap-2">
                                                <div
                                                  className="w-3 h-3 rounded-full"
                                                  style={{ backgroundColor: CONDITION_COLORS.low }}
                                                ></div>
                                                <span className="font-medium">Low</span>
                                              </div>
                                            </td>
                                            <td className="py-3 px-3 text-right font-mono">
                                              {threshold.levelLow !== null && threshold.levelOptimalMin !== null
                                                ? `${threshold.levelLow} - ${(threshold.levelOptimalMin - 0.01).toFixed(2)}`
                                                : threshold.levelLow !== null
                                                ? `≥ ${threshold.levelLow}`
                                                : 'N/A'}
                                            </td>
                                            <td className="py-3 px-3 text-neutral-600">Floatable</td>
                                          </tr>
                                          <tr>
                                            <td className="py-3 px-3">
                                              <div className="flex items-center gap-2">
                                                <div
                                                  className="w-3 h-3 rounded-full"
                                                  style={{ backgroundColor: CONDITION_COLORS.very_low }}
                                                ></div>
                                                <span className="font-medium">Very Low</span>
                                              </div>
                                            </td>
                                            <td className="py-3 px-3 text-right font-mono">
                                              {threshold.levelTooLow !== null && threshold.levelLow !== null
                                                ? `${threshold.levelTooLow} - ${(threshold.levelLow - 0.01).toFixed(2)}`
                                                : threshold.levelTooLow !== null
                                                ? `≥ ${threshold.levelTooLow}`
                                                : 'N/A'}
                                            </td>
                                            <td className="py-3 px-3 text-neutral-600">Scraping likely</td>
                                          </tr>
                                          <tr>
                                            <td className="py-3 px-3">
                                              <div className="flex items-center gap-2">
                                                <div
                                                  className="w-3 h-3 rounded-full"
                                                  style={{ backgroundColor: CONDITION_COLORS.too_low }}
                                                ></div>
                                                <span className="font-medium">Too Low</span>
                                              </div>
                                            </td>
                                            <td className="py-3 px-3 text-right font-mono">
                                              {threshold.levelTooLow !== null ? `< ${threshold.levelTooLow}` : 'N/A'}
                                            </td>
                                            <td className="py-3 px-3 text-neutral-600">Not recommended</td>
                                          </tr>
                                        </React.Fragment>
                                      ))}
                                    </tbody>
                                  </table>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-white border-2 border-neutral-200 rounded-xl p-12 text-center">
            <p className="text-neutral-600">No gauge stations found.</p>
          </div>
        )}

        {/* Info box */}
        <div className="mt-12 bg-primary-50 border-2 border-primary-200 rounded-xl p-6">
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
            <p>
              Thresholds are calibrated for each river based on historical data, river characteristics, and local
              knowledge. These values help determine safe and enjoyable floating conditions.
            </p>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-primary-800 border-t-2 border-neutral-900 px-4 py-8 mt-16">
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
