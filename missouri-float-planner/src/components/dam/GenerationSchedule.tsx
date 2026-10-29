import { ChevronDown, Clock } from 'lucide-react';
import type { ReactNode } from 'react';
import type { DamScheduleDay } from '@/lib/data/dams';
import DamTimeline from '@/components/dam/DamTimeline';
import {
  centralDayKey,
  nextDayKey,
  relativeAge,
  scheduleDayLabel,
  scheduledHoursSummary,
  retrievalSentence,
  scheduleIsStale,
} from '@shared/dam-schedule-copy';
import {
  scheduledChangeSummary,
  scheduledClauseProvenance,
  type GenerationReference,
} from '@shared/dam-generation';

/** One schedule presentation for home, directory cards and full dam reports. */
export default function GenerationSchedule({ schedule, reference, now, compact = false, info }: {
  schedule: DamScheduleDay[];
  reference?: GenerationReference | null;
  now: number;
  compact?: boolean;
  info?: ReactNode;
}) {
  const today = centralDayKey(now);
  const tomorrow = nextDayKey(today);
  const upcoming = [today, tomorrow].map(date => ({
    date,
    label: date === today ? 'Today' : 'Tomorrow',
    day: schedule.find(day => day.scheduleDate === date && day.hours.length > 0),
  }));
  const laterDays = compact ? [] : schedule
    .filter(day => day.scheduleDate > tomorrow && day.hours.length > 0)
    .toSorted((a, b) => a.scheduleDate.localeCompare(b.scheduleDate));
  const nextChange = scheduledChangeSummary(schedule, reference, now);
  const provenance = scheduledClauseProvenance(schedule, reference, now);
  const Heading = compact ? 'h4' : 'h2';
  const DayHeading = compact ? 'h5' : 'h3';
  return (
    <section aria-label="Generation schedule" className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <Heading className={`flex items-center gap-2 font-semibold text-primary-800 ${compact ? 'text-sm' : 'pr-8 text-xl'}`} style={compact ? undefined : { fontFamily: 'var(--font-display)' }}>
          <Clock className="size-4 shrink-0 text-primary-700" aria-hidden="true" /> Generation schedule
        </Heading>
        {info}
      </div>
      {nextChange && (
        <div className={compact ? 'mt-1 text-sm' : 'my-4 rounded-r-lg border-l-4 border-accent-500 bg-secondary-50 px-4 py-3'}>
          {!compact && <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-600">Next scheduled change</h3>}
          <p className={`font-semibold text-primary-900 ${compact ? '' : 'mt-1 text-xl leading-snug tracking-tight sm:text-2xl'}`}>
            {compact && <span className="font-normal text-neutral-500">Next: </span>}{nextChange}
          </p>
          {provenance && <p className="mt-1 text-xs text-accent-700">{provenance}</p>}
        </div>
      )}
      <div className="mt-2 divide-y divide-neutral-200">
        {upcoming.map(({ date, label, day }) => (
          <section key={date} aria-label={`${label}’s generation schedule`} className="py-2">
            <DayHeading className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3 text-sm font-bold text-primary-800">
              {label}<span className="text-xs font-normal text-neutral-500">{scheduleDayLabel(date)}</span>
            </DayHeading>
            {day ? <>
              <DamTimeline day={day} reference={reference} now={now} plainLanguage compact={compact} />
              <p className={`mt-1 text-[11px] leading-4 ${scheduleIsStale(day.retrievedAt, now) ? 'font-medium text-accent-700' : 'text-neutral-500'}`}>
                {relativeAge(day.retrievedAt, now) ? `Checked ${relativeAge(day.retrievedAt, now)}` : 'Schedule check time unavailable'}
                {scheduleIsStale(day.retrievedAt, now) && ' · May have changed'}
              </p>
            </> : <p className="rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-500">
              {label === 'Tomorrow' ? 'Tomorrow’s generation schedule hasn’t been posted yet.' : 'Today’s generation schedule is unavailable.'}
            </p>}
          </section>
        ))}
        {laterDays.map(day => (
            <details key={day.scheduleDate} className="group py-2">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded py-2 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-primary-600 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-primary-800">{scheduleDayLabel(day.scheduleDate)}</span>
                  <span className="sr-only">{scheduledHoursSummary(day.hours)}</span>
                </span>
                <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-neutral-500 transition-transform group-open:rotate-180" />
              </summary>
              <DamTimeline day={day} reference={reference} now={now} plainLanguage />
              <p className={`mt-1 text-xs ${scheduleIsStale(day.retrievedAt, now) ? 'text-accent-700' : 'text-neutral-500'}`}>{retrievalSentence(day.retrievedAt, now, 'Schedule')}</p>
            </details>
        ))}
      </div>
      {!compact && <p className="mt-3 border-t border-neutral-200 pt-3 text-xs text-neutral-500">Central time · Schedule may change</p>}
    </section>
  );
}
