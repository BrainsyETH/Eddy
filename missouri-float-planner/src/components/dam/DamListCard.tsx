import Link from 'next/link';
import { ChevronRight, Thermometer, Waves } from 'lucide-react';
import type { DamMetricValue, DamSnapshot } from '@/lib/data/dams';
import { relativeAge, readingStaleness, retrievalSentence } from '@shared/dam-schedule-copy';
import GenerationSchedule from './GenerationSchedule';
import DamInfoTip from './DamInfoTip';
import Card from '@/components/ui/Card';

function Reading({ label, value, unit, metric, now, icon }: {
  label: string; value: string | null; unit: string; metric?: DamMetricValue; now: number;
  icon: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <dt className="flex items-center gap-1 text-xs text-neutral-600">{icon}{label}</dt>
      <dd className={`mt-1 text-primary-900 ${metric && readingStaleness(metric.at, now) !== 'fresh' ? 'opacity-60' : ''}`}>
        {value === null ? <span className="text-sm">Unavailable</span> : <>
          <span className="font-mono text-xl tabular-nums">{value}</span>{' '}<span className="text-xs text-neutral-600">{unit}</span>
        </>}
      </dd>
      {metric && <dd className="mt-0.5 text-xs text-neutral-600">{relativeAge(metric.at, now)}</dd>}
    </div>
  );
}

/** Schedule and essential readings; navigation stays separate from the timeline. */
export default function DamListCard({ dam, now, href }: { dam: DamSnapshot; now: number; href: string }) {
  const flow = dam.metrics.release;
  const temperature = dam.metrics.tailwaterTempF;

  return (
    <Card as="article" variant="framed" className="flex h-full min-w-0 flex-col">
      <div className="border-b border-neutral-200">
        <Link href={href} prefetch={false} className="flex min-h-11 items-center justify-between gap-3 bg-primary-800 px-4 py-4 transition-colors hover:bg-primary-900 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-primary-200 sm:px-5">
          <div className="min-w-0">
            <h3 className="font-heading text-xl font-bold leading-6 text-white">{dam.name}</h3>
            {dam.lakeName && <p className="mt-1 text-sm text-primary-100">{dam.lakeName}</p>}
          </div>
          <ChevronRight className="size-5 shrink-0 text-primary-200" aria-hidden="true" />
        </Link>

        <dl className="grid grid-cols-2 gap-3 bg-secondary-100 px-4 py-3 sm:px-5">
          <Reading label={`Release${flow?.dailyMean ? ' (daily avg)' : ''}`} value={flow ? Math.round(flow.value).toLocaleString() : null} unit="cfs" metric={flow} now={now} icon={<Waves className="size-3.5 shrink-0" aria-hidden="true" />} />
          <Reading label="Water temp" value={temperature ? temperature.value.toFixed(1) : null} unit="°F" metric={temperature} now={now} icon={<Thermometer className="size-3.5 shrink-0" aria-hidden="true" />} />
        </dl>
      </div>

      <div className="flex flex-1 flex-col px-4 py-2 sm:px-5">
        {dam.hasTurbines && (
          <GenerationSchedule schedule={dam.schedule} reference={dam.generationReference} now={now} compact info={
              <DamInfoTip title={`${dam.name} schedule`}>
                <p>All times are Central time at the dam. Schedules may change without notice.</p>
                <p>Teal bars show scheduled generation on the same capacity scale for both days; orange marks Now on today’s chart. Select an hour for its details.</p>
                {dam.schedule.map(day => <p key={day.scheduleDate}>{day.scheduleDate}: {retrievalSentence(day.retrievedAt, now, 'Schedule')}</p>)}
              </DamInfoTip>
          } />
        )}
        <div className="mt-auto flex items-center justify-between gap-3 pt-2">
          <Link href={href} prefetch={false} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded text-sm font-semibold text-primary-700 hover:text-primary-900 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary-600">
            Full report<span className="sr-only"> for {dam.name}</span><ChevronRight className="size-4" aria-hidden="true" />
          </Link>
          {dam.hasTurbines && <div className="text-right text-[11px] leading-4 text-neutral-500">
            <p>Central time</p>
          </div>}
        </div>
      </div>
    </Card>
  );
}
