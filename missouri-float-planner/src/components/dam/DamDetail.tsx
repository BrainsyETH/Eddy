'use client';

import type { DamSnapshot } from '@/lib/data/dams';
import GenerationCard, { type ScheduleAvailability } from './GenerationCard';
import DamPatternStrip from './DamPatternStrip';
import DamStateCard from './DamStateCard';
import GenerationForecast from './GenerationForecast';
import { useDamPageClock } from './useDamPageClock';

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
  return (
    <div className="space-y-6" data-dam-detail={dam.id}>
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
