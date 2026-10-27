'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { PointOfInterest } from '@/types/nps';
import { EddyIcon } from '@/components/ui/EddyIcon';
import AccessPointPhoto from '@/components/access-point/AccessPointPhoto';

/** A non-launch POI is inspected without changing the float endpoints. */
export default function PlannerPoiCard({ poi, onClose }: { poi: PointOfInterest; onClose: () => void }) {
  const card = useRef<HTMLElement>(null);
  useEffect(() => {
    card.current?.focus({ preventScroll: true });
    const scroller = card.current?.closest('[data-plan-scroll]');
    if (scroller) scroller.scrollTop = 0;
  }, [poi.id]);
  const icon = poi.type === 'float_camp' ? 'campground' : poi.type === 'outfitter' ? 'outfitter' : poi.type === 'spring' || poi.type === 'waterfall' ? 'gauge' : 'accessPoint';
  return <section ref={card} tabIndex={-1} aria-label="Selected point of interest" className="planner-glass rounded-2xl p-4 outline-none focus-visible:ring-2 focus-visible:ring-primary-500" onKeyDown={event => {
    if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); onClose(); }
  }}>
    <div className="flex items-start gap-2">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-primary-100 bg-white"><EddyIcon name={icon} size={34} /></span>
      <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-wider text-primary-700">{poi.type.replaceAll('_', ' ')}</p><h2 className="mt-1 text-lg font-bold text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>{poi.name}</h2>{poi.riverMile != null && <p className="mt-1 text-xs text-neutral-500">Mile {poi.riverMile.toFixed(1)}</p>}</div>
      <button type="button" onClick={onClose} aria-label="Close place details" className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100"><X size={16} /></button>
    </div>
    {poi.images[0] && <AccessPointPhoto src={poi.images[0].url} alt={poi.name} className="mt-4 aspect-video w-full rounded-xl object-cover" />}
    {poi.description && <p className="mt-4 text-sm leading-relaxed text-neutral-700">{poi.description}</p>}
    {poi.amenities.length > 0 && <p className="mt-3 text-xs text-neutral-600">{poi.amenities.map(amenity => amenity.replaceAll('_', ' ')).join(' · ')}</p>}
    {poi.npsUrl && <a href={poi.npsUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-block text-xs font-semibold text-primary-700 hover:underline">Official details →</a>}
  </section>;
}
