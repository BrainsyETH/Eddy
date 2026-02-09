'use client';

// src/components/river/GaugeOverview.tsx
// River Conditions section with expandable gauge details
// Shows all gauges for the river with the closest to put-in highlighted

import { useState, useMemo } from 'react';
import Image from 'next/image';
import CollapsibleSection from '@/components/ui/CollapsibleSection';
import GaugeWeather from '@/components/ui/GaugeWeather';
import { useGaugeHistory } from '@/hooks/useGaugeHistory';
import { computeCondition, getConditionTailwindColor, getConditionShortLabel, type ConditionThresholds } from '@/lib/conditions';
import type { GaugeStation } from '@/hooks/useGaugeStations';
import type { ConditionCode } from '@/types/api';
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Droplets,
  Activity,
  TrendingUp,
  MapPin,
  Clock,
} from 'lucide-react';

// Eddy otter images for different conditions
const EDDY_CONDITION_IMAGES: Record<string, string> = {
  green: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_green.png',
  red: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_red.png',
  yellow: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy_the_Otter_yellow.png',
  flag: 'https://q5skne5bn5nbyxfw.public.blob.vercel-storage.com/Eddy_Otter/Eddy%20the%20otter%20with%20a%20flag.png',
};

const getEddyImageForCondition = (code: ConditionCode): string => {
  switch (code) {
    case 'optimal':
    case 'low':
      return EDDY_CONDITION_IMAGES.green;
    case 'high':
    case 'dangerous':
      return EDDY_CONDITION_IMAGES.red;
    case 'very_low':
      return EDDY_CONDITION_IMAGES.yellow;
    case 'too_low':
    case 'unknown':
    default:
      return EDDY_CONDITION_IMAGES.flag;
  }
};

// Date range options for charts
const DATE_RANGES = [
  { days: 7, label: '7D' },
  { days: 14, label: '14D' },
  { days: 30, label: '30D' },
];

interface GaugeOverviewProps {
  gauges: GaugeStation[] | undefined;
  riverId: string;
  isLoading?: boolean;
  defaultOpen?: boolean;
  putInCoordinates?: { lat: number; lng: number } | null;
}

// Calculate distance between two points (simple Euclidean for nearby points)
function getDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const latDiff = lat1 - lat2;
  const lngDiff = lng1 - lng2;
  return Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
}

// Determine condition based on gauge reading and thresholds
// Supports both ft (gauge height) and cfs (discharge) threshold units
function getGaugeCondition(gauge: GaugeStation, riverId: string): {
  code: ConditionCode;
  label: string;
  color: string;
} {
  const threshold = gauge.thresholds?.find(t => t.riverId === riverId && t.isPrimary)
    || gauge.thresholds?.find(t => t.riverId === riverId);

  if (!threshold) {
    return { code: 'unknown', label: 'Unknown', color: 'bg-neutral-400' };
  }

  // Check if we have the required reading based on threshold unit
  const useCfs = threshold.thresholdUnit === 'cfs';
  const hasReading = useCfs
    ? (gauge.dischargeCfs !== null || gauge.gaugeHeightFt !== null)
    : (gauge.gaugeHeightFt !== null || gauge.dischargeCfs !== null);

  if (!hasReading) {
    return { code: 'unknown', label: 'Unknown', color: 'bg-neutral-400' };
  }

  const thresholdsForCompute: ConditionThresholds = {
    levelTooLow: threshold.levelTooLow,
    levelLow: threshold.levelLow,
    levelOptimalMin: threshold.levelOptimalMin,
    levelOptimalMax: threshold.levelOptimalMax,
    levelHigh: threshold.levelHigh,
    levelDangerous: threshold.levelDangerous,
    thresholdUnit: threshold.thresholdUnit,
  };

  const result = computeCondition(gauge.gaugeHeightFt, thresholdsForCompute, gauge.dischargeCfs);

  return {
    code: result.code,
    label: getConditionShortLabel(result.code),
    color: getConditionTailwindColor(result.code),
  };
}

// Flow trend chart component
interface ThresholdLines {
  levelTooLow: number | null;
  levelLow: number | null;
  levelOptimalMin: number | null;
  levelOptimalMax: number | null;
  levelHigh: number | null;
  levelDangerous: number | null;
}

const THRESHOLD_LINE_CONFIG: { key: keyof ThresholdLines; label: string; color: string; dash?: string }[] = [
  { key: 'levelLow', label: 'Okay', color: '#84cc16', dash: '3,3' },
  { key: 'levelOptimalMin', label: 'Optimal', color: '#059669', dash: '2,2' },
  { key: 'levelOptimalMax', label: 'Optimal', color: '#059669', dash: '2,2' },
  { key: 'levelHigh', label: 'High', color: '#f97316', dash: '3,3' },
  { key: 'levelDangerous', label: 'Flood', color: '#ef4444', dash: '4,2' },
];

function FlowTrendChart({ gaugeSiteId, days, thresholds }: { gaugeSiteId: string; days: number; thresholds?: ThresholdLines | null }) {
  const { data: history, isLoading, error } = useGaugeHistory(gaugeSiteId, days);

  const chartData = useMemo(() => {
    if (!history?.readings || history.readings.length === 0) return null;

    const readings = history.readings;
    const stats = history.stats;

    // Expand Y-axis range to include threshold lines if they fall outside the data range
    let minVal = stats.minDischarge ?? 0;
    let maxVal = stats.maxDischarge ?? 100;

    if (thresholds) {
      const thresholdValues = [
        thresholds.levelTooLow, thresholds.levelLow,
        thresholds.levelOptimalMin, thresholds.levelOptimalMax,
        thresholds.levelHigh, thresholds.levelDangerous,
      ].filter((v): v is number => v !== null);

      for (const tv of thresholdValues) {
        if (tv < minVal) minVal = tv;
        if (tv > maxVal) maxVal = tv;
      }
    }

    // Add 5% padding so lines don't sit on edges
    const padding = (maxVal - minVal) * 0.05 || 5;
    minVal = Math.max(0, minVal - padding);
    maxVal = maxVal + padding;

    const range = maxVal - minVal || 1;

    const sampleStep = Math.max(1, Math.floor(readings.length / 50));
    const sampledReadings = readings.filter((_: unknown, i: number) => i % sampleStep === 0);

    const points = sampledReadings.map((reading: { dischargeCfs: number | null; timestamp: string }, index: number) => {
      const x = (index / (sampledReadings.length - 1)) * 100;
      const y = reading.dischargeCfs !== null
        ? 100 - ((reading.dischargeCfs - minVal) / range) * 100
        : 50;
      return { x, y, value: reading.dischargeCfs, timestamp: reading.timestamp };
    });

    const pathD = points.map((p: { x: number; y: number }, i: number) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
    const areaD = `${pathD} L ${points[points.length - 1].x} 100 L ${points[0].x} 100 Z`;

    // Compute threshold line Y positions (for SVG lines)
    const allThresholdLines = thresholds
      ? THRESHOLD_LINE_CONFIG
          .filter(t => thresholds[t.key] !== null)
          .map(t => ({
            ...t,
            value: thresholds[t.key]!,
            y: 100 - ((thresholds[t.key]! - minVal) / range) * 100,
          }))
      : [];

    // Build label list: merge optimal min/max into one centered label,
    // then remove labels that are too close vertically (< 8% of chart height)
    const MIN_LABEL_GAP = 8;
    const labelCandidates: typeof allThresholdLines = [];
    const optMin = allThresholdLines.find(t => t.key === 'levelOptimalMin');
    const optMax = allThresholdLines.find(t => t.key === 'levelOptimalMax');
    if (optMin && optMax) {
      // Single "Optimal" label centered between the two lines
      labelCandidates.push({ ...optMin, y: (optMin.y + optMax.y) / 2 });
    } else if (optMin) {
      labelCandidates.push(optMin);
    } else if (optMax) {
      labelCandidates.push(optMax);
    }
    // Add non-optimal labels
    for (const t of allThresholdLines) {
      if (t.key !== 'levelOptimalMin' && t.key !== 'levelOptimalMax') {
        labelCandidates.push(t);
      }
    }
    // Sort by Y position and remove overlapping labels
    labelCandidates.sort((a, b) => a.y - b.y);
    const thresholdLabels: typeof labelCandidates = [];
    for (const candidate of labelCandidates) {
      const tooClose = thresholdLabels.some(placed => Math.abs(placed.y - candidate.y) < MIN_LABEL_GAP);
      if (!tooClose) {
        thresholdLabels.push(candidate);
      }
    }

    return {
      points,
      pathD,
      areaD,
      minVal,
      maxVal,
      currentVal: readings[readings.length - 1]?.dischargeCfs,
      startDate: new Date(readings[0].timestamp),
      endDate: new Date(readings[readings.length - 1].timestamp),
      thresholdLineData: allThresholdLines,
      thresholdLabels,
    };
  }, [history, thresholds]);

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

      <div className="relative h-32">
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
          <defs>
            <linearGradient id={`flowGradient-${gaugeSiteId}`} x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stopColor="rgb(45, 120, 137)" stopOpacity="0.4" />
              <stop offset="100%" stopColor="rgb(45, 120, 137)" stopOpacity="0.05" />
            </linearGradient>
          </defs>
          {/* Optimal range shaded band */}
          {chartData.thresholdLineData.length > 0 && (() => {
            const optMin = chartData.thresholdLineData.find(t => t.key === 'levelOptimalMin');
            const optMax = chartData.thresholdLineData.find(t => t.key === 'levelOptimalMax');
            if (optMin && optMax) {
              return (
                <rect
                  x="0" width="100"
                  y={Math.min(optMin.y, optMax.y)}
                  height={Math.abs(optMax.y - optMin.y)}
                  fill="#059669" fillOpacity="0.08"
                />
              );
            }
            return null;
          })()}
          {/* Threshold reference lines */}
          {chartData.thresholdLineData.map((t) => (
            <line
              key={t.key}
              x1="0" x2="100"
              y1={t.y} y2={t.y}
              stroke={t.color}
              strokeWidth="1"
              strokeDasharray={t.dash || 'none'}
              vectorEffect="non-scaling-stroke"
              opacity="0.6"
            />
          ))}
          <path d={chartData.areaD} fill={`url(#flowGradient-${gaugeSiteId})`} />
          <path d={chartData.pathD} fill="none" stroke="rgb(45, 120, 137)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
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
        {/* Threshold labels on right side (de-overlapped) */}
        {chartData.thresholdLabels.map((t) => (
          <div
            key={`label-${t.key}`}
            className="absolute right-0 text-[9px] font-medium -mr-1 leading-none"
            style={{
              top: `${t.y}%`,
              color: t.color,
              transform: 'translateY(-50%)',
            }}
          >
            {t.label}
          </div>
        ))}
      </div>

      <div className="flex justify-between text-[10px] text-neutral-400 mt-1 px-2">
        <span>{formatDate(chartData.startDate)}</span>
        <span>{formatDate(chartData.endDate)}</span>
      </div>
    </div>
  );
}

// Expanded gauge detail panel
function GaugeExpandedDetail({
  gauge,
  riverId,
  condition,
}: {
  gauge: GaugeStation;
  riverId: string;
  condition: { code: ConditionCode; label: string; color: string };
}) {
  const [dateRange, setDateRange] = useState(7);

  const threshold = gauge.thresholds?.find(t => t.riverId === riverId && t.isPrimary)
    || gauge.thresholds?.find(t => t.riverId === riverId);

  return (
    <div className="border-t-2 border-neutral-100 p-4 bg-neutral-50">
      {/* Top Row: Weather (left) + Current Readings (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Left Column - Weather */}
        <div>
          <GaugeWeather
            lat={gauge.coordinates.lat}
            lon={gauge.coordinates.lng}
            enabled={true}
          />
        </div>

        {/* Right Column - Current Readings */}
        <div>
          <h4 className="text-sm font-semibold text-neutral-700 mb-3 flex items-center gap-2">
            <Activity className="w-4 h-4" />
            Current Readings
          </h4>
          {(() => {
            const useCfs = threshold?.thresholdUnit === 'cfs';
            const primaryLabel = useCfs ? 'Flow' : 'Stage';
            const primaryIcon = useCfs ? <Activity className="w-4 h-4 text-primary-600" /> : <Droplets className="w-4 h-4 text-primary-600" />;
            const primaryValue = useCfs
              ? (gauge.dischargeCfs !== null ? `${gauge.dischargeCfs.toLocaleString()} cfs` : 'N/A')
              : (gauge.gaugeHeightFt !== null ? `${gauge.gaugeHeightFt.toFixed(2)} ft` : 'N/A');
            const secondaryLabel = useCfs ? 'Stage' : 'Flow';
            const secondaryIcon = useCfs ? <Droplets className="w-4 h-4 text-neutral-400" /> : <Activity className="w-4 h-4 text-neutral-400" />;
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
                    src={getEddyImageForCondition(condition.code)}
                    alt={`Eddy - ${condition.label}`}
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

      {/* Bottom Row: Chart (left) + Thresholds/Details (right) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Chart */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-semibold text-neutral-700 flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              {dateRange}-Day Flow Trend
            </h4>
            <div className="flex rounded-lg border border-neutral-300 overflow-hidden">
              {DATE_RANGES.map(range => (
                <button
                  key={range.days}
                  onClick={() => setDateRange(range.days)}
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
          <div className="bg-neutral-900 rounded-xl overflow-hidden">
            <FlowTrendChart
              gaugeSiteId={gauge.usgsSiteId}
              days={dateRange}
              thresholds={threshold?.thresholdUnit === 'cfs' ? {
                levelTooLow: threshold.levelTooLow,
                levelLow: threshold.levelLow,
                levelOptimalMin: threshold.levelOptimalMin,
                levelOptimalMax: threshold.levelOptimalMax,
                levelHigh: threshold.levelHigh,
                levelDangerous: threshold.levelDangerous,
              } : null}
            />
          </div>
        </div>

        {/* Right Column - Details */}
        <div className="space-y-4">
          {/* Thresholds */}
          {threshold && (() => {
            const unit = threshold.thresholdUnit === 'cfs' ? 'cfs' : 'ft';
            const formatValue = (val: number) => {
              if (unit === 'cfs') {
                return val.toLocaleString();
              }
              return val.toFixed(2);
            };
            const formatRange = (min: number, max: number) => {
              if (unit === 'cfs') {
                return `${min.toLocaleString()} - ${max.toLocaleString()} ${unit}`;
              }
              return `${min} - ${max} ${unit}`;
            };
            const decrementValue = unit === 'cfs' ? 1 : 0.01;

            return (
              <div>
                <h4 className="text-sm font-semibold text-neutral-700 mb-3">
                  Condition Thresholds {unit === 'cfs' && <span className="font-normal text-neutral-500">(using flow)</span>}
                </h4>
                <div className="bg-white border border-neutral-200 rounded-lg p-3">
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-600"></span>
                        <span className="text-neutral-600">Optimal</span>
                      </div>
                      <span className="font-mono text-neutral-900">
                        {threshold.levelOptimalMin !== null && threshold.levelOptimalMax !== null
                          ? formatRange(threshold.levelOptimalMin, threshold.levelOptimalMax)
                          : 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-lime-500"></span>
                        <span className="text-neutral-600">Okay</span>
                      </div>
                      <span className="font-mono text-neutral-900">
                        {threshold.levelLow !== null && threshold.levelOptimalMin !== null
                          ? `${formatValue(threshold.levelLow)} - ${formatValue(threshold.levelOptimalMin - decrementValue)} ${unit}`
                          : threshold.levelLow !== null
                          ? `≥ ${formatValue(threshold.levelLow)} ${unit}`
                          : 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-yellow-500"></span>
                        <span className="text-neutral-600">Low</span>
                      </div>
                      <span className="font-mono text-neutral-900">
                        {threshold.levelTooLow !== null && threshold.levelLow !== null
                          ? `${formatValue(threshold.levelTooLow)} - ${formatValue(threshold.levelLow - decrementValue)} ${unit}`
                          : threshold.levelTooLow !== null
                          ? `≥ ${formatValue(threshold.levelTooLow)} ${unit}`
                          : 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-neutral-400"></span>
                        <span className="text-neutral-600">Too Low</span>
                      </div>
                      <span className="font-mono text-neutral-900">
                        {threshold.levelTooLow !== null
                          ? `< ${formatValue(threshold.levelTooLow)} ${unit}`
                          : 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-orange-500"></span>
                        <span className="text-neutral-600">High</span>
                      </div>
                      <span className="font-mono text-neutral-900">
                        {threshold.levelHigh !== null && threshold.levelDangerous !== null
                          ? `${formatValue(threshold.levelHigh)} - ${formatValue(threshold.levelDangerous - decrementValue)} ${unit}`
                          : threshold.levelHigh !== null
                          ? `≥ ${formatValue(threshold.levelHigh)} ${unit}`
                          : 'N/A'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-600"></span>
                        <span className="text-neutral-600">Flood</span>
                      </div>
                      <span className="font-mono text-neutral-900">
                        {threshold.levelDangerous !== null
                          ? `≥ ${formatValue(threshold.levelDangerous)} ${unit}`
                          : 'N/A'}
                      </span>
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
  );
}

export default function GaugeOverview({
  gauges,
  riverId,
  isLoading,
  defaultOpen = false,
  putInCoordinates,
}: GaugeOverviewProps) {
  const [expandedGaugeId, setExpandedGaugeId] = useState<string | null>(null);

  // Find the gauge closest to put-in
  const closestGaugeId = useMemo(() => {
    if (!putInCoordinates || !gauges || gauges.length === 0) return null;

    let closest: GaugeStation | null = null;
    let minDistance = Infinity;

    for (const gauge of gauges) {
      const distance = getDistance(
        putInCoordinates.lat,
        putInCoordinates.lng,
        gauge.coordinates.lat,
        gauge.coordinates.lng
      );
      if (distance < minDistance) {
        minDistance = distance;
        closest = gauge;
      }
    }

    return closest?.id || null;
  }, [putInCoordinates, gauges]);

  if (isLoading) {
    return (
      <CollapsibleSection title="River Conditions" defaultOpen={defaultOpen}>
        <div className="animate-pulse space-y-3">
          <div className="h-16 bg-neutral-100 rounded-lg"></div>
          <div className="h-16 bg-neutral-100 rounded-lg"></div>
        </div>
      </CollapsibleSection>
    );
  }

  if (!gauges || gauges.length === 0) {
    return (
      <CollapsibleSection title="River Conditions" defaultOpen={defaultOpen}>
        <p className="text-neutral-500 text-sm">No gauge data available for this river.</p>
      </CollapsibleSection>
    );
  }

  // Condition order for range display (low water to high water)
  const CONDITION_ORDER: ConditionCode[] = ['too_low', 'very_low', 'low', 'optimal', 'high', 'dangerous'];

  // Get condition range for the badge
  const conditions = gauges.map(g => getGaugeCondition(g, riverId));
  const conditionCodes = conditions.map(c => c.code).filter(c => c !== 'unknown');

  // Find min and max conditions based on order
  const conditionIndices = conditionCodes.map(code => CONDITION_ORDER.indexOf(code)).filter(i => i !== -1);
  const minIndex = Math.min(...conditionIndices);
  const maxIndex = Math.max(...conditionIndices);

  const minCondition = conditions.find(c => c.code === CONDITION_ORDER[minIndex]);
  const maxCondition = conditions.find(c => c.code === CONDITION_ORDER[maxIndex]);

  // Build badge - show range if different, single if same
  let badge = null;
  if (minCondition && maxCondition) {
    if (minIndex === maxIndex) {
      // All gauges have same condition
      badge = (
        <span className={`px-2 py-0.5 rounded text-xs font-bold text-white ${minCondition.color}`}>
          {minCondition.label}
        </span>
      );
    } else {
      // Show range
      badge = (
        <span className="flex items-center gap-1 text-xs font-bold">
          <span className={`px-1.5 py-0.5 rounded text-white ${minCondition.color}`}>
            {minCondition.label}
          </span>
          <span className="text-neutral-400">→</span>
          <span className={`px-1.5 py-0.5 rounded text-white ${maxCondition.color}`}>
            {maxCondition.label}
          </span>
        </span>
      );
    }
  }

  return (
    <CollapsibleSection title="River Conditions" defaultOpen={defaultOpen} badge={badge}>
      <div className="space-y-2">
        {gauges.map((gauge) => {
          const condition = getGaugeCondition(gauge, riverId);
          const isExpanded = expandedGaugeId === gauge.id;
          const isClosestToPutIn = gauge.id === closestGaugeId;

          return (
            <div
              key={gauge.id}
              className={`rounded-lg overflow-hidden transition-all ${
                isClosestToPutIn
                  ? 'border-2 border-green-500 bg-green-50'
                  : 'border border-neutral-200 bg-white'
              } ${isExpanded ? 'shadow-md' : ''}`}
            >
              {/* Gauge row header */}
              <button
                onClick={() => setExpandedGaugeId(isExpanded ? null : gauge.id)}
                className="w-full p-3 text-left hover:bg-neutral-50 transition-colors"
              >
                <div className="flex items-center justify-between gap-3">
                  {/* Left side - Gauge info */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <span className={`w-3 h-3 rounded-full flex-shrink-0 ${condition.color}`} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-neutral-900 text-sm">{gauge.name}</p>
                        {isClosestToPutIn && (
                          <span className="px-1.5 py-0.5 bg-green-500 text-white text-[10px] font-bold rounded">
                            Closest to put-in
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-neutral-500">
                        <span>USGS {gauge.usgsSiteId}</span>
                        <a
                          href={`https://waterdata.usgs.gov/monitoring-location/${gauge.usgsSiteId}/`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-primary-600 hover:text-primary-700 flex items-center gap-0.5"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* Right side - Readings and expand */}
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {(() => {
                      const threshold = gauge.thresholds?.find(t => t.riverId === riverId && t.isPrimary)
                        || gauge.thresholds?.find(t => t.riverId === riverId);
                      const useCfs = threshold?.thresholdUnit === 'cfs';

                      // Show primary unit first, secondary second
                      const primaryReading = useCfs
                        ? gauge.dischargeCfs !== null ? (
                            <div className="text-right" key="primary">
                              <p className="text-sm font-bold text-neutral-900">{gauge.dischargeCfs.toLocaleString()} <span className="text-xs font-medium">cfs</span></p>
                              <p className="text-[10px] text-primary-600 font-medium">Flow</p>
                            </div>
                          ) : null
                        : gauge.gaugeHeightFt !== null ? (
                            <div className="text-right" key="primary">
                              <p className="text-sm font-bold text-neutral-900">{gauge.gaugeHeightFt.toFixed(2)} <span className="text-xs font-medium">ft</span></p>
                              <p className="text-[10px] text-primary-600 font-medium">Stage</p>
                            </div>
                          ) : null;

                      const secondaryReading = useCfs
                        ? gauge.gaugeHeightFt !== null ? (
                            <div className="text-right" key="secondary">
                              <p className="text-xs text-neutral-500">{gauge.gaugeHeightFt.toFixed(2)} ft</p>
                              <p className="text-[10px] text-neutral-400">Stage</p>
                            </div>
                          ) : null
                        : gauge.dischargeCfs !== null ? (
                            <div className="text-right" key="secondary">
                              <p className="text-xs text-neutral-500">{gauge.dischargeCfs.toLocaleString()} cfs</p>
                              <p className="text-[10px] text-neutral-400">Flow</p>
                            </div>
                          ) : null;

                      return <>{primaryReading}{secondaryReading}</>;
                    })()}
                    <div className={`px-2 py-1 rounded text-xs font-bold ${condition.color} text-white`}>
                      {condition.label}
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-5 h-5 text-neutral-400" />
                    ) : (
                      <ChevronDown className="w-5 h-5 text-neutral-400" />
                    )}
                  </div>
                </div>
              </button>

              {/* Expanded content */}
              {isExpanded && (
                <GaugeExpandedDetail
                  gauge={gauge}
                  riverId={riverId}
                  condition={condition}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-4 pt-4 border-t border-neutral-200">
        <div className="flex flex-col items-center gap-2 text-xs sm:flex-row sm:justify-center sm:flex-wrap sm:gap-x-4 sm:gap-y-1">
          <span className="text-neutral-500 font-medium">Conditions:</span>
          <div className="flex items-center justify-center flex-wrap gap-x-3 gap-y-1">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-neutral-400" />
              <span className="text-neutral-600">Too Low</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-yellow-500" />
              <span className="text-neutral-600">Low</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-lime-500" />
              <span className="text-neutral-600">Okay</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-600" />
              <span className="text-neutral-600">Optimal</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-orange-500" />
              <span className="text-neutral-600">High</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-600" />
              <span className="text-neutral-600">Flood</span>
            </div>
          </div>
        </div>
      </div>
    </CollapsibleSection>
  );
}
