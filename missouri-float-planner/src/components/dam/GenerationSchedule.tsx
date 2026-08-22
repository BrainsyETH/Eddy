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
  scheduledHoursSummary,
  retrievalSentence,
  scheduleIsStale,
} from '@shared/dam-schedule-copy';
import {
  PEAK_RELEASE_HEADING,
  schedulePeak,
  schedulePeakValue,
  type GenerationReference,
} from '@shared/dam-generation';

function DayRow({
  day,
  reference,
  renderedAt,
}: {
  day: DamScheduleDay;
  reference?: GenerationReference | null;
  renderedAt: number;
}) {
  // "scheduled" in every branch: this line reads a plan and renders on the
  // same page as a hero that may be reporting a measured "No turbine
  // generation observed".
  const summary = scheduledHoursSummary(day.hours);
  const peak = schedulePeak(day, reference);

  return (
    <div className="border-t border-neutral-200 py-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-neutral-900">{dayLabel(day.scheduleDate)}</h3>
        <span className="text-xs text-neutral-500">{summary}</span>
      </div>

      {/* HOW BIG, AND WHEN — and nothing else. This block led with "peaks at
          335 MW · 86% of capacity", which asks somebody planning a float to
          convert a power figure before it means anything, and then repeated it
          beneath as a technical line. Both are gone: megawatts are the unit the
          schedule is PUBLISHED in, and the capacity share is a fact about the
          plant rather than about the river.

          The heading says SCHEDULED because "Peak release" alone reads as a
          measurement taken downstream; this is SWPA's plan for the powerhouse. */}
      {peak && (
        <div className="mt-1">
          <p className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">
            {PEAK_RELEASE_HEADING}
          </p>
          <p className="text-base font-bold text-neutral-900">{schedulePeakValue(peak)}</p>
        </div>
      )}

      <div className="mt-2">
        <DamTimeline day={day} reference={reference} renderedAt={renderedAt} />
      </div>

      {/* Rendered FROM the shared function rather than assembled here. This
          block used to hand-build the same sentence, which is how the web card
          came to say "No generation scheduled" while the three iOS surfaces
          still said "Generation off" — a divergence a comment claiming they
          were "kept in step" did nothing to prevent. */}
      <p className="mt-2 text-sm text-neutral-700">{idleWindowSentence(day.idle)}</p>
      {/* ── Why the "roughly 500–22,600 cfs" range is gone ───────────────────
          It spanned a 45x range with no time attached, so it answered nothing
          a reader could act on — the chart above already shows the shape of
          the day, and the peak line above pins the magnitude to the hours it
          actually happens in. A range that wide reads as precision the day
          does not have. */}
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
      {/* ── Why "hour ending" is no longer in the opening line ───────────────
          It is SWPA's internal convention and the reader never sees it: the
          chart and every window label are already converted to the hour the
          water starts moving, so explaining it up front spent the most
          valuable line on the card teaching a term that does not appear on it.
          The attribution stays visible — the page's credibility rests on
          naming the publisher — and the convention moves to the tooltip, for
          anyone comparing Eddy against the posted table. */}
      <p className="mt-1 text-sm text-neutral-600">
        Posted each afternoon by{' '}
        <abbr
          title="SWPA posts these in “hour ending” terms — hour 14 is the release running 1–2 PM. Eddy shows the hour the water starts moving."
          className="cursor-help no-underline decoration-dotted underline-offset-2 hover:underline"
        >
          Southwestern Power Administration
        </abbr>
        .
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
