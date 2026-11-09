import { ChevronDown, Clock } from 'lucide-react';
import type { ReactNode } from 'react';
import type { DamScheduleDay } from '@/lib/data/dams';
import DamTimeline from '@/components/dam/DamTimeline';
import {
  centralDayKey,
  nextDayKey,
  scheduleDayHeadline,
  scheduleDayLabel,
} from '@shared/dam-schedule-copy';
import {
  scheduleCheckLine,
  scheduleOutlook,
  scheduledChangeSummary,
  type GenerationReference,
  type ScheduleCheckLine,
} from '@shared/dam-generation';

/**
 * When Eddy last checked, as one quiet line for a corner. Outdated turns it
 * amber and adds a clock mark plus an accessible word, so the change is not
 * carried by colour alone. No box: it has to fit beside "Full report" on a
 * phone.
 */
export function ScheduleCheck({ check }: { check: ScheduleCheckLine }) {
  return check.stale ? (
    <p data-schedule-check="stale" className="inline-flex items-center gap-1 text-xs font-medium leading-4 text-amber-800">
      <Clock className="size-3 shrink-0" aria-hidden="true" />
      <span><span className="sr-only">Outdated: </span>{check.text}</span>
    </p>
  ) : (
    <p data-schedule-check="current" className="text-xs leading-4 text-neutral-600">{check.text}</p>
  );
}

/**
 * The single freshness line for what a schedule section shows or states.
 *
 * It covers every day the section draws OR announces a change from: a compact
 * card shows only Today but can say "Generation starts at 6 AM tomorrow", and
 * that sentence is only as current as Tomorrow's file. Exported so a card can
 * place the line in its own footer.
 */
export function scheduleSectionCheck(
  schedule: DamScheduleDay[],
  reference: GenerationReference | null | undefined,
  now: number,
  compact: boolean,
  /** A compact section that also draws Tomorrow (GenerationSchedule's `withTomorrow`). */
  withTomorrow = !compact,
): ScheduleCheckLine | null {
  const today = centralDayKey(now);
  const outlook = scheduleOutlook(schedule, reference, now);
  const posted = (date: string) => schedule.find(day => day.scheduleDate === date && day.hours.length > 0);
  const showsTomorrow = withTomorrow && Boolean(posted(nextDayKey(today)));
  const reach = Math.max(outlook?.move?.dayOffset ?? 0, outlook?.resumesAt?.dayOffset ?? 0, showsTomorrow ? 1 : 0);
  const retrievedAts: Array<string | null> = [];
  for (let offset = 0, date = today; offset <= reach; offset += 1, date = nextDayKey(date)) {
    const day = posted(date);
    if (day) retrievedAts.push(day.retrievedAt);
  }
  // The full report also shows later posted days, so its one line covers them
  // too rather than each disclosure repeating a timestamp.
  if (!compact) {
    for (const day of schedule) {
      if (day.scheduleDate > nextDayKey(today) && day.hours.length > 0) retrievedAts.push(day.retrievedAt);
    }
  }
  return scheduleCheckLine(retrievedAts, now);
}

/**
 * One schedule presentation for home, directory cards and full dam reports.
 *
 * Reading order: today's plan in words → its chart → the next change → when
 * Eddy last checked. This section is the PLAN half of a dam card; measured
 * readings sit above it with their own labels and ages, and nothing here
 * borrows their voice.
 *
 * Three states stay distinct in the headline: a posted day with no generation,
 * a posted day carrying only minimum flow, and no posted day at all.
 */
export default function GenerationSchedule({ schedule, reference, now, compact = false, withTomorrow = !compact, info }: {
  schedule: DamScheduleDay[];
  reference?: GenerationReference | null;
  now: number;
  compact?: boolean;
  /**
   * Draw a posted Tomorrow too. Full reports always do; a compact card does
   * when Tomorrow is part of its answer — a tailwater river's reading card on
   * the dam's own release, where anglers plan the night before and SWPA posts
   * weekend and Monday sheets the evening before. Later days stay on the full
   * report.
   */
  withTomorrow?: boolean;
  info?: ReactNode;
}) {
  const today = centralDayKey(now);
  const tomorrow = nextDayKey(today);
  const posted = (date: string) => schedule.find(day => day.scheduleDate === date && day.hours.length > 0);
  const todayDay = posted(today);
  // Summary cards show Today, and Tomorrow when asked. Full reports also show
  // a posted Tomorrow.
  const tomorrowDay = withTomorrow ? posted(tomorrow) : undefined;
  const laterDays = compact ? [] : schedule
    .filter(day => day.scheduleDate > tomorrow && day.hours.length > 0)
    .toSorted((a, b) => a.scheduleDate.localeCompare(b.scheduleDate));

  const nextChange = scheduledChangeSummary(schedule, reference, now);
  // A compact card places this line in its own footer corner; the full report
  // closes the section with it.
  const check = compact ? null : scheduleSectionCheck(schedule, reference, now, compact);

  const Heading = compact ? 'h4' : 'h2';
  const DayHeading = compact ? 'h5' : 'h3';

  // The sentence names its own subject and time ("Generation starts at 6 AM
  // tomorrow."), so it needs no label above it.
  const changeLine = nextChange && (
    compact
      ? <p className="mt-1.5 text-sm font-medium leading-5 text-primary-900">{nextChange}</p>
      : <p className="mt-4 rounded-r-lg border-l-4 border-accent-500 bg-secondary-50 px-4 py-3 text-lg font-semibold leading-snug text-primary-900 sm:text-xl">{nextChange}</p>
  );

  return (
    <section aria-label="Generation schedule" className="min-w-0">
      <section aria-label="Today’s generation schedule">
        <div className={`flex min-h-11 items-center justify-between gap-2 ${compact ? '-mr-2.5' : 'pr-10'}`}>
          <div className="flex min-w-0 flex-wrap items-baseline gap-x-2">
            <Heading className={`font-heading font-bold text-primary-800 ${compact ? 'text-sm' : 'text-lg'}`}>
              Today’s generation <span className="font-normal text-neutral-600">
                · {scheduleDayLabel(today)}
                {/* A card is too narrow for "Central time" to share the
                    heading's line, and on its own row it read as a second
                    heading. Abbreviated there as the iOS card does ("Schedule
                    · CT"); spoken in full. */}
                {compact && <> · <span aria-hidden="true">CT</span><span className="sr-only">Central time</span></>}
              </span>
            </Heading>
            {!compact && <span className="text-xs leading-4 text-neutral-600">Central time</span>}
          </div>
          {info}
        </div>
        {todayDay ? <>
          <p className={`font-semibold leading-snug text-primary-900 ${compact ? 'text-base' : 'text-xl sm:text-2xl'}`}>
            {scheduleDayHeadline(todayDay.hours)}
          </p>
          <div className={compact ? 'mt-2' : 'mt-3'}>
            <DamTimeline day={todayDay} reference={reference} now={now} plainLanguage compact={compact} />
          </div>
        </> : <p className="mt-1 rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-600">
          Today’s generation schedule is unavailable.
        </p>}
      </section>

      {changeLine}

      {(tomorrowDay || laterDays.length > 0) && (
        <div className={`${compact ? 'mt-3' : 'mt-4'} divide-y divide-neutral-200 border-t border-neutral-200`}>
          {tomorrowDay && (
            <section aria-label="Tomorrow’s generation schedule" className="py-3">
              <DayHeading className="text-sm font-bold text-primary-800">
                Tomorrow’s generation <span className="font-normal text-neutral-600">· {scheduleDayLabel(tomorrow)}</span>
              </DayHeading>
              <p className="mb-2 mt-0.5 text-sm font-semibold text-primary-900">{scheduleDayHeadline(tomorrowDay.hours)}</p>
              <DamTimeline day={tomorrowDay} reference={reference} now={now} plainLanguage compact={compact} />
            </section>
          )}
          {laterDays.map(day => (
              <details key={day.scheduleDate} className="group py-2">
                <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded py-2 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-primary-600 [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0">
                    <span className="block text-sm font-bold text-primary-800">{scheduleDayLabel(day.scheduleDate)}</span>
                    <span className="block text-[13px] text-neutral-600">{scheduleDayHeadline(day.hours)}</span>
                  </span>
                  <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-neutral-500 transition-transform group-open:rotate-180" />
                </summary>
                <DamTimeline day={day} reference={reference} now={now} plainLanguage />
              </details>
          ))}
        </div>
      )}
      {check && <div className="mt-3 flex justify-end border-t border-neutral-200 pt-3"><ScheduleCheck check={check} /></div>}
    </section>
  );
}
