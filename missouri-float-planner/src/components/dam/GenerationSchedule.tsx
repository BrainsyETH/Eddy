import { ChevronDown, Clock } from 'lucide-react';
import type { DamScheduleDay } from '@/lib/data/dams';
import DamTimeline from '@/components/dam/DamTimeline';
import {
  idleWindowSentence,
  oldestRetrievedAt,
  scheduleDayLabel,
  scheduledHoursSummary,
  retrievalSentence,
  scheduleIsStale,
} from '@shared/dam-schedule-copy';
import {
  PEAK_RELEASE_HEADING,
  schedulePeak,
  schedulePeakValue,
  scheduledChangeSummary,
  scheduledClauseProvenance,
  type GenerationReference,
} from '@shared/dam-generation';

export default function GenerationSchedule({ schedule, reference, now }: {
  schedule: DamScheduleDay[];
  reference?: GenerationReference | null;
  now: number;
}) {
  if (!schedule.length) return null;
  const oldestRetrieval = oldestRetrievedAt(schedule);
  const retrieval = retrievalSentence(oldestRetrieval, now, 'Schedule');
  const nextChange = scheduledChangeSummary(schedule, reference, now);
  const provenance = scheduledClauseProvenance(schedule, reference, now);
  return (
    <section aria-label="Generation schedule" className="min-w-0">
      <h2 className="flex items-center gap-2 text-xl font-semibold text-primary-800" style={{ fontFamily: 'var(--font-display)' }}>
        <Clock className="size-4 text-primary-700" aria-hidden="true" /> Generation schedule
      </h2>
      {nextChange && (
        <div className="my-5 border-l-4 border-primary-300 pl-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-neutral-600">Next scheduled change</h3>
          <p className="mt-1 text-xl font-semibold leading-snug tracking-tight text-primary-900 sm:text-2xl">{nextChange}</p>
          {provenance && <p className="mt-2 text-xs text-accent-700">{provenance}</p>}
        </div>
      )}
      <div className="mt-2 divide-y divide-neutral-200">
        {schedule.map((day, index) => {
          const peak = schedulePeak(day, reference);
          return (
            <details key={day.scheduleDate} open={index === 0} className="group py-2">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded py-2 hover:bg-neutral-50 focus-visible:outline-2 focus-visible:outline-primary-600 [&::-webkit-details-marker]:hidden">
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-primary-800">{scheduleDayLabel(day.scheduleDate)}</span>
                  <span className="mt-0.5 block text-xs text-neutral-600">{scheduledHoursSummary(day.hours)}</span>
                </span>
                <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-neutral-500 transition-transform group-open:rotate-180" />
              </summary>
              {peak && <div className="mb-3 mt-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <span className="text-xs text-neutral-500">{PEAK_RELEASE_HEADING}</span>
                <span className="font-mono text-sm text-primary-800">{schedulePeakValue(peak)}</span>
              </div>}
              <DamTimeline day={day} reference={reference} now={now} />
              <p className="mb-2 mt-3 text-xs text-neutral-600">{idleWindowSentence(day.idle)}</p>
            </details>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-neutral-200 pt-3 text-xs text-neutral-500">
        <span>Central time · At the dam · Subject to change</span>
        {retrieval && <span className={scheduleIsStale(oldestRetrieval, now) ? 'font-medium text-accent-700' : undefined}>{retrieval}</span>}
      </div>
      <p className="mt-1 text-xs text-neutral-500">Water reaches downstream locations later.</p>
    </section>
  );
}
