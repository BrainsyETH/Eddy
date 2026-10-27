import Link from 'next/link';
import { ArrowUpRight, Waves, Zap } from 'lucide-react';
import ConditionBadge from '@/components/ui/ConditionBadge';
import { destinationCondition, type ConditionsDestination } from '@/lib/conditions/directory';
import { formatRiverLevel } from '@/lib/river-groups';
import { generationNow, generationStatusLabel } from '@shared/dam-generation';
import { relativeAge } from '@shared/dam-schedule-copy';

export default function DestinationPreview({ destination, now, relatedLabel, distance }: {
  destination: ConditionsDestination; now: number; relatedLabel?: string; distance?: number | null;
}) {
  let reading: string | null = null;
  let age: string | null = null;
  let status: string | null = null;
  if (destination.kind === 'rivers') {
    const condition = destination.river.currentCondition;
    const value = condition?.thresholdUnit === 'cfs' ? condition.dischargeCfs : condition?.thresholdUnit === 'ft' ? condition.gaugeHeightFt : null;
    reading = destination.group ? formatRiverLevel(destination.group)
      : value != null ? `${condition?.thresholdUnit === 'cfs' ? Math.round(value).toLocaleString() : value.toFixed(2)} ${condition?.thresholdUnit}` : null;
  } else {
    const dam = destination.dam;
    status = generationStatusLabel(generationNow(dam, now));
    const flow = dam.metrics.release ?? dam.metrics.generationFlow;
    if (flow) {
      reading = `${Math.round(flow.value).toLocaleString()} cfs · ${dam.metrics.release ? 'Release' : 'Turbine flow'}${flow.dailyMean ? ' (daily avg)' : ''}`;
      age = relativeAge(flow.at, now);
    }
  }
  return <Link href={destination.href} prefetch={false} data-destination={destination.key}
    className="group flex h-full min-w-0 flex-col rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm transition-colors hover:border-primary-500 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-600 sm:p-5">
    <div className="mb-2 flex items-center gap-2 text-xs font-medium text-primary-700">
      {destination.kind === 'dams' ? <Zap size={15} aria-hidden="true" /> : <Waves size={15} aria-hidden="true" />}
      <span>{destination.kind === 'dams' ? 'Dam' : 'River'} · {destination.state}</span>
      <ArrowUpRight size={16} className="ml-auto shrink-0" aria-hidden="true" />
    </div>
    <h3 className="text-lg font-bold text-neutral-900" style={{ fontFamily: 'var(--font-display)' }}>{destination.name}</h3>
    {destination.kind === 'dams' && destination.dam.lakeName && destination.dam.lakeName !== destination.name && <p className="mt-0.5 text-sm text-neutral-600">{destination.dam.lakeName}</p>}
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {destination.kind === 'rivers' ? <ConditionBadge code={destinationCondition(destination)} /> : status && <span className="text-sm font-semibold text-primary-800">{status}</span>}
    </div>
    {reading && <p className="mt-2 text-sm font-semibold tabular-nums text-neutral-900">{reading}</p>}
    {age && <p className="mt-1 text-xs text-neutral-500">{age}</p>}
    {relatedLabel && <p className="mt-2 text-sm text-neutral-600">{relatedLabel}</p>}
    {distance != null && <p className="mt-2 text-xs text-neutral-500">{Math.max(1, Math.round(distance))} mi away</p>}
  </Link>;
}
