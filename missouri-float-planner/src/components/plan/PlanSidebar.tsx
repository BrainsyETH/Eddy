'use client';

// src/components/plan/PlanSidebar.tsx
// Left sidebar for the split-panel float planner — contains all plan info in a scrollable column
// Desktop: visible as sidebar. Mobile: content rendered inside bottom sheet.

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { Share2, Download, Check, ChevronRight } from 'lucide-react';
import type { AccessPoint, FloatPlan, ConditionCode } from '@/types/api';
import { getEddyImageForCondition } from '@/constants';
import { useVesselTypes } from '@/hooks/useVesselTypes';
import CompactAccessCard from './CompactAccessCard';
import { AlongYourRoute, type RouteItem } from './FloatPlanCard';

// Condition display config
const CONDITION_CONFIG: Record<ConditionCode, {
  label: string;
  bgClass: string;
  textClass: string;
}> = {
  flowing: { label: 'Flowing', bgClass: 'bg-emerald-500', textClass: 'text-white' },
  good: { label: 'Good', bgClass: 'bg-lime-500', textClass: 'text-white' },
  low: { label: 'Low', bgClass: 'bg-yellow-500', textClass: 'text-neutral-900' },
  too_low: { label: 'Too Low', bgClass: 'bg-neutral-400', textClass: 'text-white' },
  high: { label: 'High', bgClass: 'bg-orange-500', textClass: 'text-white' },
  dangerous: { label: 'Flood', bgClass: 'bg-red-600', textClass: 'text-white' },
  unknown: { label: 'Unknown', bgClass: 'bg-neutral-500', textClass: 'text-white' },
};

interface PlanSidebarProps {
  riverName: string;
  riverSlug: string;
  conditionCode: ConditionCode;
  plan: FloatPlan | null;
  isLoading: boolean;
  putInPoint: AccessPoint | null;
  takeOutPoint: AccessPoint | null;
  onClearPutIn: () => void;
  onClearTakeOut: () => void;
  vesselTypeId: string | null;
  onVesselChange: (id: string) => void;
  onShare: () => void;
  onDownloadImage: () => void;
  shareStatus: 'idle' | 'copied';
  onReportIssue?: (point: AccessPoint) => void;
  pointsAlongRoute?: RouteItem[];
  captureRef?: React.RefObject<HTMLDivElement | null>;
}

export default function PlanSidebar({
  riverName,
  riverSlug,
  conditionCode,
  plan,
  isLoading,
  putInPoint,
  takeOutPoint,
  onClearPutIn,
  onClearTakeOut,
  vesselTypeId,
  onVesselChange,
  onShare,
  onDownloadImage,
  shareStatus,
  onReportIssue,
  pointsAlongRoute = [],
}: PlanSidebarProps) {
  const { data: vesselTypes } = useVesselTypes();
  const canoeVessel = vesselTypes?.find(v => v.slug === 'canoe');
  const raftVessel = vesselTypes?.find(v => v.slug === 'raft');
  const condConfig = CONDITION_CONFIG[conditionCode] || CONDITION_CONFIG.unknown;
  const hasBothPoints = putInPoint && takeOutPoint;

  return (
    <div className="flex flex-col h-full">
      {/* Sidebar header — river name + condition */}
      <div className="px-4 pt-4 pb-3 border-b border-neutral-100 flex-shrink-0">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <Link href={`/rivers/${riverSlug}`} className="text-lg font-bold text-neutral-900 truncate block no-underline" style={{ fontFamily: 'var(--font-display)' }}>
              {riverName}
            </Link>
          </div>
          <span className={`px-2 py-1 rounded-md text-[11px] font-bold ${condConfig.bgClass} ${condConfig.textClass} flex-shrink-0`}>
            {condConfig.label}
          </span>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">

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

        {/* Route summary — only when both points selected and plan loaded */}
        {hasBothPoints && plan && (
          <div className="bg-neutral-50 rounded-xl p-3">
            {/* Distance + Time */}
            <div className="flex items-center gap-3 mb-2">
              <div className="flex items-center gap-2 flex-1">
                <div className="w-2.5 h-2.5 rounded-full bg-support-500"></div>
                <div className="flex-1 h-0.5 bg-gradient-to-r from-support-300 to-accent-300 rounded-full"></div>
                <div className="w-2.5 h-2.5 rounded-full bg-accent-500"></div>
              </div>
            </div>
            <div className="flex items-baseline justify-between">
              <div>
                <span className="text-xl font-bold text-neutral-900">{plan.distance.formatted}</span>
                <span className="text-neutral-400 mx-1.5">·</span>
                {isLoading ? (
                  <span className="inline-block w-3 h-3 border-2 border-primary-500 border-t-transparent rounded-full animate-spin align-middle"></span>
                ) : (
                  <span className="text-lg font-bold text-neutral-700">{plan.floatTime?.formatted || '--'}</span>
                )}
              </div>
              {/* Vessel toggle */}
              {canoeVessel && raftVessel && (
                <div className="inline-flex items-center rounded-md p-0.5 bg-white border border-neutral-200">
                  <button
                    onClick={() => onVesselChange(canoeVessel.id)}
                    className={`px-2 py-1 text-[11px] font-bold rounded transition-all ${
                      vesselTypeId === canoeVessel.id
                        ? 'bg-primary-600 text-white'
                        : 'text-neutral-500 hover:bg-neutral-50'
                    }`}
                  >
                    🛶
                  </button>
                  <button
                    onClick={() => onVesselChange(raftVessel.id)}
                    className={`px-2 py-1 text-[11px] font-bold rounded transition-all ${
                      vesselTypeId === raftVessel.id
                        ? 'bg-primary-600 text-white'
                        : 'text-neutral-500 hover:bg-neutral-50'
                    }`}
                  >
                    🚣
                  </button>
                </div>
              )}
            </div>

            {/* Gauge reading */}
            <div className="flex items-center gap-3 mt-2 pt-2 border-t border-neutral-200">
              <Image
                src={getEddyImageForCondition(conditionCode)}
                alt={condConfig.label}
                width={24}
                height={24}
                className="flex-shrink-0"
              />
              <div className="flex items-center gap-2 text-xs text-neutral-600">
                <span className="font-semibold">{plan.condition.gaugeHeightFt?.toFixed(1) ?? '—'} ft</span>
                <span className="text-neutral-300">|</span>
                <span className="font-semibold">{plan.condition.dischargeCfs?.toLocaleString() ?? '—'} cfs</span>
                {plan.condition.gaugeName && (
                  <>
                    <span className="text-neutral-300">|</span>
                    <span className="text-neutral-400 truncate">{plan.condition.gaugeName}</span>
                  </>
                )}
              </div>
            </div>

            {/* Upstream warning */}
            {plan.putIn.riverMile > plan.takeOut.riverMile && (
              <div className="flex items-center gap-1.5 mt-2 px-2 py-1.5 bg-red-50 border border-red-200 rounded-md text-[11px] text-red-700 font-medium">
                <span>⚠</span> Upstream — paddling against current
              </div>
            )}
          </div>
        )}

        {/* Loading state for plan */}
        {hasBothPoints && !plan && isLoading && (
          <div className="bg-neutral-50 rounded-xl p-6 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
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

        {/* Shuttle route */}
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
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="5" cy="18" r="3"/><circle cx="19" cy="6" r="3"/>
                  <path d="M5 15V9a6 6 0 0 1 6-6h0"/><path d="M19 9v6a6 6 0 0 1-6 6h0"/>
                </svg>
              </div>
              <span className="text-xs font-medium text-neutral-700">Shuttle Route</span>
            </div>
            <ChevronRight size={14} className="text-primary-400" />
          </a>
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
      </div>

      {/* Footer — share buttons (sticky at bottom) */}
      {hasBothPoints && plan && (
        <div className="flex-shrink-0 px-4 py-3 border-t border-neutral-100 bg-white">
          <div className="flex gap-2">
            <button
              onClick={onShare}
              className={`flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                shareStatus === 'copied'
                  ? 'bg-emerald-50 border border-emerald-200 text-emerald-700'
                  : 'bg-neutral-50 border border-neutral-200 text-neutral-600 hover:bg-neutral-100'
              }`}
            >
              {shareStatus === 'copied' ? <Check size={13} /> : <Share2 size={13} />}
              {shareStatus === 'copied' ? 'Copied!' : 'Share'}
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
