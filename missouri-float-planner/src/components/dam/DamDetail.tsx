'use client';

import type { DamSnapshot } from '@/lib/data/dams';
import GenerationCard, { type ScheduleAvailability } from './GenerationCard';
import DamPatternStrip from './DamPatternStrip';
import DamStateCard from './DamStateCard';
import GenerationForecast from './GenerationForecast';
import DamEddyRead from './DamEddyRead';
import LakePreview from '@/components/lake/LakePreview';
import type { LakeSection } from '@shared/lake-types';
import { damHasRead } from '@/lib/eddy/dam-read-dams';
import { useDamPageClock } from './useDamPageClock';

/** The server snapshot renders immediately; clocks and RSC refreshes enhance it. */
export default function DamDetail({ dam, renderedAt, availability, lake, lakeHref, lakeExperienceEnabled = false }: {
  dam: DamSnapshot;
  renderedAt: number;
  availability: ScheduleAvailability;
  /** The lake behind the dam, when Eddy carries it as an entity. Below the tailwater content on purpose (TAILWATER_PLAN.md). */
  lake?: LakeSection | null;
  lakeHref?: string;
  /** Explicit server release decision; data being available never enables UI. */
  lakeExperienceEnabled?: boolean;
}) {
  // One server-seeded clock drives the readings, schedule and history together,
  // including immediately on return from a hidden tab across an hour boundary.
  const { now, refreshing } = useDamPageClock(renderedAt);
  const { poolElevation, tailwaterElevation, tailwaterTempF, inflow } = dam.metrics;
  const hasMeasurements = Boolean(poolElevation || tailwaterElevation || tailwaterTempF || inflow || dam.tailwaterFishery);
  // Optional lake data only controls the lake preview. Every dam keeps the
  // same schedule, observed readings and interpretation order.
  const pilot = lakeExperienceEnabled && Boolean(lake);
  return (
    <div className="space-y-6" data-dam-detail={dam.id}>
      <GenerationCard dam={dam} now={now} availability={availability} />
      {hasMeasurements && <DamStateCard dam={dam} secondary now={now} />}
      {damHasRead(dam.id) && <DamEddyRead damId={dam.id} damName={dam.name} now={now} />}
      {dam.generationForecast && <GenerationForecast forecast={dam.generationForecast} renderedAt={now} />}
      {dam.pattern && dam.pattern.length > 0 && <DamPatternStrip pattern={dam.pattern} schedule={dam.schedule} reference={dam.generationReference} generationFloorCfs={dam.generationFloorCfs} now={now} />}
      {pilot && lake && <LakePreview lake={lake} now={now} href={lakeHref} />}
      <p className="min-h-4 text-right text-xs text-neutral-500" aria-live="polite">{refreshing ? 'Checking for updates…' : null}</p>
    </div>
  );
}
