'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import Button from '@/components/ui/Button';
import { EddyIcon } from '@/components/ui/EddyIcon';
import type { PlannerMarker } from '@/lib/planner-markers';

export default function PlannerPlaceChoices({ places, onSelect, onClose }: {
  places: PlannerMarker[]; onSelect: (place: PlannerMarker) => void; onClose: () => void;
}) {
  const card = useRef<HTMLElement>(null);
  useEffect(() => { card.current?.focus({ preventScroll: true }); }, [places]);
  return <section ref={card} tabIndex={-1} data-planner-inspection aria-label="Choose a place" className="card-framed p-3 outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
    onKeyDown={event => { if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
    <div className="flex items-center justify-between gap-2"><h2 className="font-bold text-neutral-900">{places.length} places here</h2>
      <Button variant="ghost" onClick={onClose} aria-label="Close place choices" className="min-h-11 min-w-11 !p-2"><X size={18} /></Button></div>
    <ul className="max-h-60 overflow-y-auto divide-y divide-neutral-200">
      {places.map(place => <li key={place.key}><Button variant="ghost" onClick={() => onSelect(place)} className="min-h-12 w-full !justify-start gap-3 text-left">
        <EddyIcon name={place.symbol} size={28} /><span className="min-w-0"><span className="block font-semibold">{place.name}</span>
          <span className="block text-xs font-normal text-neutral-600">{place.kind === 'gauge' ? 'Gauge' : place.kind === 'poi' ? place.poi.type.replaceAll('_', ' ') : 'Access point'}</span></span>
      </Button></li>)}
    </ul>
  </section>;
}
