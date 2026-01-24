'use client';

// src/components/plan/PlanSummary.tsx
// Themed float plan summary panel
// Simplified: TanStack Query handles caching natively via vesselTypeId in queryKey

import { useState, useEffect, useCallback } from 'react';
import type { FloatPlan, ConditionCode } from '@/types/api';
import { useVesselTypes } from '@/hooks/useVesselTypes';
import { useFloatPlan } from '@/hooks/useFloatPlan';

interface PlanSummaryProps {
  plan: FloatPlan | null;
  isLoading: boolean;
  onClose: () => void;
  onShare: () => void;
}

const conditionStyles: Record<ConditionCode, { bg: string; text: string; icon: string }> = {
  optimal: { bg: 'bg-emerald-100', text: 'text-emerald-700', icon: '✓' },
  low: { bg: 'bg-amber-100', text: 'text-amber-700', icon: '↓' },
  very_low: { bg: 'bg-orange-100', text: 'text-orange-700', icon: '⚠' },
  high: { bg: 'bg-orange-100', text: 'text-orange-700', icon: '↑' },
  too_low: { bg: 'bg-red-100', text: 'text-red-700', icon: '✕' },
  dangerous: { bg: 'bg-red-200', text: 'text-red-800', icon: '⚠' },
  unknown: { bg: 'bg-bluff-100', text: 'text-bluff-600', icon: '?' },
};

// Dangerous Conditions Warning - displays when conditions are dangerous
function DangerousWarning() {
  return (
    <div className="bg-red-50 border-2 border-red-400 rounded-xl p-3">
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
    <div className="bg-amber-50 border-2 border-amber-300 rounded-xl p-3">
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
  // vesselTypeId is included in queryKey for native caching
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
  // Mile 0.0 is at the headwaters (start) of rivers, increasing downstream.
  // Upstream trip = put-in has higher mile (closer to mouth) than take-out
  const isUpstream = displayPlan
    ? displayPlan.putIn.riverMile > displayPlan.takeOut.riverMile
    : false;

  if (isLoading) {
    return (
      <div className="glass-card rounded-2xl p-6 w-80 animate-in">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-bluff-200 rounded-lg w-2/3"></div>
          <div className="h-4 bg-bluff-200 rounded w-full"></div>
          <div className="h-4 bg-bluff-200 rounded w-3/4"></div>
          <div className="h-20 bg-river-100 rounded-xl"></div>
          <div className="h-12 bg-bluff-200 rounded-xl"></div>
        </div>
      </div>
    );
  }

  if (!displayPlan) return null;

  const conditionStyle = conditionStyles[displayPlan.condition.code];

  return (
    <div className="glass-card rounded-2xl w-80 max-h-[85vh] flex flex-col animate-slide-in-right">
      {/* Header */}
      <div className="bg-gradient-to-r from-ozark-800 to-ozark-700 px-5 py-4 text-white flex-shrink-0">
        <div className="flex justify-between items-start">
          <div>
            <h2 className="text-lg font-bold">Your Float Plan</h2>
            <p className="text-river-300 text-sm mt-0.5">{displayPlan.river.name}</p>
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
          <div className="flex items-center gap-2 px-3 py-2 bg-red-500/20 border-2 border-red-500/40 rounded-xl">
            <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
            </svg>
            <span className="text-sm font-semibold text-red-400">Upstream Route</span>
            <span className="text-xs text-red-300">Put-in is downstream of take-out</span>
          </div>
        )}

        {/* Put-in / Take-out */}
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-river-forest/20 border-2 border-river-forest/40 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-river-forest" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-bluff-500 uppercase tracking-wide">Put-in</p>
              <p className="font-semibold text-ozark-800">{displayPlan.putIn.name}</p>
              <p className="text-sm text-bluff-500">Mile {displayPlan.putIn.riverMile.toFixed(1)}</p>
            </div>
          </div>

          {/* Connector line */}
          <div className="ml-4 border-l-2 border-dashed border-river-water/30 h-4"></div>

          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-sky-warm/20 border-2 border-sky-warm/40 flex items-center justify-center flex-shrink-0">
              <svg className="w-4 h-4 text-sky-warm" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-bluff-500 uppercase tracking-wide">Take-out</p>
              <p className="font-semibold text-ozark-800">{displayPlan.takeOut.name}</p>
              <p className="text-sm text-bluff-500">Mile {displayPlan.takeOut.riverMile.toFixed(1)}</p>
            </div>
          </div>
        </div>

        {/* Float Time & Distance Section */}
        <div className="bg-river-water/10 rounded-xl p-4 border border-river-water/20">
          {/* Header with vessel toggle */}
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-river-water uppercase tracking-wide">Float Details</p>
            {/* Canoe/Raft Toggle */}
            {canoeVessel && raftVessel && (
              <div className="flex items-center bg-river-deep/80 rounded-lg p-0.5 border border-white/10">
                <button
                  onClick={() => handleVesselChange(canoeVessel.id)}
                  disabled={recalculating}
                  className={`px-2.5 py-1 text-xs font-semibold rounded transition-all ${
                    selectedVesselTypeId === canoeVessel.id
                      ? 'bg-river-water text-white shadow-sm'
                      : 'text-river-gravel hover:text-white hover:bg-white/10'
                  } ${recalculating ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  Canoe
                </button>
                <button
                  onClick={() => handleVesselChange(raftVessel.id)}
                  disabled={recalculating}
                  className={`px-2.5 py-1 text-xs font-semibold rounded transition-all ${
                    selectedVesselTypeId === raftVessel.id
                      ? 'bg-river-water text-white shadow-sm'
                      : 'text-river-gravel hover:text-white hover:bg-white/10'
                  } ${recalculating ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  Raft
                </button>
              </div>
            )}
          </div>

          {/* Float time and distance grid */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-river-gravel mb-1">Time</p>
              {recalculating ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-river-water border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-sm text-river-water">...</p>
                </div>
              ) : displayPlan.floatTime ? (
                <>
                  <p className="text-xl font-bold text-river-water">{displayPlan.floatTime.formatted}</p>
                  <p className="text-xs text-river-gravel">{displayPlan.floatTime.speedMph} mph avg</p>
                </>
              ) : (
                <p className="text-lg font-bold text-river-water">--</p>
              )}
            </div>
            <div>
              <p className="text-xs text-river-gravel mb-1">Distance</p>
              <p className="text-xl font-bold text-river-water">{displayPlan.distance.formatted}</p>
            </div>
          </div>
        </div>

        {/* Shuttle & Driving Directions Section */}
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-medium text-blue-800 uppercase tracking-wide flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              Shuttle
            </p>
            <div className="text-right">
              <p className="text-sm font-bold text-blue-800">{displayPlan.driveBack.formatted}</p>
              <p className="text-xs text-blue-600">{displayPlan.driveBack.miles.toFixed(1)} mi drive</p>
            </div>
          </div>
          <div className="space-y-2">
            {/* Directions to Put-In */}
            <a
              href={displayPlan.putIn.directionsOverride
                ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(displayPlan.putIn.directionsOverride)}`
                : `https://www.google.com/maps/dir/?api=1&destination=${displayPlan.putIn.coordinates.lat},${displayPlan.putIn.coordinates.lng}`
              }
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 w-full px-3 py-2 bg-white border border-blue-200 rounded-lg text-sm text-blue-800 font-medium hover:bg-blue-100 transition-colors"
            >
              <span className="w-2.5 h-2.5 rounded-full bg-river-forest flex-shrink-0"></span>
              Directions to Put-In
              <svg className="w-4 h-4 ml-auto text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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
              className="flex items-center gap-2 w-full px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <span className="flex items-center gap-1 flex-shrink-0">
                <span className="w-2 h-2 rounded-full bg-river-forest"></span>
                <span className="text-blue-200">→</span>
                <span className="w-2 h-2 rounded-full bg-sky-warm"></span>
              </span>
              Shuttle Route
              <svg className="w-4 h-4 ml-auto text-blue-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
            </a>
          </div>
        </div>

        {/* Condition Warnings */}
        {displayPlan.condition.code === 'dangerous' && <DangerousWarning />}
        {displayPlan.condition.code === 'unknown' && <UnknownConditionsWarning />}

        {/* Condition Badge */}
        <div className={`rounded-xl p-3 ${conditionStyle.bg}`}>
          <div className="flex items-center gap-2">
            <span className="text-lg">{conditionStyle.icon}</span>
            <div>
              <p className={`font-semibold ${conditionStyle.text}`}>{displayPlan.condition.label}</p>
              {displayPlan.condition.gaugeHeightFt && (
                <p className={`text-sm ${conditionStyle.text} opacity-75`}>
                  Gauge: {displayPlan.condition.gaugeHeightFt.toFixed(2)} ft
                </p>
              )}
            </div>
          </div>
          {displayPlan.condition.accuracyWarning && (
            <p className="text-xs mt-2 text-orange-600 bg-orange-50 rounded-lg px-2 py-1">
              ⚠ {displayPlan.condition.accuracyWarningReason}
            </p>
          )}
        </div>

        {/* Hazards */}
        {displayPlan.hazards.length > 0 && (
          <div className="bg-amber-50 rounded-xl p-3">
            <p className="text-xs font-medium text-amber-600 uppercase tracking-wide mb-2">
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
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
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
      <div className="border-t border-white/10 p-4 bg-river-deep/50 flex-shrink-0">
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
