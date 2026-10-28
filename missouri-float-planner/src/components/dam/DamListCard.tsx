import Link from 'next/link';
import { ChevronRight, Clock, Thermometer, Waves } from 'lucide-react';
import type { DamMetricValue, DamSnapshot } from '@/lib/data/dams';
import { centralDayKey, relativeAge, readingStaleness, retrievalSentence, scheduleIsStale } from '@shared/dam-schedule-copy';
import { scheduledChangeSummary, scheduledClauseProvenance } from '@shared/dam-generation';
import DamTimeline from './DamTimeline';
import Card from '@/components/ui/Card';

function Reading({ label, value, metric, now, icon }: {
  label: string; value: string | null; metric?: DamMetricValue; now: number;
  icon: React.ReactNode;
}) {
  return (
    <div className={metric && readingStaleness(metric.at, now) !== 'fresh' ? 'opacity-60' : undefined}>
      <dt className="flex items-center gap-1 text-xs text-neutral-500">{icon}{label}</dt>
      <dd className="mt-1 text-base font-bold tabular-nums text-neutral-900 sm:text-lg">{value ?? 'Unavailable'}</dd>
      {metric && <dd className="text-xs text-neutral-500">{relativeAge(metric.at, now)}</dd>}
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
  const flow = dam.metrics.release;
  const temperature = dam.metrics.tailwaterTempF;

  return (
    <Card as="article" variant="framed" className="h-full min-w-0">
      <div className="border-b border-neutral-200 bg-secondary-100 p-4 sm:px-5">
        <Link href={href} prefetch={false} className="group flex min-h-11 items-center justify-between gap-3 rounded focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-600">
          <div className="min-w-0">
            <h3 className="text-xl font-bold text-primary-800 group-hover:text-primary-700" style={{ fontFamily: 'var(--font-display)' }}>{dam.name}</h3>
            {dam.lakeName && <p className="mt-0.5 text-sm text-neutral-500">{dam.lakeName}</p>}
          </div>
          <ChevronRight className="size-5 shrink-0 text-primary-700" aria-hidden="true" />
        </Link>

        <dl className="mt-3 grid grid-cols-2 gap-3">
          <Reading label={`Release${flow?.dailyMean ? ' (daily avg)' : ''}`} value={flow ? `${Math.round(flow.value).toLocaleString()} cfs` : null} metric={flow} now={now} icon={<Waves className="size-3.5" aria-hidden="true" />} />
          <Reading label="Water temp" value={temperature ? `${temperature.value.toFixed(1)} °F` : null} metric={temperature} now={now} icon={<Thermometer className="size-3.5" aria-hidden="true" />} />
        </dl>
      </div>

      <div className="p-4 sm:px-5">
        {dam.hasTurbines && (
          <section aria-label="Today’s generation schedule">
            <h4 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-primary-800"><Clock className="size-4 shrink-0" aria-hidden="true" />Today’s generation schedule</h4>
            {scheduled && <div className="my-3 rounded-r-lg border-l-4 border-accent-500 bg-secondary-50 px-3 py-2">
              <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-600">Next scheduled change</p>
              <p className="mt-1 text-sm font-semibold text-primary-900">{scheduled}</p>
              {scheduleAge && <p className="mt-1 text-xs text-accent-700">{scheduleAge}</p>}
            </div>}
            {today ? <>
              <DamTimeline key={today.scheduleDate} day={today} reference={dam.generationReference} now={now} plainLanguage />
              <p className="text-xs text-neutral-500">Central time · Schedule may change</p>
            </> : <p className="text-sm text-neutral-500">Today’s generation schedule is unavailable.</p>}
            {!scheduleAge && provenance && <p className={`mt-1 text-xs ${scheduleIsStale(today?.retrievedAt, now) ? 'text-accent-700' : 'text-neutral-500'}`}>{provenance}</p>}
          </section>
        )}
        <Link href={href} prefetch={false} className="mt-2 inline-flex min-h-11 items-center gap-1 rounded text-sm font-semibold text-primary-700 hover:text-primary-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-600">
          Full report<span className="sr-only"> for {dam.name}</span><ChevronRight className="size-4" aria-hidden="true" />
        </Link>
      </div>
    </Card>
  );
}
