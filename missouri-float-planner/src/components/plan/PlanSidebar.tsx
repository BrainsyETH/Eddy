'use client';

// src/components/plan/PlanSidebar.tsx
// Left sidebar for the split-panel float planner — contains all plan info in a scrollable column
// Desktop: visible as sidebar. Mobile: content rendered inside bottom sheet.

import React from 'react';
import Image from 'next/image';
import { Share2, Download, Check, CalendarPlus, Mail } from 'lucide-react';
import ShuttleRoute from './ShuttleRoute';
import ClearRouteButton from './ClearRouteButton';
import type { AccessPoint, FloatPlan, ConditionCode } from '@/types/api';
import { getEddyImageForCondition } from '@/constants';
import OutfittersNearby from '@/components/plan/OutfittersNearby';
import { downloadFloatPlanIcs, buildFloatPlanMailto } from '@/lib/plan-calendar';
import { trackEvent } from '@/lib/analytics';
import type { PointOfInterest } from '@/types/nps';
import ConditionBadge from '@/components/ui/ConditionBadge';
import FloatTimeInfoTip from './FloatTimeInfoTip';
import { EddyIcon } from '@/components/ui/EddyIcon';
import Card from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import { formatFloatTimeRangeCompact } from '@/lib/calculations/floatTime';
import CompactAccessCard from './CompactAccessCard';
import { AlongYourRoute, type RouteItem } from './FloatPlanCard';
import Breadcrumbs from '@/components/ui/Breadcrumbs';
import PlanFreshnessNotice from './PlanFreshnessNotice';
import PlanHazardStatus from './PlanHazardStatus';



interface PlanSidebarProps {
  hideHeader?: boolean;
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
  onClearRoute: () => void;
  onClearPutIn: () => void;
  onClearTakeOut: () => void;
  onShare: () => void;
  onDownloadImage: () => void;
  shareStatus: 'idle' | 'copied' | 'saving';
  onReportIssue?: (point: AccessPoint) => void;
  pointsAlongRoute?: RouteItem[];
  captureRef?: React.RefObject<HTMLDivElement | null>;
  /**
   * Show the river breadcrumb visibly. The desktop search card normally names
   * the river; after "All rivers" it doesn't, but a retained route still
   * needs a label.
   */
  showRiverLabel?: boolean;
  expandedEndpointId: string | null;
  onExpandEndpoint: (id: string | null) => void;
}

export default function PlanSidebar({
  hideHeader = false,
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
  onClearRoute,
  onClearPutIn,
  onClearTakeOut,
  onShare,
  onDownloadImage,
  shareStatus,
  onReportIssue,
  pointsAlongRoute = [],
  showRiverLabel = false,
  expandedEndpointId,
  onExpandEndpoint,
}: PlanSidebarProps) {
  const hasBothPoints = putInPoint && takeOutPoint;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {!hideHeader && <div className="flex shrink-0 items-center justify-between border-b-2 border-primary-700 px-4 py-1.5" data-plan-header>
        <h2 className="text-base font-bold text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>Build a Route</h2>
        {(putInPoint || takeOutPoint) && <ClearRouteButton onClear={onClearRoute} />}
      </div>}
      {/* Usually no visible header: the search card above already names the
          river (and the page h1 carries it for assistive tech). The
          breadcrumbs stay for screen readers and their schema.org markup,
          and appear when their link takes keyboard focus so it is never an
          invisible tab stop — or always, when the search card isn't naming
          the river (after "All rivers"). */}
      <div className={showRiverLabel
        ? 'flex-shrink-0 px-4 pt-3'
        : 'sr-only focus-within:not-sr-only focus-within:flex-shrink-0 focus-within:px-4 focus-within:pt-3'}>
        <Breadcrumbs
          items={[
            { label: 'Rivers', href: '/rivers' },
            { label: riverName },
          ]}
        />
      </div>

      {/* Scrollable content */}
      <div data-plan-scroll className="flex-1 overflow-y-auto px-4 py-3 space-y-3">

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
          <Card variant="panel" className="p-3">
            <div className="grid grid-cols-[1fr_auto_1.7fr_auto_1fr] items-start justify-items-center gap-x-1">
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
                  <p className="text-sm font-bold text-neutral-900 leading-tight tabular-nums whitespace-nowrap" style={{ fontFamily: 'var(--font-display)' }}>
                    {plan.floatTime?.timeRange
                      ? formatFloatTimeRangeCompact(plan.floatTime.timeRange.min, plan.floatTime.timeRange.max)
                      : plan.floatTime?.formatted || '--'}
                  </p>
                )}
                <p className="text-[10px] uppercase tracking-wider text-neutral-500 mt-0.5 inline-flex items-center gap-0.5">
                  Est. Time
                  <FloatTimeInfoTip />
                </p>
              </div>
              <span className="text-neutral-300 text-lg leading-none pt-1">|</span>
              <div className="text-center">
                <ConditionBadge code={conditionCode} size="sm" />
                <p className="text-[10px] uppercase tracking-wider text-neutral-500 mt-1">Condition</p>
              </div>
            </div>

            {/* Plan actions — one row under the answer they act on, instead
                of a two-row footer pinned below the scroll area. */}
            {!isLastValidFallback && (
              <div className="mt-3 grid grid-cols-4 gap-1 border-t border-neutral-200/70 pt-2.5">
                <PlanAction
                  label="Calendar"
                  icon={<CalendarPlus size={15} />}
                  onClick={() => {
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
                />
                <PlanAction
                  label="Email"
                  icon={<Mail size={15} />}
                  href={buildFloatPlanMailto({
                    riverName,
                    putInName: plan.putIn.name,
                    takeOutName: plan.takeOut.name,
                    url: typeof window !== 'undefined' ? window.location.href : '',
                    distanceLabel: plan.distance.formatted,
                  })}
                  onClick={() => trackEvent('plan_shared', { river: riverSlug, method: 'email' })}
                />
                <PlanAction
                  label={shareStatus === 'saving' ? 'Saving…' : shareStatus === 'copied' ? 'Copied!' : 'Share'}
                  icon={shareStatus === 'saving'
                    ? <span className="w-3.5 h-3.5 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
                    : shareStatus === 'copied' ? <Check size={15} /> : <Share2 size={15} />}
                  onClick={onShare}
                  disabled={shareStatus === 'saving'}
                  tone={shareStatus === 'copied' ? 'success' : 'default'}
                />
                <PlanAction label="Image" icon={<Download size={15} />} onClick={onDownloadImage} tone="primary" />
              </div>
            )}
          </Card>
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
          <ShuttleRoute plan={plan} />
        )}

        {/* Put-in card */}
        {putInPoint && (
          <CompactAccessCard
            point={putInPoint}
            riverSlug={riverSlug}
            expanded={expandedEndpointId === putInPoint.id}
            onExpand={() => onExpandEndpoint(expandedEndpointId === putInPoint.id ? null : putInPoint.id)}
            isPutIn={true}
            onClear={onClearPutIn}
            onReportIssue={onReportIssue ? () => onReportIssue(putInPoint) : undefined}

          />
        )}

        {/* Single selection CTA */}
        {putInPoint && !takeOutPoint && (
          <div className="bg-neutral-50 rounded-lg border-2 border-dashed border-neutral-300 p-4 text-center">
            <p className="text-xs font-medium text-neutral-500">Now select a take-out on the map</p>
          </div>
        )}

        {/* Take-out card */}
        {takeOutPoint && (
          <CompactAccessCard
            point={takeOutPoint}
            riverSlug={riverSlug}
            expanded={expandedEndpointId === takeOutPoint.id}
            onExpand={() => onExpandEndpoint(expandedEndpointId === takeOutPoint.id ? null : takeOutPoint.id)}
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
        <PlanHazardStatus unavailable={plan?.hazardsUnavailable} />
        {pointsAlongRoute.length > 0 && (
          <AlongYourRoute items={pointsAlongRoute} />
        )}

        {/* Outfitters near the put-in — the "book it" moment. */}
        <OutfittersNearby pois={pois} putInPoint={putInPoint} riverSlug={riverSlug} />
      </div>

    </div>
  );
}

// Stacked icon + label button for the plan action row. Renders a link when
// given an href (email) so the mailto keeps native link behavior.
function PlanAction({ label, title, icon, onClick, href, disabled = false, tone = 'default' }: {
  label: string;
  title?: string;
  icon: React.ReactNode;
  onClick?: () => void;
  href?: string;
  disabled?: boolean;
  tone?: 'default' | 'primary' | 'success';
}) {
  const className = `flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg !px-1 !py-1.5 !text-[10px] font-semibold transition-colors ${
    tone === 'success' ? 'text-emerald-700 bg-emerald-50'
      : tone === 'primary' ? 'text-primary-700 hover:bg-primary-100'
      : 'text-neutral-600 hover:bg-neutral-100'
  } ${disabled ? 'opacity-70 cursor-wait' : ''}`;
  if (href) {
    return <a href={href} onClick={onClick} title={title ?? label} className={className}>{icon}{label}</a>;
  }
  return (
    <Button variant="ghost" type="button" onClick={onClick} disabled={disabled} title={title ?? label} aria-label={title} className={className}>
      {icon}{label}
    </Button>
  );
}
