'use client';

import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { gaugeFreshnessLabel } from '@shared/gauge-freshness';
import { flowBandSentence } from '@shared/flow-band';
import { referenceBand, type MapGaugeLite } from '@/lib/gauges/map-index';
import { useGaugeDetail } from '@/hooks/useGaugeDetail';
import Button from '@/components/ui/Button';

export default function ReferenceGaugeCard({ gauge, onClose }: { gauge: MapGaugeLite; onClose: () => void }) {
  const card = useRef<HTMLElement>(null);
  const query = useGaugeDetail(gauge.siteId);
  const reading = query.data ?? gauge;
  useEffect(() => { card.current?.focus({ preventScroll: true }); }, [gauge.siteId]);
  return <section ref={card} tabIndex={-1} data-planner-inspection aria-label="Selected USGS gauge"
    className="card-framed space-y-3 p-4 outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
    onKeyDown={event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-primary-700">USGS · {gauge.siteId}</p>
        <h2 className="text-lg font-bold text-neutral-900">{reading.name}</h2>
        <p className="text-xs text-neutral-600">{reading.curated ? 'Eddy-rated station · See gauge details for its rating' : 'Not Eddy-rated'}</p></div>
      <Button variant="ghost" aria-label="Close gauge details" onClick={onClose} className="min-h-11 min-w-11 !p-2"><X size={18} /></Button>
    </div>
    <dl className="grid grid-cols-2 gap-3 text-neutral-900">
      <div><dt className="text-xs text-neutral-600">Flow</dt><dd className="font-bold">{reading.dischargeCfs === null ? 'Unavailable' : `${reading.dischargeCfs.toLocaleString()} cfs`}</dd></div>
      <div><dt className="text-xs text-neutral-600">Gauge height</dt><dd className="font-bold">{reading.gaugeHeightFt === null ? 'Unavailable' : `${reading.gaugeHeightFt.toFixed(2)} ft`}</dd></div>
    </dl>
    <p className="text-xs text-neutral-600">{gaugeFreshnessLabel(reading.readingTimestamp)}{reading.readingTimestamp && <> · <time dateTime={reading.readingTimestamp}>{new Date(reading.readingTimestamp).toLocaleString()}</time></>}</p>
    {reading.readingSuspect && <p className="text-sm text-neutral-700">{query.data?.qualifierNote || 'USGS flagged this reading; it may be unreliable.'}</p>}
    {!reading.curated && <p className="text-sm text-neutral-700">{flowBandSentence(referenceBand(reading)) ?? 'No current historical flow comparison available.'}</p>}
    {query.isLoading && <p role="status" className="text-xs text-neutral-600">Loading station details…</p>}
    {query.isError && <p role="status" className="text-xs text-neutral-600">Station details could not refresh. <button className="min-h-11 underline" onClick={() => { void query.refetch(); }}>Retry details</button></p>}
    <Button href={`/gauges/${encodeURIComponent(gauge.siteId)}`} variant="secondary" className="w-full">View gauge & chart →</Button>
  </section>;
}
