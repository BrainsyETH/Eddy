'use client';

// src/components/plan/PlanSidebar.tsx
// Left sidebar for the split-panel float planner — contains all plan info in a scrollable column
// Desktop: visible as sidebar. Mobile: content rendered inside bottom sheet.

import React, { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { Share2, Download, Check, ChevronRight, ChevronDown, ChevronUp, Info } from 'lucide-react';
import type { AccessPoint, FloatPlan, ConditionCode } from '@/types/api';
import { getEddyImageForCondition } from '@/constants';
import { useVesselTypes } from '@/hooks/useVesselTypes';
import CompactAccessCard from './CompactAccessCard';
import { AlongYourRoute, type RouteItem } from './FloatPlanCard';

const EddyQuote = dynamic(() => import('@/components/river/EddyQuote'), { ssr: false });

// Condition display config
const CONDITION_CONFIG: Record<ConditionCode, {
  label: string;
  bgClass: string;
  textClass: string;
  cardBg: string;
  cardText: string;
}> = {
  flowing: { label: 'Flowing', bgClass: 'bg-emerald-500', textClass: 'text-white', cardBg: 'bg-gradient-to-r from-emerald-50 to-teal-50 border-emerald-200', cardText: 'text-emerald-900' },
  good: { label: 'Good', bgClass: 'bg-lime-500', textClass: 'text-white', cardBg: 'bg-gradient-to-r from-emerald-50 to-cyan-50 border-emerald-200', cardText: 'text-emerald-900' },
  low: { label: 'Low', bgClass: 'bg-yellow-500', textClass: 'text-neutral-900', cardBg: 'bg-gradient-to-r from-amber-50 to-yellow-50 border-amber-200', cardText: 'text-amber-900' },
  too_low: { label: 'Too Low', bgClass: 'bg-neutral-400', textClass: 'text-white', cardBg: 'bg-gradient-to-r from-orange-50 to-amber-50 border-orange-200', cardText: 'text-orange-900' },
  high: { label: 'High', bgClass: 'bg-orange-500', textClass: 'text-white', cardBg: 'bg-gradient-to-r from-red-50 to-orange-50 border-red-200', cardText: 'text-red-900' },
  dangerous: { label: 'Flood', bgClass: 'bg-red-600', textClass: 'text-white', cardBg: 'bg-gradient-to-r from-red-100 to-red-50 border-red-300', cardText: 'text-red-900' },
  unknown: { label: 'Unknown', bgClass: 'bg-neutral-500', textClass: 'text-white', cardBg: 'bg-gradient-to-r from-neutral-50 to-slate-50 border-neutral-200', cardText: 'text-neutral-700' },
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
  const [showEddySays, setShowEddySays] = useState(false);
  const condConfig = CONDITION_CONFIG[conditionCode] || CONDITION_CONFIG.unknown;
  const hasBothPoints = putInPoint && takeOutPoint;

  return (
    <div className="flex flex-col h-full">
      {/* Sidebar header — river name + condition */}
      <div className="px-4 pt-4 pb-3 border-b border-neutral-100 flex-shrink-0">
        <div className="min-w-0">
          <Link href={`/rivers/${riverSlug}`} className="text-lg font-bold text-neutral-900 truncate block no-underline" style={{ fontFamily: 'var(--font-display)' }}>
            {riverName}
          </Link>
        </div>
        <div className="mt-2 border border-neutral-200 rounded-xl overflow-hidden bg-white">
          <button
            onClick={() => setShowEddySays(!showEddySays)}
            className="w-full flex items-center gap-2 px-3 py-2.5 hover:opacity-90 transition-colors"
          >
            <Image
              src={getEddyImageForCondition(conditionCode)}
              alt="Eddy"
              width={20}
              height={20}
              className="flex-shrink-0"
            />
            <span className="text-xs font-medium text-neutral-700">Eddy Says — River Report</span>
            {showEddySays
              ? <ChevronUp size={14} className="text-neutral-400 ml-auto" />
              : <ChevronDown size={14} className="text-neutral-400 ml-auto" />
            }
          </button>
          {showEddySays && (
            <EddyQuote
              riverSlug={riverSlug}
              conditionCode={conditionCode}
              gaugeHeightFt={plan?.condition?.gaugeHeightFt ?? null}
              embedded
            />
          )}
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
            {/* Distance + Time as clear columns */}
            <div className="grid grid-cols-2 gap-3">
              <div className="text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-0.5">Distance</p>
                <p className="text-xl font-bold text-neutral-900">{plan.distance.formatted}</p>
              </div>
              <div className="text-center">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400 mb-0.5">
                  Float Time
                  <span className="relative group/tip inline-flex ml-1">
                    <Info className="w-3 h-3 text-neutral-400 cursor-help inline" />
                    <span className="absolute top-full right-0 mt-1.5 px-3 py-1.5 text-xs text-white bg-neutral-800 rounded-lg shadow-lg w-48 text-left opacity-0 pointer-events-none group-hover/tip:opacity-100 group-hover/tip:pointer-events-auto transition-opacity z-50 normal-case tracking-normal font-normal">
                      Estimate for continuous paddling — does not include stops, swimming, or slowdowns.
                    </span>
                  </span>
                </p>
                {isLoading ? (
                  <span className="inline-block w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin mt-1"></span>
                ) : (
                  <p className="text-xl font-bold text-neutral-900">{plan.floatTime?.formatted || '--'}</p>
                )}
              </div>
            </div>

            {/* Vessel toggle */}
            {canoeVessel && raftVessel && (
              <div className="flex items-center justify-center mt-2 pt-2 border-t border-neutral-200">
                <div className="inline-flex items-center rounded-md p-0.5 bg-white border border-neutral-200">
                  <button
                    onClick={() => onVesselChange(canoeVessel.id)}
                    className={`px-3 py-1 text-[11px] font-bold rounded transition-all ${
                      vesselTypeId === canoeVessel.id
                        ? 'bg-primary-600 text-white'
                        : 'text-neutral-500 hover:bg-neutral-50'
                    }`}
                  >
                    🛶 Canoe
                  </button>
                  <button
                    onClick={() => onVesselChange(raftVessel.id)}
                    className={`px-3 py-1 text-[11px] font-bold rounded transition-all ${
                      vesselTypeId === raftVessel.id
                        ? 'bg-primary-600 text-white'
                        : 'text-neutral-500 hover:bg-neutral-50'
                    }`}
                  >
                    🚣 Raft
                  </button>
                </div>
              </div>
            )}

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
