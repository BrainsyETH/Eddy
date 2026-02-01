'use client';

// src/components/plan/FloatPlanCard.tsx
// Merged journey card showing put-in and take-out side by side with float details

import { useState, useRef, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, MapPin, Share2, Download, X, GripHorizontal } from 'lucide-react';
import type { AccessPoint, FloatPlan, ConditionCode } from '@/types/api';
import { useVesselTypes } from '@/hooks/useVesselTypes';

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
  onVesselChange: (id: string) => void;
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

      {/* Expandable Toggle */}
      {showExpandToggle && (
        <button
          onClick={onToggleExpand}
          className="w-full px-3 py-1.5 flex items-center justify-between text-xs hover:bg-neutral-50 border-t border-neutral-100"
        >
          <span className="text-neutral-500">{isExpanded ? 'Hide details' : 'View details'}</span>
          {isExpanded ? <ChevronUp size={14} className="text-neutral-400" /> : <ChevronDown size={14} className="text-neutral-400" />}
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

      {/* Conditions - Clean card design */}
      <div className="rounded-xl bg-white border border-neutral-200 shadow-sm overflow-hidden mb-3">
        <div className={`${conditionConfig.bgClass} px-4 py-3`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xl">{conditionConfig.emoji}</span>
              <span className={`text-lg font-bold ${conditionConfig.textClass}`}>{conditionConfig.label}</span>
            </div>
            {plan.condition.usgsUrl && (
              <a
                href={plan.condition.usgsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`text-xs ${conditionConfig.textClass} opacity-80 hover:opacity-100 underline`}
              >
                USGS →
              </a>
            )}
          </div>
        </div>
        <div className="px-4 py-3 flex items-center justify-between bg-neutral-50/50">
          <div className="flex items-center gap-4">
            <div className="text-center">
              <p className="text-lg font-bold text-neutral-800">{plan.condition.gaugeHeightFt?.toFixed(1) ?? '—'}</p>
              <p className="text-[10px] uppercase tracking-wide text-neutral-500">ft</p>
            </div>
            <div className="w-px h-8 bg-neutral-200"></div>
            <div className="text-center">
              <p className="text-lg font-bold text-neutral-800">{plan.condition.dischargeCfs?.toLocaleString() ?? '—'}</p>
              <p className="text-[10px] uppercase tracking-wide text-neutral-500">cfs</p>
            </div>
          </div>
          {plan.condition.gaugeName && (
            <p className="text-xs text-neutral-400 max-w-[120px] text-right truncate">{plan.condition.gaugeName}</p>
          )}
        </div>
      </div>

      {/* Shuttle - Minimal button design */}
      <div className="space-y-2">
        <a
          href={plan.putIn.directionsOverride
            ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(plan.putIn.directionsOverride)}`
            : `https://www.google.com/maps/dir/?api=1&destination=${plan.putIn.coordinates.lat},${plan.putIn.coordinates.lng}`
          }
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-between w-full px-4 py-2.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-support-500 flex items-center justify-center">
              <MapPin size={14} className="text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-neutral-800">Directions to Put-in</p>
              <p className="text-xs text-neutral-500">Opens in Google Maps</p>
            </div>
          </div>
          <ChevronRight size={18} className="text-neutral-400 group-hover:text-neutral-600 transition-colors" />
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
          className="flex items-center justify-between w-full px-4 py-2.5 rounded-lg bg-primary-50 hover:bg-primary-100 transition-colors group"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-primary-600 flex items-center justify-center">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="5" cy="18" r="3"/>
                <circle cx="19" cy="6" r="3"/>
                <path d="M5 15V9a6 6 0 0 1 6-6h0"/>
                <path d="M19 9v6a6 6 0 0 1-6 6h0"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-neutral-800">Shuttle Route</p>
              <p className="text-xs text-neutral-500">View in Google Maps</p>
            </div>
          </div>
          <ChevronRight size={18} className="text-primary-400 group-hover:text-primary-600 transition-colors" />
        </a>
      </div>
    </div>
  );
}

// Mobile Bottom Sheet Component
function MobileBottomSheet({
  plan,
  putInPoint,
  takeOutPoint,
  onClearPutIn,
  onClearTakeOut,
  isLoading,
  vesselTypeId,
  onVesselChange,
  onShare,
  onDownloadImage,
}: {
  plan: FloatPlan;
  putInPoint: AccessPoint;
  takeOutPoint: AccessPoint;
  onClearPutIn: () => void;
  onClearTakeOut: () => void;
  isLoading: boolean;
  vesselTypeId: string | null;
  onVesselChange: (id: string) => void;
  onShare: () => void;
  onDownloadImage: () => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [putInExpanded, setPutInExpanded] = useState(false);
  const [takeOutExpanded, setTakeOutExpanded] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const [sheetHeight, setSheetHeight] = useState<number | null>(null);

  const { data: vesselTypes } = useVesselTypes();
  const canoeVessel = vesselTypes?.find(v => v.slug === 'canoe');
  const raftVessel = vesselTypes?.find(v => v.slug === 'raft');

  // Heights for the sheet states
  const COLLAPSED_HEIGHT = 120;
  const EXPANDED_HEIGHT = typeof window !== 'undefined' ? window.innerHeight * 0.85 : 600;

  // Reset height when expanded state changes
  useEffect(() => {
    setSheetHeight(isExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT);
  }, [isExpanded, EXPANDED_HEIGHT]);

  // Handle touch start for drag
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    dragRef.current = {
      startY: touch.clientY,
      startHeight: sheetHeight || (isExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT),
    };
  }, [sheetHeight, isExpanded, EXPANDED_HEIGHT]);

  // Handle touch move for drag
  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!dragRef.current) return;
    const touch = e.touches[0];
    const deltaY = dragRef.current.startY - touch.clientY;
    const newHeight = Math.max(
      COLLAPSED_HEIGHT,
      Math.min(EXPANDED_HEIGHT, dragRef.current.startHeight + deltaY)
    );
    setSheetHeight(newHeight);
  }, [EXPANDED_HEIGHT]);

  // Handle touch end - snap to collapsed or expanded
  const handleTouchEnd = useCallback(() => {
    if (!dragRef.current || sheetHeight === null) return;
    const threshold = (COLLAPSED_HEIGHT + EXPANDED_HEIGHT) / 2;
    if (sheetHeight > threshold) {
      setIsExpanded(true);
      setSheetHeight(EXPANDED_HEIGHT);
    } else {
      setIsExpanded(false);
      setSheetHeight(COLLAPSED_HEIGHT);
    }
    dragRef.current = null;
  }, [sheetHeight, EXPANDED_HEIGHT]);

  const conditionCode: ConditionCode = plan.condition.code || 'unknown';
  const conditionConfig = CONDITION_CONFIG[conditionCode] || CONDITION_CONFIG.unknown;
  const isUpstream = plan.putIn.riverMile > plan.takeOut.riverMile;

  return (
    <div
      ref={sheetRef}
      className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl shadow-2xl border-t border-neutral-200 transition-[height] duration-300 ease-out overflow-hidden lg:hidden"
      style={{ height: sheetHeight || COLLAPSED_HEIGHT }}
    >
      {/* Drag Handle */}
      <div
        className="flex justify-center py-3 cursor-grab active:cursor-grabbing touch-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <GripHorizontal size={24} className="text-neutral-300" />
      </div>

      {/* Summary Header - always visible */}
      <div className="px-4 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-xs font-bold uppercase tracking-wider text-neutral-500">Float Plan</p>
            <p className="font-bold text-neutral-900 truncate">
              {putInPoint.name} → {takeOutPoint.name}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0 ml-3">
            <span className="text-lg font-bold text-neutral-900">{plan.distance.formatted}</span>
            <span className={`px-2 py-1 rounded text-xs font-bold ${conditionConfig.bgClass} ${conditionConfig.textClass}`}>
              {conditionConfig.label}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExpanded(!isExpanded);
              }}
              className="p-1"
            >
              {isExpanded ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
            </button>
          </div>
        </div>
      </div>

      {/* Expanded Content */}
      <div className="overflow-y-auto px-4 pb-safe" style={{ height: `calc(100% - 90px)` }}>
        {/* Route Summary with Vessel Toggle */}
        <div className="bg-neutral-50 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex flex-col items-center">
              <div className="w-3 h-3 rounded-full bg-support-500"></div>
              <div className="w-0.5 h-6 bg-gradient-to-b from-support-400 to-accent-400"></div>
              <div className="w-3 h-3 rounded-full bg-accent-500"></div>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-neutral-700">{putInPoint.name}</p>
              <p className="text-sm font-medium text-neutral-700 mt-1">{takeOutPoint.name}</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-neutral-900">{plan.distance.formatted}</p>
              <p className="text-sm text-neutral-600">{plan.floatTime?.formatted || '--'}</p>
            </div>
          </div>

          {/* Vessel Toggle */}
          {canoeVessel && raftVessel && (
            <div className="flex justify-center pt-2 border-t border-neutral-200">
              <div className="inline-flex items-center rounded-lg p-1 bg-white border border-neutral-200">
                <button
                  onClick={() => onVesselChange(canoeVessel.id)}
                  disabled={isLoading}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                    isLoading ? 'opacity-50' : ''
                  } ${
                    vesselTypeId === canoeVessel.id
                      ? 'bg-primary-600 text-white'
                      : 'text-neutral-600'
                  }`}
                >
                  🛶 Canoe
                </button>
                <button
                  onClick={() => onVesselChange(raftVessel.id)}
                  disabled={isLoading}
                  className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${
                    isLoading ? 'opacity-50' : ''
                  } ${
                    vesselTypeId === raftVessel.id
                      ? 'bg-primary-600 text-white'
                      : 'text-neutral-600'
                  }`}
                >
                  🚣 Raft
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Upstream Warning */}
        {isUpstream && (
          <div className="flex items-center gap-2 px-3 py-2 bg-red-50 border border-red-200 rounded-lg mb-4 text-xs">
            <span className="text-red-500">⚠</span>
            <span className="text-red-700 font-medium">Upstream route - paddling against current</span>
          </div>
        )}

        {/* 1. Access Point Cards */}
        <div className="space-y-3 mb-4">
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

        {/* 2. Directions */}
        <div className="space-y-2 mb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">Directions</p>
          <a
            href={plan.putIn.directionsOverride
              ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(plan.putIn.directionsOverride)}`
              : `https://www.google.com/maps/dir/?api=1&destination=${plan.putIn.coordinates.lat},${plan.putIn.coordinates.lng}`
            }
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg bg-neutral-100 hover:bg-neutral-200 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-support-500 flex items-center justify-center">
                <MapPin size={12} className="text-white" />
              </div>
              <span className="text-sm font-medium text-neutral-800">Directions to Put-in</span>
            </div>
            <ChevronRight size={16} className="text-neutral-400" />
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
            className="flex items-center justify-between w-full px-3 py-2.5 rounded-lg bg-primary-50 hover:bg-primary-100 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div className="w-7 h-7 rounded-full bg-primary-600 flex items-center justify-center">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="5" cy="18" r="3"/>
                  <circle cx="19" cy="6" r="3"/>
                  <path d="M5 15V9a6 6 0 0 1 6-6h0"/>
                  <path d="M19 9v6a6 6 0 0 1-6 6h0"/>
                </svg>
              </div>
              <span className="text-sm font-medium text-neutral-800">Shuttle Route</span>
            </div>
            <ChevronRight size={16} className="text-primary-400" />
          </a>
        </div>

        {/* 3. River Conditions - Revamped Card */}
        <div className="mb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-2">River Conditions</p>
          <div className={`rounded-2xl overflow-hidden ${conditionConfig.bgClass}`}>
            {/* Main Status */}
            <div className="px-4 py-4 text-center">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-white/20 mb-2">
                <span className="text-2xl">{conditionConfig.emoji}</span>
              </div>
              <p className={`text-xl font-bold ${conditionConfig.textClass}`}>{conditionConfig.label}</p>
              {plan.condition.gaugeName && (
                <p className={`text-xs ${conditionConfig.textClass} opacity-75 mt-1`}>
                  {plan.condition.gaugeName}
                </p>
              )}
            </div>

            {/* Stats Row */}
            <div className="bg-white/95 backdrop-blur px-4 py-3">
              <div className="flex items-center justify-around">
                <div className="text-center">
                  <p className="text-2xl font-bold text-neutral-800">
                    {plan.condition.gaugeHeightFt?.toFixed(1) ?? '—'}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">Feet</p>
                </div>
                <div className="w-px h-10 bg-neutral-200"></div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-neutral-800">
                    {plan.condition.dischargeCfs?.toLocaleString() ?? '—'}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-medium">CFS</p>
                </div>
                {plan.condition.usgsUrl && (
                  <>
                    <div className="w-px h-10 bg-neutral-200"></div>
                    <a
                      href={plan.condition.usgsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex flex-col items-center text-primary-600 hover:text-primary-700"
                    >
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                        <polyline points="15 3 21 3 21 9"/>
                        <line x1="10" y1="14" x2="21" y2="3"/>
                      </svg>
                      <p className="text-[10px] uppercase tracking-wider font-medium mt-1">USGS</p>
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Share Buttons */}
        <div className="flex gap-3 pb-4">
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
  onVesselChange,
}: FloatPlanCardProps) {
  // riverSlug reserved for potential future use
  void _riverSlug;
  // Details expanded by default on desktop
  const [putInExpanded, setPutInExpanded] = useState(true);
  const [takeOutExpanded, setTakeOutExpanded] = useState(true);

  // Use parent's plan directly - vessel changes handled by parent
  const displayPlan = plan;

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

  // Both points selected but still loading - show skeleton
  if (hasBothPoints && !displayPlan && isLoading) {
    return (
      <div className="bg-white rounded-2xl border-2 border-neutral-200 shadow-lg overflow-hidden">
        <div className="p-4">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr,280px,1fr] gap-4">
            {/* Put-in Card Skeleton */}
            <div className="animate-pulse">
              <div className="h-6 bg-neutral-200 rounded w-20 mb-2"></div>
              <div className="h-8 bg-neutral-200 rounded w-3/4 mb-2"></div>
              <div className="h-40 bg-neutral-100 rounded mb-2"></div>
              <div className="h-4 bg-neutral-200 rounded w-1/2"></div>
            </div>

            {/* Journey Center Skeleton */}
            <div className="animate-pulse flex flex-col items-center justify-center">
              <div className="h-4 bg-neutral-200 rounded w-20 mb-2"></div>
              <div className="h-8 bg-neutral-200 rounded w-32 mb-3"></div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-3 h-3 rounded-full bg-support-200"></div>
                <div className="w-16 h-1 bg-neutral-200 rounded"></div>
                <div className="w-3 h-3 rounded-full bg-accent-200"></div>
              </div>
              <div className="h-10 bg-neutral-200 rounded w-full mb-3"></div>
              <div className="h-24 bg-neutral-100 rounded w-full mb-3"></div>
              <div className="h-12 bg-neutral-100 rounded w-full mb-2"></div>
              <div className="h-12 bg-neutral-100 rounded w-full"></div>
            </div>

            {/* Take-out Card Skeleton */}
            <div className="animate-pulse">
              <div className="h-6 bg-neutral-200 rounded w-20 mb-2"></div>
              <div className="h-8 bg-neutral-200 rounded w-3/4 mb-2"></div>
              <div className="h-40 bg-neutral-100 rounded mb-2"></div>
              <div className="h-4 bg-neutral-200 rounded w-1/2"></div>
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
              selectedVesselTypeId={vesselTypeId}
              onVesselChange={onVesselChange}
              recalculating={isLoading}
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

          {/* Actions Row */}
          <div className="flex justify-end items-center mt-4 pt-4 border-t border-neutral-100">
            {/* Share Buttons */}
            <div className="flex gap-3">
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
        </div>

        {/* Mobile Bottom Sheet */}
        <MobileBottomSheet
          plan={displayPlan}
          putInPoint={putInPoint}
          takeOutPoint={takeOutPoint}
          onClearPutIn={onClearPutIn}
          onClearTakeOut={onClearTakeOut}
          isLoading={isLoading}
          vesselTypeId={vesselTypeId}
          onVesselChange={onVesselChange}
          onShare={onShare}
          onDownloadImage={onDownloadImage}
        />
      </div>
    );
  }

  // No points selected - return null (parent should handle this state)
  return null;
}
