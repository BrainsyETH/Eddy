'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import { MapPin, X } from 'lucide-react';
import type { AccessPoint } from '@/types/api';
import type { PlannerMapPlace } from '@/lib/planner-map-catalog';

export default function PlannerPlaceCard({ place, point, loading, failed, canTakeOut, onPutIn, onTakeOut, onClose, onRetry }: {
  place: PlannerMapPlace;
  point: AccessPoint | undefined;
  loading: boolean;
  failed: boolean;
  canTakeOut: boolean;
  onPutIn: (keyboard: boolean) => void;
  onTakeOut: (keyboard: boolean) => void;
  onClose: () => void;
  onRetry: () => void;
}) {
  const card = useRef<HTMLElement>(null);
  useEffect(() => { card.current?.focus({ preventScroll: true }); }, [place.id, place.riverSlug]);
  return <section ref={card} tabIndex={-1} className="planner-glass shrink-0 rounded-2xl p-4 outline-none focus-visible:ring-2 focus-visible:ring-primary-500" aria-label="Selected access point"
    onKeyDown={event => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
    }}>
    <div className="flex items-start gap-2">
      <MapPin size={18} className="mt-0.5 shrink-0 text-primary-600" />
      <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-wider text-primary-700">Access point</p>
        <h2 className="mt-1 text-base font-bold text-neutral-900">{place.name}</h2>
        <p className="mt-1 text-xs text-neutral-600">{place.riverName}{point?.riverMile != null ? ` · Mile ${point.riverMile}` : ''}</p></div>
      <button type="button" onClick={onClose} aria-label="Close access details" className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100"><X size={16} /></button>
    </div>
    {point && <p className="mt-3 text-xs text-neutral-600">{point.isPublic ? 'Public access' : 'Private access'}{point.feeRequired ? ' · Fee required' : ''}</p>}
    {loading && <p className="mt-3 text-xs text-neutral-600" role="status">Loading access details…</p>}
    {failed && <p className="mt-3 text-xs text-neutral-600" role="status">Access details couldn’t load. <button type="button" onClick={onRetry} className="font-semibold text-primary-700 underline">Try again</button></p>}
    {point?.isFloatEndpoint === false && <p className="mt-3 text-xs text-neutral-600">A place to explore; this is not a float launch.</p>}
    {!point && !loading && !failed && <p className="mt-3 text-xs text-neutral-600">This access is not available for route planning.</p>}
    {point && point.isFloatEndpoint !== false && <div className="mt-4 flex gap-2">
      <button type="button" onClick={event => onPutIn(event.detail === 0)} className="flex-1 rounded-xl bg-primary-700 px-3 py-2.5 text-xs font-semibold text-white hover:bg-primary-800">Use as put-in</button>
      {canTakeOut && <button type="button" onClick={event => onTakeOut(event.detail === 0)} className="flex-1 rounded-xl border border-primary-200 bg-primary-50 px-3 py-2.5 text-xs font-semibold text-primary-800 hover:bg-primary-100">Use as take-out</button>}
    </div>}
    {place.slug && <Link href={`/rivers/${place.riverSlug}/access/${place.slug}`} className="mt-3 inline-block text-xs font-semibold text-primary-700 hover:underline">View access details →</Link>}
  </section>;
}
