import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { DamMetricValue, DamSnapshot } from '@/lib/data/dams';
import { relativeAge, readingStaleness } from '@shared/dam-schedule-copy';
import GenerationSchedule from './GenerationSchedule';
import DamInfoTip from './DamInfoTip';
import Card from '@/components/ui/Card';
import { EddyIcon, type EddyIconName } from '@/components/ui/EddyIcon';

/**
 * A MEASURED reading. Its age says "Measured …" so it can never be mistaken
 * for the schedule's retrieval time below, which describes a plan.
 *
 * The icon sits inside the <dt> (a <dl> group may hold only dt/dd) and is
 * pulled into a left gutter, so it aligns beside the whole label/value group.
 */
function Reading({ label, value, unit, metric, now, icon }: {
  label: string; value: string | null; unit: string; metric?: DamMetricValue; now: number;
  icon: EddyIconName;
}) {
  const age = metric ? relativeAge(metric.at, now) : null;
  return (
    <div className="relative min-w-0 pl-9">
      <dt className="text-xs font-medium leading-4 text-neutral-600">
        <EddyIcon name={icon} size={28} className="absolute left-0 top-0.5" />
        {label}
      </dt>
      <dd className={`mt-1 flex flex-wrap items-baseline gap-x-1 text-primary-900 ${metric && readingStaleness(metric.at, now) !== 'fresh' ? 'opacity-60' : ''}`}>
        {value === null ? <span className="text-sm">Unavailable</span> : <>
          <span className="font-mono text-2xl font-medium leading-7 tabular-nums tracking-tight sm:text-[26px]">{value}</span>{' '}
          <span className="text-xs text-neutral-500">{unit}</span>
        </>}
      </dd>
      {age && <dd className="mt-0.5 text-[11px] leading-4 text-neutral-600">Measured {age}</dd>}
    </div>
  );
}

/**
 * Directory and homepage summary of one dam.
 *
 * Reading order: dam → measured release and temperature → today's schedule →
 * next change → schedule freshness → full report. Navigation stays separate
 * from the timeline, which takes taps and keys for inspection and never links.
 */
export default function DamListCard({ dam, now, href }: { dam: DamSnapshot; now: number; href: string }) {
  const flow = dam.metrics.release;
  const temperature = dam.metrics.tailwaterTempF;

  return (
    <Card as="article" variant="framed" className="flex h-full min-w-0 flex-col">
      <div className="border-b border-neutral-200">
        <Link href={href} prefetch={false} className="flex min-h-11 items-center justify-between gap-3 bg-primary-800 px-4 py-3.5 transition-colors hover:bg-primary-900 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-primary-200 sm:px-5">
          <div className="min-w-0">
            <h3 className="font-heading text-xl font-bold leading-6 text-white">{dam.name}</h3>
            {dam.lakeName && <p className="mt-0.5 text-sm text-primary-100">{dam.lakeName}</p>}
          </div>
          <ChevronRight className="size-5 shrink-0 text-primary-200" aria-hidden="true" />
        </Link>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-3 bg-secondary-100 px-4 py-3 sm:px-5">
          <Reading label={`Release${flow?.dailyMean ? ' (daily avg)' : ''}`} value={flow ? Math.round(flow.value).toLocaleString() : null} unit="cfs" metric={flow} now={now} icon="release" />
          <Reading label="Water temp" value={temperature ? temperature.value.toFixed(1) : null} unit="°F" metric={temperature} now={now} icon="waterTemperature" />
        </dl>
      </div>

      <div className="flex flex-1 flex-col px-4 pb-1 pt-1.5 sm:px-5">
        {dam.hasTurbines && (
          <GenerationSchedule schedule={dam.schedule} reference={dam.generationReference} now={now} compact info={
            <DamInfoTip title={`${dam.name} schedule`}>
              <p>All times are Central time at the dam. Schedules may change without notice.</p>
              <p>Teal bars show today’s scheduled generation on the project’s full capacity scale, so a small release draws small. The coral line marks now. Select an hour for its details.</p>
              <p>Release and water temperature are measurements, each with its own age. The schedule is a plan, checked separately.</p>
            </DamInfoTip>
          } />
        )}
        <div className="mt-auto pt-3">
          <div className="border-t border-neutral-200">
            <Link href={href} prefetch={false} className="inline-flex min-h-11 items-center gap-1 rounded text-sm font-medium text-primary-700 underline-offset-4 hover:text-primary-900 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600">
              Full report<span className="sr-only"> for {dam.name}</span><ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
        </div>
      </div>
    </Card>
  );
}
