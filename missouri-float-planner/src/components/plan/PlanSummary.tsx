'use client';

// src/components/plan/PlanSummary.tsx
// Themed float plan summary panel

import { useState, useEffect, useCallback } from 'react';
import type { FloatPlan, FlowRating } from '@/types/api';
import { useVesselTypes } from '@/hooks/useVesselTypes';
import { useFloatPlan } from '@/hooks/useFloatPlan';

// Flow rating display configuration - colors match gauge condition legend
const FLOW_RATING_CONFIG: Record<FlowRating, {
  label: string;
  emoji: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
}> = {
  flood: {
    label: 'Flood',
    emoji: '🚫',
    bgClass: 'bg-red-600',
    textClass: 'text-white',
    borderClass: 'border-red-400',
  },
  high: {
    label: 'High',
    emoji: '⚡',
    bgClass: 'bg-orange-500',
    textClass: 'text-white',
    borderClass: 'border-orange-400',
  },
  good: {
    label: 'Good',
    emoji: '✓',
    bgClass: 'bg-lime-500',
    textClass: 'text-white',
    borderClass: 'border-lime-400',
  },
  low: {
    label: 'Low',
    emoji: '↓',
    bgClass: 'bg-yellow-500',
    textClass: 'text-neutral-900',
    borderClass: 'border-yellow-400',
  },
  poor: {
    label: 'Too Low',
    emoji: '⚠',
    bgClass: 'bg-yellow-600',
    textClass: 'text-white',
    borderClass: 'border-yellow-500',
  },
  unknown: {
    label: 'Unknown',
    emoji: '?',
    bgClass: 'bg-neutral-500',
    textClass: 'text-white',
    borderClass: 'border-neutral-400',
  },
};

interface PlanSummaryProps {
  plan: FloatPlan | null;
  isLoading: boolean;
  onClose: () => void;
  onShare: () => void;
}


// Dangerous Conditions Warning - displays when conditions are dangerous
function DangerousWarning() {
  return (
    <div className="bg-red-50 border-2 border-red-400 rounded-lg p-3">
      <div className="flex items-start gap-2">
        <span className="text-lg flex-shrink-0">⚠️</span>
        <div>
          <h4 className="font-bold text-red-800 text-sm">Dangerous Conditions</h4>
          <p className="text-xs text-red-700 mt-0.5">
            High water levels make floating extremely hazardous. Do not launch.
          </p>
        </div>
      </div>
    </div>
  );
}

// Unknown Conditions Warning - displays when conditions cannot be determined
function UnknownConditionsWarning() {
  return (
    <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-3">
      <div className="flex items-start gap-2">
        <span className="text-lg flex-shrink-0">❓</span>
        <div>
          <h4 className="font-bold text-amber-800 text-sm">Conditions Unknown</h4>
          <p className="text-xs text-amber-700 mt-0.5">
            Verify current conditions locally before launching.
          </p>
        </div>
      </div>
    </div>
  );
}

// Flow rating explanations (based on gauge height thresholds)
const FLOW_EXPLANATIONS: Record<FlowRating, string> = {
  good: 'Good conditions - minimal dragging expected.',
  low: 'Expect some dragging in the shallow areas.',
  poor: 'Frequent dragging and portaging may occur.',
  high: 'Fast current with stronger hydraulics. Experienced paddlers only.',
  flood: 'Dangerous flooding conditions. Do not float.',
  unknown: 'Check conditions locally before launching.',
};

// Compact River Conditions component with inline explanation
function ConditionBadge({ condition }: { condition: FloatPlan['condition'] }) {
  // Use flow rating if available, otherwise fall back to legacy code mapping
  // Condition codes: optimal, low, very_low, too_low, high, dangerous, unknown
  // Flow ratings: good, low, poor, high, flood, unknown
  const flowRating: FlowRating = condition.flowRating ||
    (condition.code === 'optimal' ? 'good' :
     condition.code === 'low' ? 'good' :  // low condition = good/floatable
     condition.code === 'very_low' ? 'low' :  // very_low = some dragging
     condition.code === 'too_low' ? 'poor' :  // too_low = scraping likely
     condition.code === 'dangerous' ? 'flood' :
     condition.code === 'high' ? 'high' :
     'unknown');

  const ratingConfig = FLOW_RATING_CONFIG[flowRating] || FLOW_RATING_CONFIG.unknown;

  return (
    <div className={`rounded-lg overflow-hidden border-2 ${ratingConfig.borderClass}`}>
      {/* Header with rating */}
      <div className={`${ratingConfig.bgClass} ${ratingConfig.textClass} p-3`}>
        <div className="flex items-center gap-2">
          <span className="text-xl">{ratingConfig.emoji}</span>
          <div className="flex-1">
            <p className="font-bold text-base">{ratingConfig.label}</p>
            <p className="text-xs opacity-80">{FLOW_EXPLANATIONS[flowRating]}</p>
          </div>
        </div>
      </div>

      {/* Stats and gauge info */}
      <div className="bg-neutral-50 p-3 space-y-2">
        {/* Gauge readings (larger) */}
        <div className="flex gap-4">
          <div>
            <span className="text-lg font-bold text-neutral-800">{condition.dischargeCfs?.toLocaleString() ?? '—'}</span>
            <span className="text-sm text-neutral-500 ml-1">cfs</span>
          </div>
          <div>
            <span className="text-lg font-bold text-neutral-800">{condition.gaugeHeightFt?.toFixed(2) ?? '—'}</span>
            <span className="text-sm text-neutral-500 ml-1">ft</span>
          </div>
          {condition.percentile !== null && condition.percentile !== undefined && (
            <div>
              <span className="text-lg font-bold text-neutral-800">{Math.round(condition.percentile)}%</span>
              <span className="text-sm text-neutral-500 ml-1">ile</span>
            </div>
          )}
        </div>

        {/* Gauge name with USGS link */}
        {condition.gaugeName && (
          <div className="flex items-center justify-between text-xs">
            <span className="text-neutral-500">{condition.gaugeName}</span>
            {condition.usgsUrl && (
              <a
                href={condition.usgsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary-600 hover:text-primary-700 font-medium inline-flex items-center gap-1"
              >
                USGS Data
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            )}
          </div>
        )}

        {/* Accuracy warning */}
        {condition.accuracyWarning && condition.accuracyWarningReason && (
          <p className="text-xs text-orange-600 bg-orange-50 rounded px-2 py-1 mt-2">
            ⚠ {condition.accuracyWarningReason}
          </p>
        )}
      </div>
    </div>
  );
}

export default function PlanSummary({
  plan,
  isLoading,
  onClose,
  onShare,
}: PlanSummaryProps) {
  const { data: vesselTypes } = useVesselTypes();
  const [selectedVesselTypeId, setSelectedVesselTypeId] = useState<string | null>(null);

  // Find canoe and raft vessel types
  const canoeVessel = vesselTypes?.find(v => v.slug === 'canoe');
  const raftVessel = vesselTypes?.find(v => v.slug === 'raft');

  // Track route changes to reset vessel selection when route changes
  const currentRouteKey = plan ? `${plan.putIn.id}-${plan.takeOut.id}` : null;
  const [lastRouteKey, setLastRouteKey] = useState<string | null>(null);

  // Reset vessel type when route changes (to prevent stale state)
  useEffect(() => {
    if (currentRouteKey && currentRouteKey !== lastRouteKey) {
      setLastRouteKey(currentRouteKey);
      // Reset to plan's vessel type when route changes
      if (plan) {
        setSelectedVesselTypeId(plan.vessel.id);
      }
    }
  }, [currentRouteKey, lastRouteKey, plan]);

  // Set initial vessel type from plan or default to canoe
  useEffect(() => {
    if (plan && !selectedVesselTypeId) {
      setSelectedVesselTypeId(plan.vessel.id);
    } else if (!plan && canoeVessel && !selectedVesselTypeId) {
      setSelectedVesselTypeId(canoeVessel.id);
    }
  }, [plan, canoeVessel, selectedVesselTypeId]);

  // Pre-fetch params for the other vessel type (TanStack Query handles caching)
  const otherVesselId = selectedVesselTypeId === canoeVessel?.id
    ? raftVessel?.id
    : canoeVessel?.id;

  // Params for current selected vessel
  const planParams = plan
    ? {
        riverId: plan.river.id,
        startId: plan.putIn.id,
        endId: plan.takeOut.id,
        vesselTypeId: selectedVesselTypeId || undefined,
      }
    : null;

  // Params for pre-fetching the other vessel type
  const prefetchParams = plan && otherVesselId
    ? {
        riverId: plan.river.id,
        startId: plan.putIn.id,
        endId: plan.takeOut.id,
        vesselTypeId: otherVesselId,
      }
    : null;

  // TanStack Query handles caching natively - vesselTypeId is in the queryKey
  const { data: recalculatedPlan, isLoading: recalculating } = useFloatPlan(planParams);
  // Pre-fetch the other vessel type for instant switching
  useFloatPlan(prefetchParams);

  // Handle vessel toggle - TanStack Query provides instant switching via cached data
  const handleVesselChange = useCallback((vesselId: string) => {
    setSelectedVesselTypeId(vesselId);
  }, []);

  // Use recalculated plan if available, otherwise fall back to initial plan
  const displayPlan = recalculatedPlan ?? plan;

  // Check if put-in is downstream of take-out (upstream warning)
  const isUpstream = displayPlan
    ? displayPlan.putIn.riverMile > displayPlan.takeOut.riverMile
    : false;

  if (isLoading) {
    return (
      <div className="bg-white border-2 border-neutral-200 rounded-lg p-6 w-80 animate-in shadow-md">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-neutral-200 rounded-lg w-2/3"></div>
          <div className="h-4 bg-neutral-200 rounded w-full"></div>
          <div className="h-4 bg-neutral-200 rounded w-3/4"></div>
          <div className="h-20 bg-primary-100 rounded-lg"></div>
          <div className="h-12 bg-neutral-200 rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (!displayPlan) return null;

  return (
    <div className="bg-white border-2 border-neutral-200 rounded-lg w-80 max-h-[85vh] flex flex-col animate-slide-in-right shadow-lg">
      {/* Header */}
      <div className="px-5 py-4 text-white flex-shrink-0 rounded-t-md" style={{ backgroundColor: '#163F4A' }}>
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-lg font-heading font-bold text-white">Your Float Plan</h2>
            <p className="text-sm mt-0.5" style={{ color: '#A3D1DB' }}>{displayPlan.river.name}</p>
          </div>
          <button
            onClick={onClose}
            className="text-white/60 hover:text-white transition-colors p-1"
            aria-label="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Content - scrollable area */}
      <div className="p-5 space-y-4 flex-1 overflow-y-auto scrollbar-thin min-h-0">
        {/* Upstream Warning Pill */}
        {isUpstream && (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border-2 border-red-300 rounded-lg">
            <svg className="w-5 h-5 text-red-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
            <span className="text-sm font-semibold text-red-700">Upstream Route</span>
            <span className="text-xs text-red-600">Put-in is downstream of take-out</span>
          </div>
        )}

        {/* Put-in / Take-out */}
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-support-100 border-2 border-support-400 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-support-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-support-600 uppercase tracking-wide">Put-in</p>
              <p className="font-bold text-neutral-900">{displayPlan.putIn.name}</p>
              <p className="text-sm text-neutral-500">Mile {displayPlan.putIn.riverMile.toFixed(1)}</p>
            </div>
          </div>

          {/* Connector line */}
          <div className="ml-4 border-l-2 border-dashed border-primary-300 h-4"></div>

          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-accent-100 border-2 border-accent-400 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-accent-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-accent-600 uppercase tracking-wide">Take-out</p>
              <p className="font-bold text-neutral-900">{displayPlan.takeOut.name}</p>
              <p className="text-sm text-neutral-500">Mile {displayPlan.takeOut.riverMile.toFixed(1)}</p>
            </div>
          </div>
        </div>

        {/* Float Time & Distance Section */}
        <div className="bg-primary-50 rounded-lg p-4 border border-primary-200">
          {/* Header with vessel toggle */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-primary-700 uppercase tracking-wide">Float Details</p>
            {/* Canoe/Raft Toggle */}
            {canoeVessel && raftVessel && (
              <div className="flex items-center rounded-md p-0.5 border-2 border-neutral-300" style={{ backgroundColor: '#E8DFD0' }}>
                <button
                  onClick={() => handleVesselChange(canoeVessel.id)}
                  disabled={recalculating}
                  className={`px-2.5 py-1 text-xs font-bold rounded transition-all ${recalculating ? 'opacity-50 cursor-not-allowed' : ''}`}
                  style={selectedVesselTypeId === canoeVessel.id
                    ? { backgroundColor: '#2D7889', color: 'white' }
                    : { backgroundColor: 'transparent', color: '#3F3B33' }}
                >
                  Canoe
                </button>
                <button
                  onClick={() => handleVesselChange(raftVessel.id)}
                  disabled={recalculating}
                  className={`px-2.5 py-1 text-xs font-bold rounded transition-all ${recalculating ? 'opacity-50 cursor-not-allowed' : ''}`}
                  style={selectedVesselTypeId === raftVessel.id
                    ? { backgroundColor: '#2D7889', color: 'white' }
                    : { backgroundColor: 'transparent', color: '#3F3B33' }}
                >
                  Raft
                </button>
              </div>
            )}
          </div>

          {/* Float time and distance grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-neutral-600 mb-1">Time</p>
              {recalculating ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-sm text-primary-600">...</p>
                </div>
              ) : displayPlan.floatTime ? (
                <>
                  <p className="text-xl font-bold text-primary-700">{displayPlan.floatTime.formatted}</p>
                  <p className="text-xs text-neutral-500">{displayPlan.floatTime.speedMph} mph avg</p>
                </>
              ) : (
                <p className="text-lg font-bold text-primary-700">--</p>
              )}
            </div>
            <div>
              <p className="text-xs text-neutral-600 mb-1">Distance</p>
              <p className="text-xl font-bold text-primary-700">{displayPlan.distance.formatted}</p>
            </div>
          </div>
        </div>

        {/* Shuttle Section */}
        <div className="rounded-lg p-3 border-2 border-neutral-300" style={{ backgroundColor: '#F4EFE7' }}>
          <p className="text-xs font-bold uppercase tracking-wide flex items-center gap-1 mb-3" style={{ color: '#524D43' }}>
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
            </svg>
            Shuttle
          </p>
          <div className="space-y-2">
            {/* Directions to Put-In */}
            <a
              href={displayPlan.putIn.directionsOverride
                ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(displayPlan.putIn.directionsOverride)}`
                : `https://www.google.com/maps/dir/?api=1&destination=${displayPlan.putIn.coordinates.lat},${displayPlan.putIn.coordinates.lng}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 w-full px-3 py-2.5 rounded-md text-sm font-bold transition-colors border-2 border-neutral-800 shadow-sm hover:shadow-md"
              style={{ backgroundColor: '#4EB86B', color: 'white' }}
            >
              <span className="flex items-center gap-1 flex-shrink-0">
                <span className="text-base">🏠</span>
                <span style={{ color: 'rgba(255,255,255,0.7)' }}>→</span>
                <span className="w-2 h-2 rounded-full bg-white"></span>
              </span>
              Directions to Put-In
              <svg className="w-4 h-4 ml-auto" style={{ color: 'rgba(255,255,255,0.8)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
            {/* Shuttle: Put-In to Take-Out */}
            <a
              href={(() => {
                const origin = displayPlan.putIn.directionsOverride
                  ? encodeURIComponent(displayPlan.putIn.directionsOverride)
                  : `${displayPlan.putIn.coordinates.lat},${displayPlan.putIn.coordinates.lng}`;
                const dest = displayPlan.takeOut.directionsOverride
                  ? encodeURIComponent(displayPlan.takeOut.directionsOverride)
                  : `${displayPlan.takeOut.coordinates.lat},${displayPlan.takeOut.coordinates.lng}`;
                return `https://www.google.com/maps/dir/${origin}/${dest}`;
              })()}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 w-full px-3 py-2.5 rounded-md text-sm font-bold transition-colors border-2 border-neutral-800 shadow-sm hover:shadow-md"
              style={{ backgroundColor: '#2D7889', color: 'white' }}
            >
              <span className="flex items-center gap-1 flex-shrink-0">
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#4EB86B' }}></span>
                <span style={{ color: 'rgba(255,255,255,0.7)' }}>→</span>
                <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: '#F07052' }}></span>
              </span>
              Shuttle Route
              <svg className="w-4 h-4 ml-auto" style={{ color: 'rgba(255,255,255,0.8)' }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>

        {/* Condition Warnings */}
        {displayPlan.condition.code === 'dangerous' && <DangerousWarning />}
        {displayPlan.condition.code === 'unknown' && <UnknownConditionsWarning />}

        {/* River Conditions - Flow Rating Based */}
        <ConditionBadge condition={displayPlan.condition} />

        {/* Hazards */}
        {displayPlan.hazards.length > 0 && (
          <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
            <p className="text-xs font-medium text-amber-700 uppercase tracking-wide mb-2">
              ⚠ Hazards on Route
            </p>
            <ul className="space-y-1">
              {displayPlan.hazards.map((hazard) => (
                <li key={hazard.id} className="text-sm text-amber-800">
                  <span className="font-medium">{hazard.name}</span>
                  <span className="text-amber-600"> - Mile {hazard.riverMile.toFixed(1)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Warnings */}
        {displayPlan.warnings.length > 0 && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <ul className="space-y-1">
              {displayPlan.warnings.map((warning, idx) => (
                <li key={idx} className="text-sm text-red-700 flex items-start gap-2">
                  <span className="text-red-500">•</span>
                  {warning}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="border-t border-neutral-200 p-4 bg-neutral-50 flex-shrink-0 rounded-b-md">
        <div className="flex gap-3">
          <button onClick={onShare} className="btn-primary flex-1 flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            Share Plan
          </button>
          <button onClick={onClose} className="btn-secondary px-4">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
