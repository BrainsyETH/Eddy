'use client';

import type { DamSnapshot } from '@/lib/data/dams';
import GenerationCard, { type ScheduleAvailability } from './GenerationCard';
import DamPatternStrip from './DamPatternStrip';
import DamStateCard from './DamStateCard';
import GenerationForecast from './GenerationForecast';
import { useDamPageClock } from './useDamPageClock';
import { scheduledChangeSummary, scheduledClauseProvenance } from '@shared/dam-generation';

/** The server snapshot renders immediately; clocks and RSC refreshes enhance it. */
export default function DamDetail({ dam, renderedAt, availability }: {
  dam: DamSnapshot;
  renderedAt: number;
  availability: ScheduleAvailability;
}) {
  // One server-seeded clock drives the readings, schedule and history together,
  // including immediately on return from a hidden tab across an hour boundary.
  const { now, refreshing } = useDamPageClock(renderedAt);
  const { poolElevation, tailwaterElevation, tailwaterTempF, inflow } = dam.metrics;
  const hasMeasurements = Boolean(poolElevation || tailwaterElevation || tailwaterTempF || inflow || dam.tailwaterFishery);
  // On a portrait phone the schedule column stacks under the observed panel,
  // pushing "when does it change" below the fold. Repeat the answer up top
  // there, only while the schedule is current; a stale one keeps its caveat in
  // the card. Hidden from assistive technology, which reads the card's copy.
  const nextChange = dam.schedule.length > 0 && !scheduledClauseProvenance(dam.schedule, dam.generationReference, now)
    ? scheduledChangeSummary(dam.schedule, dam.generationReference, now)
    : null;
  return (
    <div className="space-y-6" data-dam-detail={dam.id}>
      {nextChange && <p className="dam-next-glance -mt-2 text-sm text-neutral-700" aria-hidden="true">
        <span className="font-bold text-primary-800">Next scheduled change:</span> {nextChange}
      </p>}
      <GenerationCard dam={dam} now={now} availability={availability} />
      {dam.generationForecast && <GenerationForecast forecast={dam.generationForecast} renderedAt={now} />}
      <div className="dam-support-layout">
        {dam.pattern && dam.pattern.length > 0 && <DamPatternStrip pattern={dam.pattern} schedule={dam.schedule} reference={dam.generationReference} generationFloorCfs={dam.generationFloorCfs} now={now} />}
        {hasMeasurements && <DamStateCard dam={dam} secondary now={now} />}
      </div>
      <p className="min-h-4 text-right text-xs text-neutral-500" aria-live="polite">{refreshing ? 'Checking for updates…' : null}</p>
    </div>
  );
}
