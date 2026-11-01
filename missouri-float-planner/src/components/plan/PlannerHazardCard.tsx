'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { Hazard } from '@/types/api';
import { EddyIcon } from '@/components/ui/EddyIcon';
import { HAZARD_SEVERITY_COLORS, HAZARD_TYPES } from '@/constants';

/**
 * A hazard picked from the planner map, or from a numbered group that holds
 * one. Carries what the old floating hazard popup did — type, mile, portage,
 * description — and inspects without changing the float endpoints.
 */
export default function PlannerHazardCard({ hazard, onClose }: { hazard: Hazard; onClose: () => void }) {
  const card = useRef<HTMLElement>(null);
  useEffect(() => {
    card.current?.focus({ preventScroll: true });
    const scroller = card.current?.closest('[data-plan-scroll]');
    if (scroller) scroller.scrollTop = 0;
  }, [hazard.id]);
  const color = HAZARD_SEVERITY_COLORS[hazard.severity] ?? HAZARD_SEVERITY_COLORS.warning;
  const portage = hazard.portageRequired
    ? `Portage required${hazard.portageSide ? ` (${hazard.portageSide === 'either' ? 'either side' : `${hazard.portageSide} side`})` : ''}`
    : null;
  return <section ref={card} tabIndex={-1} data-planner-inspection aria-label="Selected hazard" className="card-framed p-4 outline-none focus-visible:ring-2 focus-visible:ring-primary-500" onKeyDown={event => {
    if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); onClose(); }
  }}>
    <div className="flex items-start gap-2">
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border-2 bg-white" style={{ borderColor: color }}><EddyIcon name="hazard" size={34} /></span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-bold uppercase tracking-wider" style={{ color }}>{HAZARD_TYPES[hazard.type] ?? 'Hazard'} · {hazard.severity}</p>
        <h2 className="mt-1 text-lg font-bold text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>{hazard.name}</h2>
        {typeof hazard.riverMile === 'number' && <p className="mt-1 text-xs text-neutral-500">Mile {hazard.riverMile.toFixed(1)}</p>}
      </div>
      <button type="button" onClick={onClose} aria-label="Close hazard details" className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100"><X size={16} /></button>
    </div>
    {portage && <p className="mt-4 text-sm font-semibold text-neutral-900">{portage}</p>}
    {hazard.description && <p className="mt-3 text-sm leading-relaxed text-neutral-700">{hazard.description}</p>}
    {hazard.seasonalNotes && <p className="mt-3 text-xs text-neutral-600">{hazard.seasonalNotes}</p>}
  </section>;
}
