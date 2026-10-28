import Link from 'next/link';
import { ChevronRight, Clock, Thermometer, Waves } from 'lucide-react';
import type { DamMetricValue, DamSnapshot } from '@/lib/data/dams';
import { centralDayKey, relativeAge, readingStaleness, retrievalSentence, scheduleIsStale } from '@shared/dam-schedule-copy';
import { scheduledChangeSummary, scheduledClauseProvenance } from '@shared/dam-generation';
import DamTimeline from './DamTimeline';
import DamInfoTip from './DamInfoTip';
import Card from '@/components/ui/Card';

function Reading({ label, value, metric, now, icon }: {
  label: string; value: string | null; metric?: DamMetricValue; now: number;
  icon: React.ReactNode;
}) {
  return (
    <div className={`flex flex-wrap items-baseline gap-x-1.5 ${metric && readingStaleness(metric.at, now) !== 'fresh' ? 'opacity-60' : ''}`}>
      <dt className="flex items-center gap-1 text-[11px] text-neutral-500">{icon}{label}</dt>
      <dd className="text-base font-bold leading-5 tabular-nums text-neutral-900">{value ?? 'Unavailable'}</dd>
      {metric && <dd className="basis-full text-[11px] leading-4 text-neutral-500">{relativeAge(metric.at, now)}</dd>}
    </div>
  );
}

/** Schedule and essential readings; navigation stays separate from the timeline. */
export default function DamListCard({ dam, now, href }: { dam: DamSnapshot; now: number; href: string }) {
  const scheduled = dam.hasTurbines ? scheduledChangeSummary(dam.schedule, dam.generationReference, now) : null;
  const scheduleAge = scheduled ? scheduledClauseProvenance(dam.schedule, dam.generationReference, now) : null;
  const todayKey = centralDayKey(now);
  const today = dam.schedule.find(day => day.scheduleDate === todayKey && day.hours.length > 0);
  const retrieval = today ? retrievalSentence(today.retrievedAt, now, 'Schedule') : null;
  const provenance = scheduleAge ?? retrieval;
  const checkedAge = today ? relativeAge(today.retrievedAt, now) : null;
  const outdatedSchedule = Boolean(scheduleAge) || Boolean(today && scheduleIsStale(today.retrievedAt, now));
  const flow = dam.metrics.release;
  const temperature = dam.metrics.tailwaterTempF;

  return (
    <Card as="article" variant="framed" className="h-full min-w-0">
      <div className="border-b border-neutral-200 bg-secondary-100 px-4 py-3 sm:px-5">
        <Link href={href} prefetch={false} className="group flex min-h-11 items-center justify-between gap-3 rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-600">
          <div className="min-w-0">
            <h3 className="text-lg font-bold leading-6 text-primary-800 group-hover:text-primary-700" style={{ fontFamily: 'var(--font-display)' }}>{dam.name}</h3>
            {dam.lakeName && <p className="text-xs text-neutral-500">{dam.lakeName}</p>}
          </div>
          <ChevronRight className="size-5 shrink-0 text-primary-700" aria-hidden="true" />
        </Link>

        <dl className="mt-2 grid grid-cols-2 gap-3">
          <Reading label={`Release${flow?.dailyMean ? ' (daily avg)' : ''}`} value={flow ? `${Math.round(flow.value).toLocaleString()} cfs` : null} metric={flow} now={now} icon={<Waves className="size-3.5" aria-hidden="true" />} />
          <Reading label="Water temp" value={temperature ? `${temperature.value.toFixed(1)} °F` : null} metric={temperature} now={now} icon={<Thermometer className="size-3.5" aria-hidden="true" />} />
        </dl>
      </div>

      <div className="px-4 py-2 sm:px-5">
        {dam.hasTurbines && (
          <section aria-label="Today’s generation schedule">
            <div className="flex items-center justify-between gap-1">
              <h4 className="flex items-center gap-1.5 text-sm font-semibold text-primary-800"><Clock className="size-4 shrink-0" aria-hidden="true" />Today’s generation schedule</h4>
              <DamInfoTip title={`${dam.name} schedule`}>
                <p>All times are Central time at the dam. Schedules may change without notice.</p>
                <p>Teal bars show scheduled generation; orange marks Now. Select an hour for its details.</p>
                {provenance && <p>{provenance}</p>}
              </DamInfoTip>
            </div>
            {scheduled && <p className="mb-3 text-sm font-semibold text-primary-900"><span className="font-normal text-neutral-500">Next: </span>{scheduled}</p>}
            {today ? <>
              <DamTimeline key={today.scheduleDate} day={today} reference={dam.generationReference} now={now} plainLanguage compact />
            </> : <p className="text-sm text-neutral-500">Today’s generation schedule is unavailable.</p>}
          </section>
        )}
        <div className="mt-2 flex items-center justify-between gap-3">
          <Link href={href} prefetch={false} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded text-sm font-semibold text-primary-700 hover:text-primary-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-600">
            Full report<span className="sr-only"> for {dam.name}</span><ChevronRight className="size-4" aria-hidden="true" />
          </Link>
          {dam.hasTurbines && <div className="text-right text-[11px] leading-4 text-neutral-500">
            <p>Central time{checkedAge ? ` · Checked ${checkedAge}` : ''}</p>
            {outdatedSchedule && <p className="text-accent-700">May have changed</p>}
          </div>}
        </div>
      </div>
    </Card>
  );
}
