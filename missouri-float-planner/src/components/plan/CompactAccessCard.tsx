'use client';

import { useEffect, useRef } from 'react';
import { X, ChevronDown, ChevronUp, Flag } from 'lucide-react';
import type { AccessPoint } from '@/types/api';
import AccessPointPhoto from '@/components/access-point/AccessPointPhoto';
import { EddyIcon } from '@/components/ui/EddyIcon';
import { plannerPlaceSymbol } from '@/lib/planner-place';
import PlannerAccessDetails from './PlannerAccessDetails';

export default function CompactAccessCard({ point, riverSlug, isPutIn, expanded, onExpand, onClear, onReportIssue }: {
  point: AccessPoint;
  riverSlug: string;
  isPutIn: boolean;
  expanded: boolean;
  onExpand: () => void;
  onClear: () => void;
  onReportIssue?: () => void;
}) {
  const card = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!expanded) return;
    // Scroll only the Plan panel, never the page or the map underneath it.
    const scroller = card.current?.closest('[data-plan-scroll]');
    if (scroller && card.current) {
      const delta = card.current.getBoundingClientRect().top - scroller.getBoundingClientRect().top;
      if (delta < 0 || delta > scroller.clientHeight / 2) scroller.scrollTop += delta - 12;
    }
  }, [expanded]);
  const role = isPutIn ? 'Put-in' : 'Take-out';
  const photo = point.imageUrls[0] ?? point.npsCampground?.images[0]?.url;
  return <div ref={card} data-endpoint-card={point.id} className={`overflow-hidden rounded-lg border-2 bg-white shadow-sm ${isPutIn ? 'border-primary-700' : 'border-accent-500'}`}>
    <div className="flex items-start gap-1 p-2">
      <button type="button" onClick={onExpand} aria-expanded={expanded} aria-controls={`endpoint-details-${point.id}`} className="flex min-w-0 flex-1 items-center gap-2 rounded-lg p-1 text-left focus-visible:ring-2 focus-visible:ring-primary-500">
        <span className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-neutral-50">
          {photo ? <AccessPointPhoto src={photo} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <EddyIcon name={plannerPlaceSymbol(point)} size={32} />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="mb-1 flex items-center gap-2"><span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${isPutIn ? 'bg-primary-700 text-white' : 'bg-accent-100 text-neutral-900 border border-accent-500'}`}>{role}</span><span className="text-[11px] text-neutral-500">Mile {point.riverMile.toFixed(1)}</span></span>
          <span className="block text-sm font-bold text-neutral-900">{point.name}</span>
        </span>
        {expanded ? <ChevronUp size={16} className="shrink-0 text-neutral-500" /> : <ChevronDown size={16} className="shrink-0 text-neutral-500" />}
      </button>
      <button type="button" onClick={onClear} aria-label={`Remove ${role.toLowerCase()}`} className="min-h-11 min-w-11 rounded-lg p-2 text-neutral-500 hover:bg-neutral-100"><X size={16} /></button>
    </div>
    {expanded && <div id={`endpoint-details-${point.id}`} className="space-y-3 border-t-2 border-neutral-200 p-3">
      <PlannerAccessDetails key={point.id} point={point} riverSlug={riverSlug} />
      {onReportIssue && <button type="button" onClick={onReportIssue} className="flex items-center gap-1 text-xs text-neutral-500 hover:text-primary-700"><Flag size={12} />Report an issue</button>}
    </div>}
  </div>;
}
