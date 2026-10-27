'use client';

import { useEffect, useRef } from 'react';
import Button from '@/components/ui/Button';
import { X } from 'lucide-react';
import type { AccessPoint } from '@/types/api';
import type { PlannerMapPlace } from '@/lib/planner-map-catalog';
import { plannerPlaceSymbol } from '@/lib/planner-place';
import { EddyIcon } from '@/components/ui/EddyIcon';
import PlannerAccessDetails from './PlannerAccessDetails';

export default function PlannerPlaceCard({ place, point, loading, failed, canTakeOut, replacingPutIn, replacingTakeOut, selectedRole, onPutIn, onTakeOut, onClose, onRetry, onShowDetails, compact = false }: {
  onShowDetails?: () => void;
  compact?: boolean;
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
  return <section ref={card} tabIndex={-1} data-planner-inspection className="card-framed shrink-0 p-4 outline-none focus-visible:ring-2 focus-visible:ring-primary-500" aria-label="Selected access point"
    onKeyDown={event => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }}>
    <div className="flex items-start gap-2">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border-2 border-primary-700 bg-white"><EddyIcon name={plannerPlaceSymbol(point ?? place)} size={35} /></span>
      <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-wider text-primary-700">Access point</p>
        <h2 className="mt-1 text-lg font-bold leading-tight text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>{place.name}</h2>
        <p className="mt-1 text-xs text-neutral-600">{place.riverName}{point?.riverMile != null ? ` · Mile ${point.riverMile}` : ''}</p></div>
      <Button variant="ghost" onClick={onClose} aria-label="Close access details" className="min-h-11 min-w-11 !p-2"><X size={18} /></Button>
    </div>
    {point && <p className="mt-3 text-xs text-neutral-600">{point.isPublic ? 'Public access' : 'Private access'}{point.feeRequired ? ' · Fee required' : ''}{selectedRole ? ` · Your ${selectedRole}` : ''}</p>}
    {loading && <p className="mt-3 text-xs text-neutral-600" role="status">Loading access details…</p>}
    {failed && <p className="mt-3 text-xs text-neutral-600" role="status">Access details couldn’t load. <button type="button" onClick={onRetry} className="font-semibold text-primary-700 underline">Try again</button></p>}
    {point?.isFloatEndpoint === false && <p className="mt-3 text-xs text-neutral-600">A place to explore; this is not a float launch.</p>}
    {!point && !loading && !failed && <p className="mt-3 text-xs text-neutral-600">This access is not available for route planning.</p>}
    {replacingPutIn && replacingTakeOut && <p className="mt-3 text-xs text-neutral-600">Your route is unchanged.</p>}
    {point && point.isFloatEndpoint !== false && !selectedRole && <div className="mt-3 flex flex-wrap gap-2">
      <Button size="sm" onClick={event => onPutIn(event.detail === 0)} className="planner-endpoint-put-in min-h-11 flex-1 whitespace-nowrap !px-2">{replacingPutIn ? 'Replace put-in' : 'Use as put-in'}</Button>
      {canTakeOut && <Button size="sm" onClick={event => onTakeOut(event.detail === 0)} className="planner-endpoint-take-out min-h-11 flex-1 whitespace-nowrap !px-2">{replacingTakeOut ? 'Replace take-out' : 'Use as take-out'}</Button>}
    </div>}
    {point && (compact ? <Button variant="ghost" onClick={onShowDetails} className="mt-3 min-h-11 w-full">View details →</Button>
      : <div className="mt-4"><PlannerAccessDetails key={`${place.riverSlug}:${point.id}`} point={point} riverSlug={place.riverSlug} /></div>)}
  </section>;
}
