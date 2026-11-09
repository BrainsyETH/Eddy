'use client';

import type { DamSnapshot } from '@/lib/data/dams';
import GenerationCard, { type ScheduleAvailability } from './GenerationCard';
import DamPatternStrip from './DamPatternStrip';
import DamStateCard from './DamStateCard';
import GenerationForecast from './GenerationForecast';
import DamEddyRead from './DamEddyRead';
import OnTheLake from './OnTheLake';
import type { LakeSection } from '@shared/lake-types';
import { lakeSectionHasContent } from '@/lib/lakes/section';
import { damHasRead } from '@/lib/eddy/dam-read-dams';
import { useDamPageClock } from './useDamPageClock';

/** The server snapshot renders immediately; clocks and RSC refreshes enhance it. */
export default function DamDetail({ dam, renderedAt, availability, lake }: {
  dam: DamSnapshot;
  renderedAt: number;
  availability: ScheduleAvailability;
  /** The lake behind the dam, when Eddy carries it as an entity. Below the tailwater content on purpose (TAILWATER_PLAN.md). */
  lake?: LakeSection | null;
}) {
  // One server-seeded clock drives the readings, schedule and history together,
  // including immediately on return from a hidden tab across an hour boundary.
  const { now, refreshing } = useDamPageClock(renderedAt);
  const { poolElevation, tailwaterElevation, tailwaterTempF, inflow } = dam.metrics;
  const hasMeasurements = Boolean(poolElevation || tailwaterElevation || tailwaterTempF || inflow || dam.tailwaterFishery);
  // ADR 0019 §7: the water below the dam leads where Eddy carries that river
  // (the trout tailwaters); on a lake-focused destination with no Eddy river
  // below it (Truman), the lake leads.
  // No empty panel on a high-traffic page: the card needs a reading or a reviewed launch.
  const lakeShown = lakeSectionHasContent(lake) ? lake : null;
  const lakeLeads = Boolean(lakeShown && !dam.tailwater);
  return (
    <div className="space-y-6" data-dam-detail={dam.id}>
      {lakeLeads && lakeShown && <OnTheLake lake={lakeShown} now={now} />}
      <GenerationCard dam={dam} now={now} availability={availability} />
      {damHasRead(dam.id) && <DamEddyRead damId={dam.id} damName={dam.name} now={now} />}
      {dam.generationForecast && <GenerationForecast forecast={dam.generationForecast} renderedAt={now} />}
      <div className="dam-support-layout">
        {hasMeasurements && <DamStateCard dam={dam} secondary now={now} hideLakeLevel={Boolean(lakeShown?.pool)} />}
        {dam.pattern && dam.pattern.length > 0 && <DamPatternStrip pattern={dam.pattern} schedule={dam.schedule} reference={dam.generationReference} generationFloorCfs={dam.generationFloorCfs} now={now} />}
      </div>
      {!lakeLeads && lakeShown && <OnTheLake lake={lakeShown} now={now} />}
      <p className="min-h-4 text-right text-xs text-neutral-500" aria-live="polite">{refreshing ? 'Checking for updates…' : null}</p>
    </div>
  );
}
