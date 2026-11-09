// src/components/dam/RiverDamPanel.tsx
// The dam's part of a tailwater river's live report, drawn as the dam card's
// body (DamCardParts + GenerationSchedule, the same parts DamListCard uses on
// the directory and the homepage): release and water temperature at the dam,
// today's hourly bars with the now line, and the next scheduled change.
//
// ── Inside the reading card, not a section of its own ──────────────────────
// It used to be a "Dam release" section under the whole live report, plus a
// status row under the reading. The schedule decides a day on a tailwater, so
// it is in the card now, in one of two positions (RiverGaugeDetail picks, per
// shared/dam-release-tab.ts):
//
//   lead    on the dam's own unrated release, as the WHOLE card, in place of an
//           "Unknown" verdict, "Not rated by Eddy" and the gauge card's rows
//           and age line, which only restated it. The release has no float ladder
//           (shared/tailwater-status.ts says why one cannot be borrowed), so the
//           dam is the answer: it opens the card, and draws Tomorrow's bars too,
//           because anglers plan the night before and SWPA posts weekend and
//           Monday sheets the evening before (weekday sheets land overnight;
//           see SCHEDULE_POSTING_NOTE).
//   footer  on every other tab, under the reading it qualifies, Today only:
//           a rated gauge keeps its verdict, a downstream gauge its reading.
//
// ── What the dam card does not say, and this does ──────────────────────────
// A dam card is read at the dam. A river page is read downstream, so the
// tailwater lines from buildTailwaterStatus() follow the bars — chiefly "Water
// already released may still be moving downstream", the safety caveat the old
// status row carried.
//
// A dam with no powerhouse (Clearwater) has no posted schedule. Its look ahead
// is the Corps' daily release forecast, given one line (shared/river-dam-panel).
//
// Server component, fed by fetchRiverDam() inside the page's Promise.all.

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { RiverDamContext } from '@/lib/data/dams';
import { dailyForecastDays } from '@shared/river-dam-panel';
import { buildTailwaterStatus } from '@shared/tailwater-status';
import GenerationSchedule, { ScheduleCheck, ScheduleDateline, scheduleSectionCheck } from './GenerationSchedule';
import { DamReadings, DamScheduleInfoTip } from './DamCardParts';

export type RiverDamPanelPosition = 'lead' | 'footer';

function cfs(n: number): string {
  return `${Math.round(n).toLocaleString()} cfs`;
}

export default function RiverDamPanel({
  context,
  position,
  now = Date.now(),
}: {
  context: RiverDamContext | null;
  position: RiverDamPanelPosition;
  now?: number;
}) {
  if (!context) return null;

  const { dam, forecast } = context;
  const lead = position === 'lead';
  const scheduleCheck = dam.hasTurbines
    ? scheduleSectionCheck(dam.schedule, dam.generationReference, now, true, lead)
    : null;
  // Null for a dam with no powerhouse, whose turbine sentences do not apply.
  const supporting = buildTailwaterStatus(dam, now)?.supporting ?? [];
  const forecastDays = dam.hasTurbines ? [] : dailyForecastDays(forecast, now, 2);

  return (
    <section
      className={lead ? '' : 'mt-1 border-t border-neutral-200'}
      aria-labelledby="river-dam-heading"
      data-dam-panel={position}
    >
      {/* The dam card's title row: the name is the way to the full report, and
          the day the schedule below describes sits under it, where the
          directory card keeps the dam's lake. */}
      <Link
        href={`/dams/${dam.id}`}
        prefetch={false}
        className="flex min-h-11 items-center justify-between gap-3 px-4 pb-2.5 pt-3.5 transition-colors hover:bg-secondary-50 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-primary-600 sm:px-5"
      >
        <span className="min-w-0">
          <h3 id="river-dam-heading" className="font-heading text-lg font-bold leading-6 text-neutral-900">
            {dam.name}
          </h3>
          {dam.hasTurbines && <ScheduleDateline now={now} className="mt-0.5 block" />}
        </span>
        <span className="inline-flex shrink-0 items-center gap-0.5 text-sm font-medium text-primary-700">
          Full report<span className="sr-only"> for {dam.name}</span>
          <ChevronRight className="size-4" aria-hidden="true" />
        </span>
      </Link>

      <DamReadings dam={dam} now={now} />

      <div className="px-4 pt-1.5 sm:px-5">
        {dam.hasTurbines ? (
          <GenerationSchedule
            schedule={dam.schedule}
            reference={dam.generationReference}
            now={now}
            compact
            withTomorrow={lead}
            info={<DamScheduleInfoTip dam={dam} />}
          />
        ) : forecastDays.length > 0 ? (
          <p className="mt-2 text-sm text-neutral-700">
            <span className="font-medium text-primary-900">Corps release forecast</span>
            {' · '}
            {forecastDays.map((d) => `${d.dayName} ~${cfs(d.cfs)}`).join(' · ')}
            <span className="text-neutral-500"> ({context.forecastIsDaily ? 'daily average' : 'peak'})</span>
          </p>
        ) : null}

        {supporting.length > 0 && (
          <ul className="mt-2 list-none space-y-0.5 p-0 text-sm text-neutral-600">
            {supporting.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        )}

        {/* The last line of the card in both positions: on the dam tab the
            dam block is the whole card, and nothing follows the check. */}
        <div className="flex justify-end pb-3 pt-2">
          {scheduleCheck && <ScheduleCheck check={scheduleCheck} />}
        </div>
      </div>
    </section>
  );
}
