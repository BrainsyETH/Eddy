'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { pickPrimaryRiverLink } from '@shared/primary-river-link';
import { stationCaption } from '@shared/station-caption';
import type { GaugeStation } from '@/hooks/useGaugeStations';
import { plannerGaugeCondition } from '@/lib/planner-markers';
import { buildZones } from '@/lib/gauge/threshold-zones';
import CurrentReadingCard from '@/components/gauge/CurrentReadingCard';
import ThresholdTable from '@/components/gauge/ThresholdTable';
import { EddyIcon } from '@/components/ui/EddyIcon';
import Button from '@/components/ui/Button';

/** A clicked gauge stays open and uses the existing gauge reading components. */
export default function PlannerGaugeCard({ gauge, onClose }: { gauge: GaugeStation; onClose: () => void }) {
  const card = useRef<HTMLElement>(null);
  useEffect(() => { card.current?.focus({ preventScroll: true }); }, [gauge.id]);
  const threshold = pickPrimaryRiverLink(gauge.thresholds ?? []) ?? gauge.thresholds?.[0];
  const condition = plannerGaugeCondition(gauge);
  const caption = stationCaption(gauge.provider ?? 'usgs', gauge.usgsSiteId);
  return <section ref={card} tabIndex={-1} data-planner-inspection aria-label="Selected gauge" className="card-framed space-y-4 p-4 outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
    onKeyDown={event => { if (event.key === 'Escape' && !event.defaultPrevented) { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
    <div className="flex items-start gap-2">
      <EddyIcon name="gauge" size={36} />
      <div className="min-w-0 flex-1"><p className="text-[10px] font-bold uppercase tracking-wider text-primary-700">Gauge</p>
        <h2 className="text-lg font-bold text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>{gauge.name}</h2>
        {caption && <p className="mt-1 text-xs text-neutral-600">{caption}</p>}</div>
      <Button variant="ghost" onClick={onClose} aria-label="Close gauge details" className="min-h-11 min-w-11 !p-2"><X size={18} /></Button>
    </div>
    {gauge.readingSuspect && <p className="text-sm text-neutral-700">{gauge.qualifierNote || 'This reading is flagged by the station provider.'}</p>}
    <CurrentReadingCard embedded siteId={gauge.usgsSiteId || ''} gaugeHeightFt={gauge.gaugeHeightFt} dischargeCfs={gauge.dischargeCfs}
      thresholdUnit={threshold?.thresholdUnit ?? (gauge.dischargeCfs != null ? 'cfs' : 'ft')}
      conditionCode={condition} readingAgeHours={gauge.readingAgeHours} zones={threshold ? buildZones(threshold, gauge.thresholdDescriptions) : undefined} />
    {threshold && <ThresholdTable {...threshold} thresholdDescriptions={gauge.thresholdDescriptions} currentCondition={condition} />}
    {gauge.usgsSiteId && <Button href={`/gauges/${encodeURIComponent(gauge.usgsSiteId)}`} variant="secondary" className="w-full">View gauge & chart →</Button>}
  </section>;
}
