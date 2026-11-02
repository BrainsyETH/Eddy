import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { DamMetricValue, DamSnapshot } from '@/lib/data/dams';
import { relativeAgeShort, readingStaleness } from '@shared/dam-schedule-copy';
import GenerationSchedule, { ScheduleCheck, scheduleSectionCheck } from './GenerationSchedule';
import DamInfoTip from './DamInfoTip';
import Card from '@/components/ui/Card';
import { EddyIcon, type EddyIconName } from '@/components/ui/EddyIcon';

/**
 * A MEASURED reading. Its age lives in the band's one corner line — see
 * readingAgeLine — so each value stays a clean label/number pair.
 *
 * The icon sits inside the <dt> (a <dl> group may hold only dt/dd) and is
 * pulled into a left gutter, so it aligns beside the whole label/value group.
 */
function Reading({ label, value, unit, metric, now, icon }: {
  label: string; value: string | null; unit: string; metric?: DamMetricValue; now: number;
  icon: EddyIconName;
}) {
  return (
    <div className="relative min-w-0 pl-9">
      <dt className="text-[13px] font-medium leading-4 text-neutral-700">
        <EddyIcon name={icon} size={28} className="absolute left-0 top-0.5" />
        {label}
      </dt>
      <dd className={`mt-1 flex flex-wrap items-baseline gap-x-1 text-primary-900 ${metric && readingStaleness(metric.at, now) !== 'fresh' ? 'opacity-60' : ''}`}>
        {value === null ? <span className="text-sm">Unavailable</span> : <>
          <span className="font-mono text-2xl font-medium leading-7 tabular-nums tracking-tight sm:text-[26px]">{value}</span>{' '}
          <span className="text-[13px] text-neutral-500">{unit}</span>
        </>}
      </dd>
    </div>
  );
}

/**
 * ONE age line for the readings band: "Measured 53 min ago" when both were
 * observed in the same minute (or only one exists), otherwise
 * "Release 18 min ago · Temp 1 hr ago". Still one line, but never one age for
 * two observations an hour apart, which would date one of them wrongly.
 */
function readingAgeLine(release: DamMetricValue | undefined, temperature: DamMetricValue | undefined, now: number): string | null {
  const releaseAge = release ? relativeAgeShort(release.at, now) : null;
  const temperatureAge = temperature ? relativeAgeShort(temperature.at, now) : null;
  if (!releaseAge || !temperatureAge) {
    const only = releaseAge ?? temperatureAge;
    return only ? `Measured ${only}` : null;
  }
  const minute = (iso: string) => Math.floor(Date.parse(iso) / 60_000);
  return minute(release!.at) === minute(temperature!.at)
    ? `Measured ${releaseAge}`
    : `Release ${releaseAge} · Temp ${temperatureAge}`;
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
  const measured = readingAgeLine(flow, temperature, now);
  const scheduleCheck = dam.hasTurbines ? scheduleSectionCheck(dam.schedule, dam.generationReference, now, true) : null;
  const place = [dam.lakeName, dam.state].filter(Boolean).join(' · ');

  return (
    <Card as="article" variant="framed" className="flex h-full min-w-0 flex-col">
      <div>
        {/* A plain title row rather than a teal band, matching the river card
            and the iOS app: teal is kept for links and data. */}
        <Link href={href} prefetch={false} className="flex min-h-11 items-center justify-between gap-3 px-4 pb-2.5 pt-3.5 transition-colors hover:bg-secondary-50 focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-primary-600 sm:px-5">
          <div className="min-w-0">
            <h3 className="font-heading text-xl font-bold leading-6 text-neutral-900">{dam.name}</h3>
            {place && <p className="mt-0.5 text-[13px] leading-[18px] text-neutral-600">{place}</p>}
          </div>
          <ChevronRight className="size-5 shrink-0 text-neutral-500" aria-hidden="true" />
        </Link>

        <div className="mx-3 rounded-xl bg-secondary-50 px-3 py-3 sm:mx-4 sm:px-4">
          <dl className="grid grid-cols-2 gap-x-3 gap-y-3">
            <Reading label={`Release${flow?.dailyMean ? ' (daily avg)' : ''}`} value={flow ? Math.round(flow.value).toLocaleString() : null} unit="cfs" metric={flow} now={now} icon="release" />
            <Reading label="Water temp" value={temperature ? temperature.value.toFixed(1) : null} unit="°F" metric={temperature} now={now} icon="waterTemperature" />
          </dl>
          {measured && <p data-reading-age className="mt-1.5 text-right text-xs leading-4 text-neutral-600">{measured}</p>}
        </div>
      </div>

      <div className="flex flex-1 flex-col px-4 pb-1 pt-1.5 sm:px-5">
        {dam.hasTurbines && (
          <GenerationSchedule schedule={dam.schedule} reference={dam.generationReference} now={now} compact info={
            <DamInfoTip title={`${dam.name} schedule`}>
              <p>All times are Central time at the dam. Schedules may change without notice.</p>
              <p>Teal bars show today’s scheduled generation on the project’s full capacity scale, so a small release draws small. The coral line marks now. Select an hour for its details.</p>
              <p>Release and water temperature are measurements; their age is shown under them. The schedule is a plan, and the time Eddy last checked it is shown at the bottom of the card.</p>
            </DamInfoTip>
          } />
        )}
        <div className="mt-auto pt-3">
          <div className="flex flex-wrap items-center justify-between gap-x-3 border-t border-neutral-200">
            <Link href={href} prefetch={false} className="inline-flex min-h-11 items-center gap-1 rounded text-sm font-medium text-primary-700 underline-offset-4 hover:text-primary-900 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600">
              Full report<span className="sr-only"> for {dam.name}</span><ChevronRight className="size-4" aria-hidden="true" />
            </Link>
            {scheduleCheck && <div className="ml-auto py-1"><ScheduleCheck check={scheduleCheck} /></div>}
          </div>
        </div>
      </div>
    </Card>
  );
}
