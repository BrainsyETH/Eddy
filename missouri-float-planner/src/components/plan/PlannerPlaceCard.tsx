'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { AccessPoint } from '@/types/api';
import type { PlannerMapPlace } from '@/lib/planner-map-catalog';
import { plannerPlaceSymbol } from '@/lib/planner-place';
import { EddyIcon } from '@/components/ui/EddyIcon';
import PlannerAccessDetails from './PlannerAccessDetails';

export default function PlannerPlaceCard({ place, point, loading, failed, canTakeOut, replacingPutIn, replacingTakeOut, selectedRole, onPutIn, onTakeOut, onClose, onRetry }: {
  place: PlannerMapPlace;
  point: AccessPoint | undefined;
  loading: boolean;
  failed: boolean;
  canTakeOut: boolean;
  replacingPutIn: boolean;
  replacingTakeOut: boolean;
  selectedRole?: 'put-in' | 'take-out';
  onPutIn: (keyboard: boolean) => void;
  onTakeOut: (keyboard: boolean) => void;
  onClose: () => void;
  onRetry: () => void;
}) {
  const card = useRef<HTMLElement>(null);
  useEffect(() => {
    card.current?.focus({ preventScroll: true });
    const scroller = card.current?.closest('[data-plan-scroll]');
    if (scroller) scroller.scrollTop = 0;
  }, [place.id, place.riverSlug]);
  return <section ref={card} tabIndex={-1} className="planner-glass shrink-0 rounded-2xl p-4 outline-none focus-visible:ring-2 focus-visible:ring-primary-500" aria-label="Selected access point"
    onKeyDown={event => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }}>
    <div className="flex items-start gap-2">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-primary-100 bg-white"><EddyIcon name={plannerPlaceSymbol(point)} size={35} /></span>
      <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-wider text-primary-700">Access point</p>
        <h2 className="mt-1 text-lg font-bold leading-tight text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>{place.name}</h2>
        <p className="mt-1 text-xs text-neutral-600">{place.riverName}{point?.riverMile != null ? ` · Mile ${point.riverMile}` : ''}</p></div>
      <button type="button" onClick={onClose} aria-label="Close access details" className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100"><X size={16} /></button>
    </div>
    {point && <p className="mt-3 text-xs text-neutral-600">{point.isPublic ? 'Public access' : 'Private access'}{point.feeRequired ? ' · Fee required' : ''}{selectedRole ? ` · Your ${selectedRole}` : ''}</p>}
    {loading && <p className="mt-3 text-xs text-neutral-600" role="status">Loading access details…</p>}
    {failed && <p className="mt-3 text-xs text-neutral-600" role="status">Access details couldn’t load. <button type="button" onClick={onRetry} className="font-semibold text-primary-700 underline">Try again</button></p>}
    {point?.isFloatEndpoint === false && <p className="mt-3 text-xs text-neutral-600">A place to explore; this is not a float launch.</p>}
    {!point && !loading && !failed && <p className="mt-3 text-xs text-neutral-600">This access is not available for route planning.</p>}
    {point && point.isFloatEndpoint !== false && !selectedRole && <div className="mt-4 flex gap-2">
      <button type="button" onClick={event => onPutIn(event.detail === 0)} className={`flex-1 rounded-xl px-3 py-2.5 text-xs font-semibold ${canTakeOut && !replacingTakeOut ? 'border border-primary-200 bg-primary-50 text-primary-800 hover:bg-primary-100' : 'bg-primary-700 text-white hover:bg-primary-800'}`}>{replacingPutIn ? 'Replace put-in' : 'Use as put-in'}</button>
      {canTakeOut && <button type="button" onClick={event => onTakeOut(event.detail === 0)} className={`flex-1 rounded-xl px-3 py-2.5 text-xs font-semibold ${replacingTakeOut ? 'border border-primary-200 bg-primary-50 text-primary-800 hover:bg-primary-100' : 'bg-primary-700 text-white hover:bg-primary-800'}`}>{replacingTakeOut ? 'Replace take-out' : 'Use as take-out'}</button>}
    </div>}
    {point && <div className="mt-4"><PlannerAccessDetails key={`${place.riverSlug}:${point.id}`} point={point} riverSlug={place.riverSlug} /></div>}
  </section>;
}
