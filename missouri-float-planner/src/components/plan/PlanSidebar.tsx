'use client';

// src/components/plan/PlanSidebar.tsx
// Left sidebar for the split-panel float planner — contains all plan info in a scrollable column
// Desktop: visible as sidebar. Mobile: content rendered inside bottom sheet.

import React from 'react';
import Image from 'next/image';
import { Share2, Download, Check, ChevronRight, Info, CalendarPlus, Mail } from 'lucide-react';
import type { AccessPoint, FloatPlan, ConditionCode } from '@/types/api';
import { getEddyImageForCondition } from '@/constants';
import OutfittersNearby from '@/components/plan/OutfittersNearby';
import { downloadFloatPlanIcs, buildFloatPlanMailto } from '@/lib/plan-calendar';
import { trackEvent } from '@/lib/analytics';
import type { PointOfInterest } from '@/types/nps';
import ConditionBadge from '@/components/ui/ConditionBadge';
import { useVesselTypes } from '@/hooks/useVesselTypes';
import { formatFloatTimeRangeCompact } from '@/lib/calculations/floatTime';
import CompactAccessCard from './CompactAccessCard';
import { AlongYourRoute, type RouteItem } from './FloatPlanCard';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import PlanFreshnessNotice from './PlanFreshnessNotice';



interface PlanSidebarProps {
  riverName: string;
  riverSlug: string;
  conditionCode: ConditionCode;
  /** POIs for the river (outfitter entries power the conversion card). */
  pois?: PointOfInterest[];
  plan: FloatPlan | null;
  isLoading: boolean;
  isLastValidFallback?: boolean;
  lastValidAt?: number | null;
  onRetry?: () => void;
  putInPoint: AccessPoint | null;
  takeOutPoint: AccessPoint | null;
  onClearPutIn: () => void;
  onClearTakeOut: () => void;
  onShare: () => void;
  onDownloadImage: () => void;
  shareStatus: 'idle' | 'copied' | 'saving';
  selectedVesselTypeId: string | null;
  onVesselChange: (id: string) => void;
  onReportIssue?: (point: AccessPoint) => void;
  pointsAlongRoute?: RouteItem[];
  captureRef?: React.RefObject<HTMLDivElement | null>;
}

export default function PlanSidebar({
  riverName,
  riverSlug,
  conditionCode,
  pois,
  plan,
  isLoading,
  isLastValidFallback = false,
  lastValidAt = null,
  onRetry,
  putInPoint,
  takeOutPoint,
  onClearPutIn,
  onClearTakeOut,
  onShare,
  onDownloadImage,
  shareStatus,
  selectedVesselTypeId,
  onVesselChange,
  onReportIssue,
  pointsAlongRoute = [],
}: PlanSidebarProps) {
  const hasBothPoints = putInPoint && takeOutPoint;

  // Vessel toggle (canoe vs. raft) — the same control the mobile FloatPlanCard
  // shows. Float time depends on vessel, so desktop users need it too.
  const { data: vesselTypes } = useVesselTypes();
  const canoeVessel = vesselTypes?.find((v) => v.slug === 'canoe');
  const raftVessel = vesselTypes?.find((v) => v.slug === 'raft');

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Sidebar header — breadcrumbs + river name + condition */}
      <div className="px-4 pt-3 pb-3 border-b border-neutral-100 flex-shrink-0">
        <Breadcrumbs
          items={[
            { label: 'Rivers', href: '/rivers' },
            { label: riverName },
          ]}
          className="mb-1.5"
        />
        <div className="min-w-0">
          <h1 className="text-lg font-bold text-neutral-900 truncate" style={{ fontFamily: 'var(--font-display)' }}>
            {riverName}
          </h1>
        </div>
        {/* "Eddy Says — River Report" moved to the map's top-center overlay
            (components/plan/MapEddySays) — see the planner map. */}
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">

        {isLastValidFallback && lastValidAt && (
          <PlanFreshnessNotice savedAt={lastValidAt} isChecking={isLoading} onRetry={onRetry} />
        )}

        {/* Empty state — no selection */}
        {!putInPoint && !takeOutPoint && (
          <div className="text-center py-8">
            <div className="w-14 h-14 mx-auto mb-3 rounded-full bg-neutral-100 flex items-center justify-center">
              <Image
                src={getEddyImageForCondition(conditionCode)}
                alt="Eddy"
                width={32}
                height={32}
                className="object-contain"
              />
            </div>
            <p className="text-sm font-medium text-neutral-600">Select a put-in on the map</p>
            <p className="text-xs text-neutral-400 mt-1">Then pick a take-out to plan your float</p>
          </div>
        )}

        {/* Route stats — distance, estimated float time, and condition. The
            single most important answer ("how long is this float?") lives here
            on desktop, not only in the transient map badge. */}
        {hasBothPoints && plan && (
          <div className="bg-neutral-50 rounded-xl p-3">
            <div className="grid grid-cols-[1fr_auto_1.4fr_auto_1fr] items-start justify-items-center gap-x-2">
              <div className="text-center">
                <p className="text-lg font-bold text-neutral-900 leading-tight" style={{ fontFamily: 'var(--font-display)' }}>{plan.distance.formatted}</p>
                <p className="text-[10px] uppercase tracking-wider text-neutral-500 mt-0.5">Distance</p>
              </div>
              <span className="text-neutral-300 text-lg leading-none pt-1">|</span>
              <div className="text-center min-w-0">
                {isLoading ? (
                  <div className="flex items-center justify-center h-6">
                    <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : (
                  <p className="text-base font-bold text-neutral-900 leading-tight tabular-nums" style={{ fontFamily: 'var(--font-display)' }}>
                    {plan.floatTime?.timeRange
                      ? formatFloatTimeRangeCompact(plan.floatTime.timeRange.min, plan.floatTime.timeRange.max)
                      : plan.floatTime?.formatted || '--'}
                  </p>
                )}
                <p className="text-[10px] uppercase tracking-wider text-neutral-500 mt-0.5 inline-flex items-center gap-0.5">
                  Est. Time
                  <span
                    className="relative group/tip inline-flex rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                    tabIndex={0}
                    role="button"
                    aria-label="Float time estimate reflects continuous paddling and does not account for stops, swimming, or slowdowns."
                  >
                    <Info className="w-3 h-3 text-neutral-400 cursor-help" aria-hidden="true" />
                    <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-1.5 text-xs text-white bg-neutral-800 rounded-lg shadow-lg w-48 text-center opacity-0 pointer-events-none group-hover/tip:opacity-100 group-focus-within/tip:opacity-100 transition-opacity z-50 normal-case tracking-normal">
                      Estimate reflects continuous paddling and does not account for stops, swimming, or slowdowns.
                    </span>
                  </span>
                </p>
              </div>
              <span className="text-neutral-300 text-lg leading-none pt-1">|</span>
              <div className="text-center">
                <ConditionBadge code={conditionCode} size="sm" />
                <p className="text-[10px] uppercase tracking-wider text-neutral-500 mt-1">Condition</p>
              </div>
            </div>

            {/* Vessel toggle */}
            {canoeVessel && raftVessel && (
              <div className="flex justify-center mt-3">
                <div className="inline-flex items-center rounded-lg p-0.5 border border-neutral-200 bg-white">
                  <button
                    onClick={() => onVesselChange(canoeVessel.id)}
                    disabled={isLoading}
                    aria-pressed={selectedVesselTypeId === canoeVessel.id}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${isLoading ? 'opacity-50 cursor-not-allowed' : ''} ${
                      selectedVesselTypeId === canoeVessel.id ? 'bg-primary-600 text-white shadow-sm' : 'text-neutral-600 hover:bg-neutral-100'
                    }`}
                  >
                    🛶 Canoe
                  </button>
                  <button
                    onClick={() => onVesselChange(raftVessel.id)}
                    disabled={isLoading}
                    aria-pressed={selectedVesselTypeId === raftVessel.id}
                    className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${isLoading ? 'opacity-50 cursor-not-allowed' : ''} ${
                      selectedVesselTypeId === raftVessel.id ? 'bg-primary-600 text-white shadow-sm' : 'text-neutral-600 hover:bg-neutral-100'
                    }`}
                  >
                    🚣 Raft
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Upstream warning */}
        {hasBothPoints && plan && plan.putIn.riverMile > plan.takeOut.riverMile && (
          <div className="flex items-center gap-1.5 px-2.5 py-2 bg-red-50 border border-red-200 rounded-md text-[11px] text-red-700 font-medium">
            <span>⚠</span> Upstream — paddling against current
          </div>
        )}

        {/* Loading state for plan */}
        {hasBothPoints && !plan && isLoading && (
          <div className="bg-neutral-50 rounded-xl p-6 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
        )}

        {/* Shuttle route — above put-in/take-out cards */}
        {hasBothPoints && plan && (
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
            className="flex items-center justify-between w-full px-3 py-2 rounded-lg bg-primary-50 hover:bg-primary-100 transition-colors"
          >
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded-full bg-primary-600 flex items-center justify-center">
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M7 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0"/>
                  <path d="M17 17m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0"/>
                  <path d="M5 17H3v-6l2-5h9l4 5h1a2 2 0 0 1 2 2v4h-2m-4 0H9"/>
                  <path d="M14 6l-4 5h9"/>
                </svg>
              </div>
              <span className="text-xs font-medium text-neutral-700">Drive Route</span>
            </div>
            <ChevronRight size={14} className="text-primary-400" />
          </a>
        )}

        {/* Put-in card */}
        {putInPoint && (
          <CompactAccessCard
            point={putInPoint}
            isPutIn={true}
            onClear={onClearPutIn}
            onReportIssue={onReportIssue ? () => onReportIssue(putInPoint) : undefined}

          />
        )}

        {/* Single selection CTA */}
        {putInPoint && !takeOutPoint && (
          <div className="bg-neutral-50 rounded-xl border border-dashed border-neutral-300 p-4 text-center">
            <p className="text-xs font-medium text-neutral-500">Now select a take-out on the map</p>
          </div>
        )}

        {/* Take-out card */}
        {takeOutPoint && (
          <CompactAccessCard
            point={takeOutPoint}
            isPutIn={false}
            onClear={onClearTakeOut}
            onReportIssue={onReportIssue ? () => onReportIssue(takeOutPoint) : undefined}

          />
        )}

        {/* Road access warnings */}
        {plan && plan.warnings.length > 0 && (
          <div className="space-y-1">
            {plan.warnings.map((warning, idx) => (
              <p key={idx} className="text-[11px] text-red-600 flex items-center gap-1">
                <span>⚠</span> {warning}
              </p>
            ))}
          </div>
        )}

        {/* Along your route */}
        {pointsAlongRoute.length > 0 && (
          <AlongYourRoute items={pointsAlongRoute} />
        )}

        {/* Outfitters near the put-in — the "book it" moment. */}
        <OutfittersNearby pois={pois} putInPoint={putInPoint} riverSlug={riverSlug} />
      </div>

      {/* Footer — share buttons (sticky at bottom) */}
      {hasBothPoints && plan && !isLastValidFallback && (
        <div className="flex-shrink-0 px-4 py-3 border-t border-neutral-100 bg-white">
          <div className="flex justify-end mb-2">
            <button
              onClick={() => {
                onClearPutIn();
                onClearTakeOut();
              }}
              className="text-xs text-neutral-400 hover:text-neutral-600 underline underline-offset-2 transition-colors"
            >
              Clear route &amp; start over
            </button>
          </div>
          <div className="flex gap-2 mb-2">
            <button
              onClick={() => {
                if (!plan) return;
                downloadFloatPlanIcs({
                  riverName,
                  putInName: plan.putIn.name,
                  takeOutName: plan.takeOut.name,
                  url: window.location.href,
                  minutes: plan.floatTime?.timeRange?.max ?? plan.floatTime?.minutes ?? null,
                  distanceLabel: plan.distance.formatted,
                });
                trackEvent('plan_shared', { river: riverSlug, method: 'calendar' });
              }}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-neutral-50 border border-neutral-200 text-xs font-medium text-neutral-600 hover:bg-neutral-100 transition-colors"
            >
              <CalendarPlus size={13} />
              Calendar
            </button>
            <a
              href={plan ? buildFloatPlanMailto({
                riverName,
                putInName: plan.putIn.name,
                takeOutName: plan.takeOut.name,
                url: typeof window !== 'undefined' ? window.location.href : '',
                distanceLabel: plan.distance.formatted,
              }) : '#'}
              onClick={() => trackEvent('plan_shared', { river: riverSlug, method: 'email' })}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-neutral-50 border border-neutral-200 text-xs font-medium text-neutral-600 hover:bg-neutral-100 transition-colors"
            >
              <Mail size={13} />
              Email
            </a>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onShare}
              disabled={shareStatus === 'saving'}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                shareStatus === 'copied'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                  : 'bg-neutral-50 border border-neutral-200 text-neutral-600 hover:bg-neutral-100'
              } ${shareStatus === 'saving' ? 'opacity-70 cursor-wait' : ''}`}
            >
              {shareStatus === 'saving'
                ? <span className="w-3 h-3 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
                : shareStatus === 'copied' ? <Check size={13} /> : <Share2 size={13} />}
              {shareStatus === 'saving' ? 'Saving…' : shareStatus === 'copied' ? 'Copied!' : 'Share'}
            </button>
            <button
              onClick={onDownloadImage}
              className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-primary-50 border border-primary-200 text-xs font-medium text-primary-700 hover:bg-primary-100 transition-colors"
            >
              <Download size={13} />
              Image
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
