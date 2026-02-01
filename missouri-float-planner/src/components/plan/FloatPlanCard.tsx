'use client';

// src/components/plan/FloatPlanCard.tsx
// Merged journey card showing put-in and take-out side by side with float details

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, MapPin, Share2, Download, X } from 'lucide-react';
import type { AccessPoint, FloatPlan, ConditionCode } from '@/types/api';
import { useVesselTypes } from '@/hooks/useVesselTypes';
import { useFloatPlan } from '@/hooks/useFloatPlan';

// Condition display config
const CONDITION_CONFIG: Record<ConditionCode, {
  label: string;
  emoji: string;
  bgClass: string;
  textClass: string;
  borderClass: string;
}> = {
  optimal: {
    label: 'Optimal',
    emoji: '✓',
    bgClass: 'bg-emerald-500',
    textClass: 'text-white',
    borderClass: 'border-emerald-400',
  },
  low: {
    label: 'Okay',
    emoji: '✓',
    bgClass: 'bg-lime-500',
    textClass: 'text-white',
    borderClass: 'border-lime-400',
  },
  very_low: {
    label: 'Low',
    emoji: '↓',
    bgClass: 'bg-yellow-500',
    textClass: 'text-neutral-900',
    borderClass: 'border-yellow-400',
  },
  too_low: {
    label: 'Too Low',
    emoji: '⚠',
    bgClass: 'bg-neutral-400',
    textClass: 'text-white',
    borderClass: 'border-neutral-300',
  },
  high: {
    label: 'High',
    emoji: '⚡',
    bgClass: 'bg-orange-500',
    textClass: 'text-white',
    borderClass: 'border-orange-400',
  },
  dangerous: {
    label: 'Flood',
    emoji: '🚫',
    bgClass: 'bg-red-600',
    textClass: 'text-white',
    borderClass: 'border-red-400',
  },
  unknown: {
    label: 'Unknown',
    emoji: '?',
    bgClass: 'bg-neutral-500',
    textClass: 'text-white',
    borderClass: 'border-neutral-400',
  },
};

interface FloatPlanCardProps {
  plan: FloatPlan | null;
  isLoading: boolean;
  putInPoint: AccessPoint | null;
  takeOutPoint: AccessPoint | null;
  onClearPutIn: () => void;
  onClearTakeOut: () => void;
  onShare: () => void;
  onDownloadImage: () => void;
  riverSlug: string;
  vesselTypeId: string | null;
}

// Access Point Detail Card (used in both single and dual selection states)
function AccessPointDetailCard({
  point,
  isPutIn,
  onClear,
  isExpanded,
  onToggleExpand,
  showExpandToggle = true,
}: {
  point: AccessPoint;
  isPutIn: boolean;
  onClear: () => void;
  isExpanded: boolean;
  onToggleExpand: () => void;
  showExpandToggle?: boolean;
}) {
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const hasImages = point.imageUrls && point.imageUrls.length > 0;

  const labelColor = isPutIn ? 'bg-support-500' : 'bg-accent-500';
  const labelText = isPutIn ? 'PUT-IN' : 'TAKE-OUT';
  const borderColor = isPutIn ? 'border-support-400' : 'border-accent-400';

  return (
    <div className={`bg-white rounded-xl border-2 ${borderColor} overflow-hidden shadow-md`}>
      {/* Header */}
      <div className="p-3 border-b border-neutral-100">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`px-2 py-0.5 ${labelColor} text-white text-xs font-bold rounded`}>
                {labelText}
              </span>
              <span className="text-xs text-neutral-500">Mile {point.riverMile.toFixed(1)}</span>
            </div>
            <h3 className="font-bold text-neutral-900 text-base mt-1 truncate">{point.name}</h3>
            <p className="text-sm text-neutral-500 capitalize">
              {(point.types && point.types.length > 0 ? point.types : [point.type])
                .map(t => t.replace('_', ' '))
                .join(' / ')}
            </p>
          </div>
          <button
            onClick={onClear}
            className="p-1.5 hover:bg-neutral-100 rounded-full flex-shrink-0"
            aria-label="Clear selection"
          >
            <X size={16} className="text-neutral-400" />
          </button>
        </div>
      </div>

      {/* Image */}
      {hasImages && (
        <div className="relative w-full aspect-[16/9] bg-neutral-100">
          <Image
            src={point.imageUrls[currentImageIndex]}
            alt={point.name}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, 33vw"
          />
          {point.imageUrls.length > 1 && (
            <>
              <button
                onClick={() => setCurrentImageIndex(i => (i - 1 + point.imageUrls.length) % point.imageUrls.length)}
                className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/50 text-white rounded-full hover:bg-black/70"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                onClick={() => setCurrentImageIndex(i => (i + 1) % point.imageUrls.length)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 bg-black/50 text-white rounded-full hover:bg-black/70"
              >
                <ChevronRight size={16} />
              </button>
              <div className="absolute bottom-2 right-2 px-2 py-0.5 bg-black/60 text-white text-xs rounded">
                {currentImageIndex + 1} / {point.imageUrls.length}
              </div>
            </>
          )}
        </div>
      )}

      {/* Expandable Details */}
      {showExpandToggle && (
        <button
          onClick={onToggleExpand}
          className="w-full px-3 py-2 flex items-center justify-between text-sm text-neutral-600 hover:bg-neutral-50 border-t border-neutral-100"
        >
          <span>{isExpanded ? 'Hide details' : 'View details'}</span>
          {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      )}

      {/* Details Content */}
      {(isExpanded || !showExpandToggle) && (
        <div className="p-3 border-t border-neutral-100 space-y-2">
          {/* Badges */}
          <div className="flex gap-2 flex-wrap">
            {point.isPublic ? (
              <span className="px-2 py-0.5 bg-support-100 text-support-700 text-xs font-medium rounded">Public</span>
            ) : (
              <span className="px-2 py-0.5 bg-neutral-100 text-neutral-600 text-xs font-medium rounded">Private</span>
            )}
            {point.feeRequired && (
              <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-xs font-medium rounded">Fee Required</span>
            )}
          </div>

          {/* Info */}
          <div className="text-sm text-neutral-600 space-y-1.5">
            {point.description && (
              <p className="line-clamp-3">{point.description}</p>
            )}
            {point.parkingInfo && (
              <p><span className="font-medium">Parking:</span> {point.parkingInfo}</p>
            )}
            {point.roadAccess && (
              <p><span className="font-medium">Road:</span> {point.roadAccess}</p>
            )}
            {point.facilities && (
              <p><span className="font-medium">Facilities:</span> {point.facilities}</p>
            )}
          </div>

          {/* Directions Link */}
          <a
            href={point.directionsOverride
              ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(point.directionsOverride)}`
              : `https://www.google.com/maps/dir/?api=1&destination=${point.coordinates.lat},${point.coordinates.lng}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-primary-600 hover:text-primary-700 font-medium"
          >
            <MapPin size={14} />
            Get Directions
          </a>
        </div>
      )}
    </div>
  );
}

// Single Selection CTA (prompts user to select the other point)
function SelectOtherPointCTA({
  type,
}: {
  type: 'put-in' | 'take-out';
}) {
  return (
    <div className="bg-neutral-50 rounded-xl border-2 border-dashed border-neutral-300 p-6 flex flex-col items-center justify-center text-center min-h-[200px]">
      <div className="w-12 h-12 rounded-full bg-neutral-200 flex items-center justify-center mb-3">
        <span className="text-2xl text-neutral-400">+</span>
      </div>
      <p className="text-sm font-medium text-neutral-600">
        Select a {type}
      </p>
      <p className="text-xs text-neutral-400 mt-1">
        to calculate your float
      </p>
    </div>
  );
}

// Journey Center Section (distance, time, conditions, shuttle)
function JourneyCenter({
  plan,
  isLoading,
  selectedVesselTypeId,
  onVesselChange,
  recalculating,
}: {
  plan: FloatPlan;
  isLoading: boolean;
  selectedVesselTypeId: string | null;
  onVesselChange: (id: string) => void;
  recalculating: boolean;
}) {
  const { data: vesselTypes } = useVesselTypes();
  const canoeVessel = vesselTypes?.find(v => v.slug === 'canoe');
  const raftVessel = vesselTypes?.find(v => v.slug === 'raft');

  const conditionCode: ConditionCode = plan.condition.code || 'unknown';
  const conditionConfig = CONDITION_CONFIG[conditionCode] || CONDITION_CONFIG.unknown;

  // Check if upstream route
  const isUpstream = plan.putIn.riverMile > plan.takeOut.riverMile;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="text-center mb-4">
        <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-500">Your Float</h3>
        <div className="flex items-center justify-center gap-2 mt-1">
          <span className="text-2xl font-bold text-neutral-900">{plan.distance.formatted}</span>
          <span className="text-neutral-400">•</span>
          {isLoading || recalculating ? (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : (
            <span className="text-2xl font-bold text-neutral-900">{plan.floatTime?.formatted || '--'}</span>
          )}
        </div>
        {/* Visual route line */}
        <div className="flex items-center justify-center gap-2 mt-2">
          <div className="w-3 h-3 rounded-full bg-support-500"></div>
          <div className="w-16 h-0.5 bg-gradient-to-r from-support-400 to-accent-400"></div>
          <div className="text-lg">▶</div>
          <div className="w-16 h-0.5 bg-gradient-to-r from-support-400 to-accent-400"></div>
          <div className="w-3 h-3 rounded-full bg-accent-500"></div>
        </div>
      </div>

      {/* Upstream Warning */}
      {isUpstream && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg mb-3 text-xs">
          <span className="text-red-500">⚠</span>
          <span className="text-red-700 font-medium">Upstream route - you&apos;ll paddle against current</span>
        </div>
      )}

      {/* Vessel Toggle */}
      {canoeVessel && raftVessel && (
        <div className="flex justify-center mb-4">
          <div className="inline-flex items-center rounded-lg p-1 border-2 border-neutral-200 bg-neutral-100">
            <button
              onClick={() => onVesselChange(canoeVessel.id)}
              disabled={recalculating}
              className={`px-3 py-1.5 text-sm font-bold rounded-md transition-all ${
                recalculating ? 'opacity-50 cursor-not-allowed' : ''
              } ${
                selectedVesselTypeId === canoeVessel.id
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              🛶 Canoe
            </button>
            <button
              onClick={() => onVesselChange(raftVessel.id)}
              disabled={recalculating}
              className={`px-3 py-1.5 text-sm font-bold rounded-md transition-all ${
                recalculating ? 'opacity-50 cursor-not-allowed' : ''
              } ${
                selectedVesselTypeId === raftVessel.id
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-neutral-600 hover:bg-neutral-200'
              }`}
            >
              🚣 Raft
            </button>
          </div>
        </div>
      )}

      {/* Conditions */}
      <div className={`rounded-lg overflow-hidden border-2 ${conditionConfig.borderClass} mb-4`}>
        <div className={`${conditionConfig.bgClass} ${conditionConfig.textClass} px-3 py-2`}>
          <div className="flex items-center gap-2">
            <span className="text-lg">{conditionConfig.emoji}</span>
            <span className="font-bold">{conditionConfig.label}</span>
          </div>
        </div>
        <div className="bg-neutral-50 px-3 py-2">
          <div className="flex gap-4 text-sm">
            <div>
              <span className="font-bold text-neutral-800">{plan.condition.dischargeCfs?.toLocaleString() ?? '—'}</span>
              <span className="text-neutral-500 ml-1">cfs</span>
            </div>
            <div>
              <span className="font-bold text-neutral-800">{plan.condition.gaugeHeightFt?.toFixed(2) ?? '—'}</span>
              <span className="text-neutral-500 ml-1">ft</span>
            </div>
          </div>
          {plan.condition.gaugeName && (
            <p className="text-xs text-neutral-500 mt-1">{plan.condition.gaugeName}</p>
          )}
        </div>
      </div>

      {/* Shuttle Section */}
      <div className="rounded-lg border-2 border-neutral-200 p-3" style={{ backgroundColor: '#F4EFE7' }}>
        <p className="text-xs font-bold uppercase tracking-wide text-neutral-600 mb-2 flex items-center gap-1">
          <span>🚗</span> Shuttle
        </p>
        <div className="space-y-2">
          <a
            href={plan.putIn.directionsOverride
              ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(plan.putIn.directionsOverride)}`
              : `https://www.google.com/maps/dir/?api=1&destination=${plan.putIn.coordinates.lat},${plan.putIn.coordinates.lng}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-xs font-bold transition-colors border-2 border-neutral-700 bg-support-500 text-white hover:bg-support-600"
          >
            <span className="flex items-center gap-1">
              <span>🏠</span>
              <span className="text-white/70">→</span>
              <span className="w-2 h-2 rounded-full bg-white"></span>
            </span>
            <span className="truncate">Directions to Put-in</span>
          </a>
          <a
            href={(() => {
              const origin = plan.putIn.directionsOverride
                ? encodeURIComponent(plan.putIn.directionsOverride)
                : `${plan.putIn.coordinates.lat},${plan.putIn.coordinates.lng}`;
              const dest = plan.takeOut.directionsOverride
                ? encodeURIComponent(plan.takeOut.directionsOverride)
                : `${plan.takeOut.coordinates.lat},${plan.takeOut.coordinates.lng}`;
              return `https://www.google.com/maps/dir/${origin}/${dest}`;
            })()}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 w-full px-3 py-2 rounded-md text-xs font-bold transition-colors border-2 border-neutral-700 bg-primary-600 text-white hover:bg-primary-700"
          >
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-support-400"></span>
              <span className="text-white/70">→</span>
              <span className="w-2 h-2 rounded-full bg-accent-400"></span>
            </span>
            <span className="truncate">Shuttle Route</span>
          </a>
        </div>
      </div>
    </div>
  );
}

export default function FloatPlanCard({
  plan,
  isLoading,
  putInPoint,
  takeOutPoint,
  onClearPutIn,
  onClearTakeOut,
  onShare,
  onDownloadImage,
  riverSlug: _riverSlug,
  vesselTypeId,
}: FloatPlanCardProps) {
  // riverSlug reserved for potential future use
  void _riverSlug;
  const [selectedVesselTypeId, setSelectedVesselTypeId] = useState<string | null>(vesselTypeId);
  const [putInExpanded, setPutInExpanded] = useState(false);
  const [takeOutExpanded, setTakeOutExpanded] = useState(false);
  const [mobileDetailsExpanded, setMobileDetailsExpanded] = useState(false);

  // Sync vessel type from props
  useEffect(() => {
    if (vesselTypeId && vesselTypeId !== selectedVesselTypeId) {
      setSelectedVesselTypeId(vesselTypeId);
    }
  }, [vesselTypeId, selectedVesselTypeId]);

  // Plan params for recalculation when vessel changes
  const planParams = plan
    ? {
        riverId: plan.river.id,
        startId: plan.putIn.id,
        endId: plan.takeOut.id,
        vesselTypeId: selectedVesselTypeId || undefined,
      }
    : null;

  const { data: recalculatedPlan, isLoading: recalculating } = useFloatPlan(planParams);
  const displayPlan = recalculatedPlan ?? plan;

  const handleVesselChange = useCallback((id: string) => {
    setSelectedVesselTypeId(id);
  }, []);

  const hasBothPoints = putInPoint && takeOutPoint;
  const hasSinglePoint = (putInPoint || takeOutPoint) && !hasBothPoints;

  // Single point selected - show card with CTA
  if (hasSinglePoint) {
    const point = putInPoint || takeOutPoint;
    const isPutIn = !!putInPoint;
    const onClear = isPutIn ? onClearPutIn : onClearTakeOut;

    return (
      <div className="bg-white rounded-2xl border-2 border-neutral-200 shadow-lg overflow-hidden">
        <div className="p-4">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr,auto] gap-4">
            {/* Main Point Card */}
            <AccessPointDetailCard
              point={point!}
              isPutIn={isPutIn}
                            onClear={onClear}
              isExpanded={true}
              onToggleExpand={() => {}}
              showExpandToggle={false}
            />

            {/* CTA for other point */}
            <div className="lg:w-48">
              <SelectOtherPointCTA type={isPutIn ? 'take-out' : 'put-in'} />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Both points selected - full journey card
  if (hasBothPoints && displayPlan) {
    return (
      <div className="bg-white rounded-2xl border-2 border-neutral-200 shadow-lg overflow-hidden">
        {/* Desktop Layout */}
        <div className="hidden lg:block p-4">
          <div className="grid grid-cols-[1fr,280px,1fr] gap-4">
            {/* Put-in Card */}
            <AccessPointDetailCard
              point={putInPoint}
              isPutIn={true}
                            onClear={onClearPutIn}
              isExpanded={putInExpanded}
              onToggleExpand={() => setPutInExpanded(!putInExpanded)}
            />

            {/* Journey Center */}
            <JourneyCenter
              plan={displayPlan}
              isLoading={isLoading}
              selectedVesselTypeId={selectedVesselTypeId}
              onVesselChange={handleVesselChange}
              recalculating={recalculating}
            />

            {/* Take-out Card */}
            <AccessPointDetailCard
              point={takeOutPoint}
              isPutIn={false}
                            onClear={onClearTakeOut}
              isExpanded={takeOutExpanded}
              onToggleExpand={() => setTakeOutExpanded(!takeOutExpanded)}
            />
          </div>

          {/* Share Buttons */}
          <div className="flex justify-center gap-3 mt-4 pt-4 border-t border-neutral-100">
            <button
              onClick={onShare}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-neutral-200 text-sm font-medium text-neutral-700 hover:bg-neutral-50 transition-colors"
            >
              <Share2 size={16} />
              Share Link
            </button>
            <button
              onClick={onDownloadImage}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border-2 border-primary-200 bg-primary-50 text-sm font-medium text-primary-700 hover:bg-primary-100 transition-colors"
            >
              <Download size={16} />
              Download Image
            </button>
          </div>
        </div>

        {/* Mobile Layout */}
        <div className="lg:hidden">
          {/* Collapsed Summary */}
          <button
            onClick={() => setMobileDetailsExpanded(!mobileDetailsExpanded)}
            className="w-full p-4 text-left"
          >
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">Float Plan Ready</p>
                <p className="font-bold text-neutral-900 mt-0.5">
                  {putInPoint.name} → {takeOutPoint.name}
                </p>
                <p className="text-sm text-neutral-600">
                  {displayPlan.distance.formatted} • {displayPlan.floatTime?.formatted || '--'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {/* Condition badge */}
                <span className={`px-2 py-1 rounded text-xs font-bold ${CONDITION_CONFIG[displayPlan.condition.code || 'unknown'].bgClass} ${CONDITION_CONFIG[displayPlan.condition.code || 'unknown'].textClass}`}>
                  {CONDITION_CONFIG[displayPlan.condition.code || 'unknown'].label}
                </span>
                {mobileDetailsExpanded ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
              </div>
            </div>
          </button>

          {/* Expanded Details */}
          {mobileDetailsExpanded && (
            <div className="px-4 pb-4 space-y-4 border-t border-neutral-100 pt-4">
              {/* Route Timeline */}
              <div className="bg-neutral-50 rounded-xl p-4">
                <div className="flex items-center gap-3">
                  <div className="flex flex-col items-center">
                    <div className="w-4 h-4 rounded-full bg-support-500"></div>
                    <div className="w-0.5 h-8 bg-gradient-to-b from-support-400 to-accent-400"></div>
                    <div className="w-4 h-4 rounded-full bg-accent-500"></div>
                  </div>
                  <div className="flex-1 space-y-4">
                    <div>
                      <p className="text-xs font-bold text-support-600 uppercase">Put-in</p>
                      <p className="font-bold text-neutral-900">{putInPoint.name}</p>
                      <p className="text-xs text-neutral-500">Mile {putInPoint.riverMile.toFixed(1)}</p>
                    </div>
                    <div>
                      <p className="text-xs font-bold text-accent-600 uppercase">Take-out</p>
                      <p className="font-bold text-neutral-900">{takeOutPoint.name}</p>
                      <p className="text-xs text-neutral-500">Mile {takeOutPoint.riverMile.toFixed(1)}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-neutral-900">{displayPlan.distance.formatted}</p>
                    <p className="text-lg font-semibold text-neutral-600">{displayPlan.floatTime?.formatted || '--'}</p>
                  </div>
                </div>
              </div>

              {/* Vessel Toggle */}
              <JourneyCenter
                plan={displayPlan}
                isLoading={isLoading}
                selectedVesselTypeId={selectedVesselTypeId}
                onVesselChange={handleVesselChange}
                recalculating={recalculating}
              />

              {/* Access Point Details Accordions */}
              <div className="space-y-3">
                <AccessPointDetailCard
                  point={putInPoint}
                  isPutIn={true}
                                    onClear={onClearPutIn}
                  isExpanded={putInExpanded}
                  onToggleExpand={() => setPutInExpanded(!putInExpanded)}
                />
                <AccessPointDetailCard
                  point={takeOutPoint}
                  isPutIn={false}
                                    onClear={onClearTakeOut}
                  isExpanded={takeOutExpanded}
                  onToggleExpand={() => setTakeOutExpanded(!takeOutExpanded)}
                />
              </div>

              {/* Share Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={onShare}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 border-neutral-200 text-sm font-medium text-neutral-700 hover:bg-neutral-50"
                >
                  <Share2 size={16} />
                  Share
                </button>
                <button
                  onClick={onDownloadImage}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border-2 border-primary-200 bg-primary-50 text-sm font-medium text-primary-700 hover:bg-primary-100"
                >
                  <Download size={16} />
                  Image
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // No points selected - return null (parent should handle this state)
  return null;
}
