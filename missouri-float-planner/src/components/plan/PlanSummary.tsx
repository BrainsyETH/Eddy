'use client';

// src/components/plan/PlanSummary.tsx
// Themed float plan summary panel — neo-brutalist (chunky borders, hard offset
// shadows, warm palette, display headings) to match the rest of the site.

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { Share2, MapPin, Flag, Navigation, AlertTriangle, ExternalLink } from 'lucide-react';
import type { FloatPlan, ConditionCode } from '@/types/api';
import { useVesselTypes } from '@/hooks/useVesselTypes';
import { useFloatPlan } from '@/hooks/useFloatPlan';
import { getEddyImageForCondition } from '@/constants';

// Condition display config — matches GaugeOverview labels and colors
const CONDITION_CONFIG: Record<ConditionCode, {
  label: string;
  bgClass: string;
  textClass: string;
  explanation: string;
}> = {
  flowing: {
    label: 'Flowing',
    bgClass: 'bg-emerald-500',
    textClass: 'text-white',
    explanation: 'Ideal conditions for floating.',
  },
  good: {
    label: 'Good',
    bgClass: 'bg-lime-500',
    textClass: 'text-white',
    explanation: 'Floatable with minimal dragging.',
  },
  low: {
    label: 'Low',
    bgClass: 'bg-yellow-500',
    textClass: 'text-neutral-900',
    explanation: 'Expect some dragging in shallow areas.',
  },
  too_low: {
    label: 'Too Low',
    bgClass: 'bg-stone-500',
    textClass: 'text-white',
    explanation: 'Frequent dragging and portaging likely.',
  },
  high: {
    label: 'High',
    bgClass: 'bg-orange-500',
    textClass: 'text-white',
    explanation: 'Fast current — use caution.',
  },
  dangerous: {
    label: 'Flood',
    bgClass: 'bg-red-600',
    textClass: 'text-white',
    explanation: 'Dangerous flooding. Do not float.',
  },
  unknown: {
    label: 'Unknown',
    bgClass: 'bg-neutral-500',
    textClass: 'text-white',
    explanation: 'Check conditions locally before launching.',
  },
};

interface PlanSummaryProps {
  plan: FloatPlan | null;
  isLoading: boolean;
  onClose: () => void;
  onShare: () => void;
}

// Chunky stat tile — the neo-brutalist unit for a single number + label.
function StatTile({ value, unit, label, loading = false }: { value: string; unit?: string; label: string; loading?: boolean }) {
  return (
    <div className="rounded-xl border-2 border-neutral-900 bg-neutral-50 px-3 py-2.5 text-center shadow-[3px_3px_0_#DBD5CA]">
      {loading ? (
        <div className="flex items-center justify-center h-8">
          <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <p className="text-2xl font-bold text-neutral-900 leading-none tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>
          {value}
          {unit && <span className="text-sm font-semibold text-neutral-400 ml-0.5">{unit}</span>}
        </p>
      )}
      <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-neutral-500">{label}</p>
    </div>
  );
}

// Dangerous Conditions Warning
function DangerousWarning() {
  return (
    <div className="rounded-xl border-2 border-red-600 bg-red-50 p-3 shadow-[3px_3px_0_#DC2626]">
      <div className="flex items-start gap-2">
        <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
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

// Unknown Conditions Warning
function UnknownConditionsWarning() {
  return (
    <div className="rounded-xl border-2 border-amber-500 bg-amber-50 p-3 shadow-[3px_3px_0_#E5A000]">
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

// River conditions strip — solid condition fill + Eddy otter, matching the
// planner's FloatPlanCard so the shared view reads the same at a glance.
function ConditionStrip({ condition }: { condition: FloatPlan['condition'] }) {
  const code: ConditionCode = condition.code || 'unknown';
  const config = CONDITION_CONFIG[code] || CONDITION_CONFIG.unknown;
  const gaugeLine = [
    condition.gaugeHeightFt != null ? `${condition.gaugeHeightFt.toFixed(1)} ft` : null,
    condition.dischargeCfs != null ? `${condition.dischargeCfs.toLocaleString()} cfs` : null,
    condition.gaugeName || null,
  ].filter(Boolean).join(' · ') || 'No live gauge reading';

  return (
    <div className={`rounded-xl border-2 border-neutral-900 ${config.bgClass} px-3 py-2.5 flex items-center gap-2.5 shadow-[3px_3px_0_#2D2A24]`}>
      <Image
        src={getEddyImageForCondition(code)}
        alt={config.label}
        width={44}
        height={44}
        className="flex-shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-bold ${config.textClass}`}>{config.label}</p>
        <p className={`text-[11px] ${config.textClass} opacity-80 truncate`}>{gaugeLine}</p>
      </div>
      {condition.usgsUrl && (
        <a
          href={condition.usgsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`flex-shrink-0 text-[10px] font-bold uppercase tracking-wider ${config.textClass} underline-offset-2 hover:underline`}
        >
          USGS ↗
        </a>
      )}
    </div>
  );
}

export default function PlanSummary({
  plan,
  isLoading,
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
      <div className="w-full rounded-2xl border-[3px] border-neutral-900 bg-white p-6 shadow-[6px_6px_0_#0F2D35]">
        <div className="animate-pulse space-y-4 lg:space-y-0 lg:grid lg:grid-cols-4 lg:gap-4">
          <div className="space-y-3">
            <div className="h-6 bg-neutral-200 rounded-lg w-2/3"></div>
            <div className="h-4 bg-neutral-200 rounded w-full"></div>
          </div>
          <div className="h-20 bg-primary-100 rounded-lg"></div>
          <div className="h-16 bg-neutral-200 rounded-lg"></div>
          <div className="h-16 bg-neutral-200 rounded-lg"></div>
        </div>
      </div>
    );
  }

  if (!displayPlan) return null;

  const conditionCode: ConditionCode = displayPlan.condition.code || 'unknown';

  return (
    <div className="w-full rounded-2xl border-[3px] border-neutral-900 bg-white overflow-hidden shadow-[6px_6px_0_#0F2D35]">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3 lg:px-5 lg:py-4 bg-primary-800 border-b-[3px] border-neutral-900">
        <div className="flex items-center gap-3 min-w-0">
          <Image
            src={getEddyImageForCondition(conditionCode)}
            alt=""
            width={40}
            height={40}
            className="flex-shrink-0 hidden sm:block"
          />
          <div className="min-w-0">
            <h2 className="text-base lg:text-lg font-bold text-white leading-tight" style={{ fontFamily: 'var(--font-display)' }}>
              Your Float Plan
            </h2>
            <p className="text-xs text-primary-200 truncate">{displayPlan.river.name}</p>
          </div>
        </div>
        <button
          onClick={onShare}
          className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border-2 border-neutral-900 bg-accent-500 text-white text-sm font-bold shadow-[2px_2px_0_#0F2D35] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[3px_3px_0_#0F2D35] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
        >
          <Share2 className="w-4 h-4" />
          <span className="hidden sm:inline">Share</span>
        </button>
      </div>

      {/* Content */}
      <div className="p-4 lg:p-5 bg-neutral-50">
        {/* Upstream Warning */}
        {isUpstream && (
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border-2 border-red-500 bg-red-50 mb-4 shadow-[3px_3px_0_#DC2626]">
            <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0" />
            <span className="text-sm font-bold text-red-700">Upstream Route</span>
            <span className="text-xs text-red-600">Put-in is downstream of take-out</span>
          </div>
        )}

        {/* Main content - horizontal on desktop, vertical on mobile */}
        <div className="space-y-4 lg:space-y-0 lg:grid lg:grid-cols-4 lg:gap-4">
          {/* Column 1: Route */}
          <div className="rounded-xl border-2 border-neutral-900 bg-white p-3 shadow-[3px_3px_0_#DBD5CA]">
            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-full bg-support-100 border-2 border-support-500 flex items-center justify-center flex-shrink-0">
                <MapPin className="w-3.5 h-3.5 text-support-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-support-600 uppercase tracking-wide">Put-in</p>
                <p className="font-bold text-neutral-900 text-sm truncate">{displayPlan.putIn.name}</p>
                <p className="text-xs text-neutral-500">Mile {displayPlan.putIn.riverMile.toFixed(1)}</p>
              </div>
            </div>

            {/* Connector */}
            <div className="ml-3.5 border-l-2 border-dashed border-neutral-400 h-3 my-0.5"></div>

            <div className="flex items-start gap-2.5">
              <div className="w-7 h-7 rounded-full bg-accent-100 border-2 border-accent-500 flex items-center justify-center flex-shrink-0">
                <Flag className="w-3.5 h-3.5 text-accent-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold text-accent-600 uppercase tracking-wide">Take-out</p>
                <p className="font-bold text-neutral-900 text-sm truncate">{displayPlan.takeOut.name}</p>
                <p className="text-xs text-neutral-500">Mile {displayPlan.takeOut.riverMile.toFixed(1)}</p>
              </div>
            </div>

            {/* Road access warnings */}
            {displayPlan.warnings.length > 0 && (
              <div className="mt-2 space-y-1">
                {displayPlan.warnings.map((warning, idx) => (
                  <p key={idx} className="text-xs text-red-600 flex items-start gap-1">
                    <span>⚠</span> {warning}
                  </p>
                ))}
              </div>
            )}
          </div>

          {/* Column 2: Float Details */}
          <div className="rounded-xl border-2 border-neutral-900 bg-white p-3 shadow-[3px_3px_0_#DBD5CA]">
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-bold text-neutral-500 uppercase tracking-wide">Float Details</p>
              {canoeVessel && raftVessel && (
                <div className="inline-flex items-center rounded-lg p-0.5 border-2 border-neutral-900 bg-neutral-100">
                  <button
                    onClick={() => handleVesselChange(canoeVessel.id)}
                    disabled={recalculating}
                    className={`px-2 py-0.5 text-xs font-bold rounded-md transition-all ${recalculating ? 'opacity-50 cursor-not-allowed' : ''} ${
                      selectedVesselTypeId === canoeVessel.id ? 'bg-primary-600 text-white' : 'text-neutral-600'
                    }`}
                  >
                    Canoe
                  </button>
                  <button
                    onClick={() => handleVesselChange(raftVessel.id)}
                    disabled={recalculating}
                    className={`px-2 py-0.5 text-xs font-bold rounded-md transition-all ${recalculating ? 'opacity-50 cursor-not-allowed' : ''} ${
                      selectedVesselTypeId === raftVessel.id ? 'bg-primary-600 text-white' : 'text-neutral-600'
                    }`}
                  >
                    Raft
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <StatTile
                loading={recalculating}
                value={displayPlan.floatTime
                  ? displayPlan.floatTime.formatted
                  : conditionCode === 'dangerous' ? 'N/A' : '--'}
                label="Time"
              />
              <StatTile value={displayPlan.distance.formatted} label="Distance" />
            </div>
          </div>

          {/* Column 3: Conditions */}
          <div>
            {conditionCode === 'dangerous' ? (
              <div className="space-y-2">
                <DangerousWarning />
                <ConditionStrip condition={displayPlan.condition} />
              </div>
            ) : conditionCode === 'unknown' ? (
              <UnknownConditionsWarning />
            ) : (
              <ConditionStrip condition={displayPlan.condition} />
            )}
          </div>

          {/* Column 4: Shuttle */}
          <div className="rounded-xl border-2 border-neutral-900 bg-white p-3 shadow-[3px_3px_0_#DBD5CA]">
            <p className="text-[10px] font-bold uppercase tracking-wide flex items-center gap-1 mb-2 text-neutral-500">
              <Navigation className="w-3.5 h-3.5" />
              Shuttle
            </p>
            <div className="space-y-2">
              <a
                href={displayPlan.putIn.directionsOverride
                  ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(displayPlan.putIn.directionsOverride)}`
                  : `https://www.google.com/maps/dir/?api=1&destination=${displayPlan.putIn.coordinates.lat},${displayPlan.putIn.coordinates.lng}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-xs font-bold text-white border-2 border-neutral-900 bg-support-500 shadow-[2px_2px_0_#275C35] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[3px_3px_0_#275C35] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
              >
                <span className="truncate">Directions to Put-In</span>
                <ExternalLink className="w-3.5 h-3.5 ml-auto flex-shrink-0 opacity-80" />
              </a>
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
                className="flex items-center gap-2 w-full px-2.5 py-2 rounded-lg text-xs font-bold text-white border-2 border-neutral-900 bg-primary-600 shadow-[2px_2px_0_#0F2D35] transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 hover:shadow-[3px_3px_0_#0F2D35] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
              >
                <span className="truncate">Drive Route</span>
                <ExternalLink className="w-3.5 h-3.5 ml-auto flex-shrink-0 opacity-80" />
              </a>
            </div>
          </div>
        </div>

        {/* Hazards below main row */}
        {displayPlan.hazards.length > 0 && (
          <div className="mt-4">
            <div className="rounded-xl border-2 border-amber-500 bg-amber-50 p-3 shadow-[3px_3px_0_#E5A000]">
              <p className="text-xs font-bold text-amber-700 uppercase tracking-wide mb-2 flex items-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Hazards on Route
              </p>
              <ul className="space-y-1">
                {displayPlan.hazards.map((hazard) => (
                  <li key={hazard.id} className="text-sm text-amber-800">
                    <span className="font-bold">{hazard.name}</span>
                    <span className="text-amber-600"> · Mile {hazard.riverMile.toFixed(1)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
