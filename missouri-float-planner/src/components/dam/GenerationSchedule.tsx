// src/components/dam/GenerationSchedule.tsx
// SWPA's hourly generation schedule for one dam — the part CWMS cannot give,
// and the reason this feature exists. Server component around one client
// component per day; see DamTimeline for why the bars need the reader's clock.
//
// PRECISION DISCIPLINE, measured rather than assumed. Validated against CWMS
// turbine flow for Table Rock on 2026-07-27:
//   - idle hours are EXACT (0 MW scheduled matched ~20 cfs leakage every time)
//   - steady generation lands within ~10%
//   - RAMP hours ran -41% to +117% off, because units spin up partway through
//     the hour and CWMS reports an hourly average
// So the on/off PATTERN is stated plainly, cfs is always rounded with a "~",
// and a ramp hour shows NO number at all. Overstating what SWPA knows here
// would be telling someone it is safe to stand in a river.
//
// Hours are SWPA's own "hour ending" convention: hour 14 covers 1pm-2pm. Kept
// in the source's terms and rendered as ranges, because an off-by-one puts an
// angler in the water an hour early.

import { Clock } from 'lucide-react';
import type { DamScheduleDay } from '@/lib/data/dams';
import DamTimeline from '@/components/dam/DamTimeline';
// The hour arithmetic lives in shared/ so the iOS screen cannot drift from it.
// An off-by-one here puts an angler in the water an hour early, and two
// implementations of that sum is two chances to get it wrong.
import {
  idleWindowSentence,
  oldestRetrievedAt,
  scheduleDayLabel as dayLabel,
  retrievalSentence,
  scheduleIsStale,
} from '@shared/dam-schedule-copy';
import { scheduledBar, type GenerationReference } from '@shared/dam-generation';

function DayRow({
  day,
  reference,
  renderedAt,
}: {
  day: DamScheduleDay;
  reference?: GenerationReference | null;
  renderedAt: number;
}) {
  const generatingHours = day.hours.filter((h) => h.megawatts > 0).length;
  const peak = day.hours.reduce((max, h) => (h.megawatts > max ? h.megawatts : max), 0);
  const peakBar = scheduledBar(peak, reference);

  return (
    <div className="border-t border-neutral-200 py-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-neutral-900">{dayLabel(day.scheduleDate)}</h3>
        <span className="text-xs text-neutral-500">
          {/* "scheduled", never bare "generating": this line reads a plan, and
              it renders on the same page as a hero that may be reporting a
              measured "No turbine generation observed". A plan in a
              measurement's voice two sections apart is the contradiction
              idleWindowSentence documents fixing. */}
          {generatingHours === 0
            ? 'no generation scheduled'
            : `${generatingHours} of 24 hours scheduled to generate`}
          {/* The scale, named. Without it the fixed height is just a shorter
              bar, and the reader has no way to know the strip is comparable
              across days at all. */}
          {peakBar && ` · peaks at ${Math.round(peakBar.fraction * 100)}% of capacity`}
        </span>
      </div>

      <div className="mt-2">
        <DamTimeline day={day} reference={reference} renderedAt={renderedAt} />
      </div>

      {/* Rendered FROM the shared function rather than assembled here. This
          block used to hand-build the same sentence, which is how the web card
          came to say "No generation scheduled" while the three iOS surfaces
          still said "Generation off" — a divergence a comment claiming they
          were "kept in step" did nothing to prevent. */}
      <p className="mt-2 text-sm text-neutral-700">{idleWindowSentence(day.idle)}</p>

      {/* Magnitude, only where the estimate is meaningful: steady hours with a
          real load. Ramp hours are excluded by isRamp. */}
      {(() => {
        const steady = day.hours.filter((h) => !h.isRamp && h.cfs !== null);
        if (steady.length === 0) return null;
        const low = Math.min(...steady.map((h) => h.cfs!));
        const high = Math.max(...steady.map((h) => h.cfs!));
        return (
          <p className="mt-1 text-xs text-neutral-500">
            When running, roughly{' '}
            {low === high
              ? `${low.toLocaleString()} cfs`
              : `${low.toLocaleString()}–${high.toLocaleString()} cfs`}
            {' '}(estimated from scheduled megawatts)
          </p>
        );
      })()}
    </div>
  );
}

export default function GenerationSchedule({
  schedule,
  reference,
  renderedAt,
}: {
  schedule: DamScheduleDay[];
  reference?: GenerationReference | null;
  /** The page's render instant, threaded to each day's timeline. */
  renderedAt: number;
}) {
  if (schedule.length === 0) return null;

  // The section is only as fresh as its OLDEST day — see oldestRetrievedAt.
  // One line for the section rather than one per day: three near-identical
  // timestamps would invite the reader to think they differ meaningfully.
  const oldestRetrieval = oldestRetrievedAt(schedule);
  const retrieval = retrievalSentence(oldestRetrieval);

  return (
    <section className="rounded-xl border-2 border-neutral-300 bg-white p-5">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-primary-700" aria-hidden="true" />
        <h2
          className="text-lg font-bold text-neutral-900"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Generation schedule
        </h2>
      </div>
      <p className="mt-1 text-sm text-neutral-600">
        Posted each afternoon by Southwestern Power Administration, in
        &ldquo;hour ending&rdquo; terms.
        {reference && (
          <>
            {' '}
            Every day is drawn against the same scale — {reference.schedulingCapacityMw} MW of
            scheduling capacity — so a light day looks like one.
          </>
        )}
      </p>

      <div className="mt-4">
        {schedule.map((day) => (
          <DayRow
            key={day.scheduleDate}
            day={day}
            reference={reference}
            renderedAt={renderedAt}
          />
        ))}
      </div>

      {/* Freshness and the "subject to change" disclaimer share one block on
          purpose: WATER_REGIMES_STRATEGY.md requires that disclaimer to travel
          with the data everywhere it appears, and how old the data is means
          little without it. `retrieval` is null when the retrieval time is
          unknown, and an unknown time renders nothing rather than a guess —
          SWPA publishes no timestamp, so this is Eddy's fetch, not their post. */}
      <p className="mt-4 border-t border-neutral-200 pt-3 text-xs text-neutral-500">
        {retrieval && (
          <span className={scheduleIsStale(oldestRetrieval) ? 'font-medium text-accent-700' : undefined}>
            {retrieval}{' '}
          </span>
        )}
        Schedules can change without notice — power demand, transmission
        constraints, generator outages and inflow all move them. A change at the
        dam does not reach every downstream location at the same time. Never wade
        or anchor below a dam without checking the horn and posted warnings.
      </p>
    </section>
  );
}
