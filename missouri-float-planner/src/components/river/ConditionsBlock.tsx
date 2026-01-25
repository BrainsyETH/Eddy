'use client';

// src/components/river/ConditionsBlock.tsx
// Conditions & Safety section with USGS data, percentile ratings, and tap-to-expand details

import { useState } from 'react';
import type { RiverCondition, FlowRating } from '@/types/api';
import type { GaugeStation } from '@/hooks/useGaugeStations';
import FlowTrendChart from './FlowTrendChart';
import WeatherForecast from './WeatherForecast';

interface ConditionsBlockProps {
  riverId: string;
  riverSlug?: string;
  condition: RiverCondition | null;
  nearestGauge?: GaugeStation | null;
  hasPutInSelected?: boolean;
  isLoading?: boolean;
}

// Flow rating display configuration
const FLOW_RATING_CONFIG: Record<FlowRating, {
  emoji: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
}> = {
  flood: {
    emoji: '🚫',
    bgClass: 'bg-red-600',
    textClass: 'text-white',
    borderClass: 'border-red-400',
  },
  high: {
    emoji: '⚡',
    bgClass: 'bg-orange-500',
    textClass: 'text-white',
    borderClass: 'border-orange-400',
  },
  good: {
    emoji: '✓',
    bgClass: 'bg-emerald-500',
    textClass: 'text-white',
    borderClass: 'border-emerald-400',
  },
  low: {
    emoji: '↓',
    bgClass: 'bg-lime-500',
    textClass: 'text-white',
    borderClass: 'border-lime-400',
  },
  poor: {
    emoji: '⚠',
    bgClass: 'bg-yellow-500',
    textClass: 'text-white',
    borderClass: 'border-yellow-400',
  },
  unknown: {
    emoji: '?',
    bgClass: 'bg-bluff-500',
    textClass: 'text-white',
    borderClass: 'border-bluff-400',
  },
};

// Detailed explanations for each rating
const FLOW_RATING_DETAILS: Record<FlowRating, {
  title: string;
  description: string;
  advice: string;
}> = {
  flood: {
    title: 'Flood Conditions',
    description: 'Water levels are dangerously high, well above the 90th percentile for this time of year.',
    advice: 'Do not float. Wait for water levels to drop significantly before attempting any trip.',
  },
  high: {
    title: 'High Water',
    description: 'Water levels are above the 75th percentile - higher than typical for this date.',
    advice: 'Only for experienced paddlers. Expect fast current, submerged obstacles, and limited stopping opportunities.',
  },
  good: {
    title: 'Good Conditions',
    description: 'Water levels are near the historical median for this date (25th-75th percentile).',
    advice: 'Ideal for floating! Expect minimal dragging, good navigation, and enjoyable conditions.',
  },
  low: {
    title: 'Low Water',
    description: 'Water levels are below the 25th percentile - lower than typical for this date.',
    advice: 'Expect some dragging in the shallow areas. Consider a lighter load and shorter trip.',
  },
  poor: {
    title: 'Too Low',
    description: 'Water levels are below the 10th percentile - very low for this time of year.',
    advice: 'Frequent dragging and portaging may occur. Consider waiting for rain or try a spring-fed river.',
  },
  unknown: {
    title: 'Unknown Conditions',
    description: 'Unable to determine current conditions from available data.',
    advice: 'Check the USGS website directly or call local outfitters for current conditions.',
  },
};

export default function ConditionsBlock({ riverSlug, condition, nearestGauge, hasPutInSelected, isLoading }: ConditionsBlockProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  // Use the condition passed from parent (which is segment-aware when put-in is selected)
  const displayCondition = condition;

  if (isLoading) {
    return (
      <div className="glass-card-dark rounded-2xl p-6 border border-white/10">
        <h3 className="text-xl font-bold text-white mb-4">Conditions & Safety</h3>
        <div className="animate-pulse space-y-4">
          <div className="h-24 bg-white/10 rounded-xl"></div>
          <div className="h-16 bg-white/10 rounded-xl"></div>
        </div>
      </div>
    );
  }

  if (!displayCondition) {
    return (
      <div className="glass-card-dark rounded-2xl p-6 border border-white/10">
        <h3 className="text-xl font-bold text-white mb-4">Conditions & Safety</h3>
        <p className="text-sm text-white/70">Condition data not available at this time.</p>
      </div>
    );
  }

  const flowRating = displayCondition.flowRating || 'unknown';
  const ratingConfig = FLOW_RATING_CONFIG[flowRating];
  const ratingDetails = FLOW_RATING_DETAILS[flowRating];

  return (
    <div className="glass-card-dark rounded-2xl p-6 border border-white/10">
      <h3 className="text-xl font-bold text-white mb-4">Conditions & Safety</h3>

      <div className="space-y-4">
        {/* Main Flow Rating Card - Tappable */}
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={`w-full rounded-xl p-4 ${ratingConfig.bgClass} ${ratingConfig.textClass} border-2 ${ratingConfig.borderClass} transition-all hover:opacity-95 active:scale-[0.99] text-left`}
        >
          {/* Rating Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <span className="text-3xl">{ratingConfig.emoji}</span>
              <div>
                <p className="text-2xl font-bold">{displayCondition.flowDescription || ratingDetails.title}</p>
                <p className="text-sm opacity-90">
                  {displayCondition.gaugeName || 'Gauge reading'}
                </p>
              </div>
            </div>
            <svg
              className={`w-6 h-6 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>

          {/* Quick Stats */}
          <div className="grid grid-cols-3 gap-3 mt-3 pt-3 border-t border-current/20">
            <div>
              <p className="text-xs opacity-75 font-medium">Discharge</p>
              <p className="text-lg font-bold">
                {displayCondition.dischargeCfs !== null
                  ? `${displayCondition.dischargeCfs.toLocaleString()} cfs`
                  : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-xs opacity-75 font-medium">Gauge Height</p>
              <p className="text-lg font-bold">
                {displayCondition.gaugeHeightFt !== null
                  ? `${displayCondition.gaugeHeightFt.toFixed(2)} ft`
                  : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-xs opacity-75 font-medium">Percentile</p>
              <p className="text-lg font-bold">
                {displayCondition.percentile !== null && displayCondition.percentile !== undefined
                  ? `${Math.round(displayCondition.percentile)}%`
                  : 'N/A'}
              </p>
            </div>
          </div>

          <p className="text-xs opacity-75 mt-2 text-center">
            Tap for details
          </p>
        </button>

        {/* Expanded Details */}
        {isExpanded && (
          <div className="bg-white/5 rounded-xl p-4 border border-white/10 space-y-4 animate-in slide-in-from-top-2 duration-200">
            {/* What This Means */}
            <div>
              <h4 className="font-bold text-white mb-2">What This Means</h4>
              <p className="text-sm text-white/80">{ratingDetails.description}</p>
            </div>

            {/* Advice */}
            <div className={`rounded-lg p-3 ${flowRating === 'flood' || flowRating === 'high' ? 'bg-red-500/20' : 'bg-blue-500/20'}`}>
              <h4 className="font-bold text-white mb-1 text-sm">Advice</h4>
              <p className="text-sm text-white/90">{ratingDetails.advice}</p>
            </div>

            {/* Percentile Context */}
            {displayCondition.percentile !== null && displayCondition.percentile !== undefined && (
              <div>
                <h4 className="font-bold text-white mb-2">How This Compares</h4>
                <div className="relative h-8 bg-gradient-to-r from-gray-500 via-amber-500 via-emerald-500 via-orange-500 to-red-500 rounded-full overflow-hidden">
                  {/* Percentile marker */}
                  <div
                    className="absolute top-0 bottom-0 w-1 bg-white shadow-lg"
                    style={{ left: `${displayCondition.percentile}%` }}
                  >
                    <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-white text-gray-800 text-xs font-bold px-2 py-0.5 rounded whitespace-nowrap">
                      {Math.round(displayCondition.percentile)}%
                    </div>
                  </div>
                </div>
                <div className="flex justify-between text-xs text-white/60 mt-1">
                  <span>Poor (0-10%)</span>
                  <span>Low</span>
                  <span>Good (25-75%)</span>
                  <span>High</span>
                  <span>Flood (90%+)</span>
                </div>
                {displayCondition.medianDischargeCfs && (
                  <p className="text-xs text-white/70 mt-2">
                    Typical for today: ~{displayCondition.medianDischargeCfs.toLocaleString()} cfs (median)
                  </p>
                )}
              </div>
            )}

            {/* Safety Disclaimer */}
            <div className="bg-amber-500/10 border border-amber-400/30 rounded-lg p-3">
              <p className="text-xs text-amber-200/90 leading-relaxed">
                <span className="font-bold text-amber-300">Safety First:</span> Always confirm current conditions with local outfitters and authorities before your float. Water levels can change rapidly due to weather upstream. This data is for planning purposes only and should not replace on-site assessment of conditions.
              </p>
            </div>

            {/* USGS Link */}
            {displayCondition.usgsUrl && (
              <a
                href={displayCondition.usgsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between w-full bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-3 transition-colors"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="font-medium">View Full USGS Data</span>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}

            {/* Reading Age */}
            <p className="text-xs text-white/50 text-center">
              {displayCondition.readingAgeHours !== null && displayCondition.readingAgeHours < 24
                ? `Data updated ${Math.round(displayCondition.readingAgeHours)} hour${Math.round(displayCondition.readingAgeHours) !== 1 ? 's' : ''} ago`
                : 'Recent reading'}
            </p>
          </div>
        )}

        {/* 7-Day Flow Trend */}
        {displayCondition.gaugeUsgsId && (
          <FlowTrendChart gaugeSiteId={displayCondition.gaugeUsgsId} />
        )}

        {/* 5-Day Weather Forecast */}
        {riverSlug && (
          <WeatherForecast riverSlug={riverSlug} />
        )}

        {/* Nearest Gauge (only show if different from main gauge) */}
        {nearestGauge && nearestGauge.usgsSiteId !== displayCondition.gaugeUsgsId && (
          <div className="bg-blue-500/20 border border-blue-400/40 rounded-xl p-4">
            <h4 className="font-bold text-blue-300 mb-2 text-sm flex items-center gap-2">
              <span>💧</span>
              <span>{hasPutInSelected ? 'Nearest Gauge to Your Put-in' : 'Nearby Gauge'}</span>
            </h4>
            <p className="text-white font-medium text-sm mb-2">{nearestGauge.name}</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-blue-200/70 text-xs">Gauge Height</p>
                <p className="text-white font-bold">
                  {nearestGauge.gaugeHeightFt !== null
                    ? `${nearestGauge.gaugeHeightFt.toFixed(2)} ft`
                    : 'N/A'}
                </p>
              </div>
              <div>
                <p className="text-blue-200/70 text-xs">Discharge</p>
                <p className="text-white font-bold">
                  {nearestGauge.dischargeCfs !== null
                    ? `${nearestGauge.dischargeCfs.toLocaleString()} cfs`
                    : 'N/A'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Safety Notes */}
        <div className="bg-amber-500/20 border border-amber-400/40 rounded-xl p-4">
          <h4 className="font-bold text-amber-300 mb-3 text-base">Safety Reminders</h4>
          <ul className="text-sm text-white/90 space-y-2">
            <li className="flex items-start gap-2">
              <span className="text-amber-400">•</span>
              <span>Always wear a life jacket</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-400">•</span>
              <span>Check weather - flash floods can occur quickly</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-400">•</span>
              <span>Inform someone of your float plan</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-amber-400">•</span>
              <span>Know your skill level and river difficulty</span>
            </li>
          </ul>
        </div>

        {/* Accuracy Warning */}
        {displayCondition.accuracyWarning && displayCondition.accuracyWarningReason && (
          <div className="bg-orange-500/20 border border-orange-400/40 rounded-xl p-4">
            <p className="text-sm text-orange-200">
              <span className="font-bold text-orange-300">Note:</span> {displayCondition.accuracyWarningReason}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
