import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { DamSnapshot } from '@/lib/data/dams';
import GenerationSchedule, { ScheduleCheck, scheduleSectionCheck } from './GenerationSchedule';
import { DamReadings, DamScheduleInfoTip } from './DamCardParts';
import Card from '@/components/ui/Card';
import { relativeAgeShort, readingStaleness } from '@shared/dam-schedule-copy';

/**
 * Directory and homepage summary of one dam.
 *
 * Reading order: dam → measured release and temperature → today's schedule →
 * next change → schedule freshness → full report. Navigation stays separate
 * from the timeline, which takes taps and keys for inspection and never links.
 */
export default function DamListCard({ dam, now, href, showLakeLevel = false }: { dam: DamSnapshot; now: number; href: string; showLakeLevel?: boolean }) {
  const scheduleCheck = dam.hasTurbines ? scheduleSectionCheck(dam.schedule, dam.generationReference, now, true) : null;
  const place = [dam.lakeName, dam.state].filter(Boolean).join(' · ');
  const lake = dam.metrics.poolElevation;
  const lakeAge = lake ? relativeAgeShort(lake.at, now) : null;

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

        <DamReadings dam={dam} now={now} />
        {showLakeLevel && (
          <p className="mx-4 mt-2 flex flex-wrap items-baseline gap-x-2 text-xs text-neutral-600 sm:mx-5">
            <span>Lake level</span>
            <span className={lake && readingStaleness(lake.at, now) !== 'fresh' ? 'font-mono tabular-nums text-neutral-600' : 'font-mono tabular-nums text-primary-900'}>
              {lake ? `${lake.value.toFixed(2)} ft` : 'Unavailable'}
            </span>
            {lakeAge && <span>· {lakeAge}</span>}
          </p>
        )}
      </div>

      <div className="flex flex-1 flex-col px-4 pb-1 pt-1.5 sm:px-5">
        {dam.hasTurbines && (
          <GenerationSchedule schedule={dam.schedule} reference={dam.generationReference} now={now} compact expandedChart={showLakeLevel} info={<DamScheduleInfoTip dam={dam} />} />
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
