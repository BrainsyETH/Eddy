import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { DamSnapshot } from '@/lib/data/dams';
import GenerationSchedule, { ScheduleCheck, ScheduleDateline, scheduleSectionCheck } from './GenerationSchedule';
import { DamReadings, DamScheduleInfoTip, type DamCardReading } from './DamCardParts';
import Card from '@/components/ui/Card';
import { damCardScheduleFacts, damScheduleAvailability } from '@/lib/dam-schedule-availability';
import { scheduleCheckLine } from '@shared/dam-generation';
import { forecastPlanStale, nextForecastChangeSentence } from '@shared/dam-forecast-copy';

/**
 * Directory and homepage summary of one dam.
 *
 * Reading order: dam, dated today → measured release, temperature (and lake
 * level on the homepage and in the directory) →
 * today's schedule → next change → schedule freshness → full report. The
 * header's dateline is the only place the card names the day; the schedule
 * section opens with the plan in words. Navigation stays separate from the
 * timeline, which takes taps and keys for inspection and never links.
 *
 * Only a dam SWPA schedules draws the schedule section. A dam with no hourly
 * schedule (Bagnell, the Nashville District dams) or no powerhouse says so in
 * one line, and a Nashville dam leads with the next change in the Corps'
 * forecast when the snapshot carries it. See dam-schedule-availability.ts.
 */
export default function DamListCard({ dam, now, href, showLakeLevel = false, unsupported }: {
  dam: DamSnapshot; now: number; href: string; showLakeLevel?: boolean;
  /** Readings Eddy has no source for at this dam; passed where the registry is at hand. */
  unsupported?: readonly DamCardReading[];
}) {
  const facts = damCardScheduleFacts(dam);
  const scheduled = facts.hasTurbines && facts.hourlySchedule;
  const scheduleCheck = scheduled ? scheduleSectionCheck(dam.schedule, dam.generationReference, now, true) : null;
  const availability = scheduled ? null : damScheduleAvailability(facts);
  // A forecast whose horizon has shrunk may no longer be refreshed, and one
  // with no window at this hour cannot say what comes next: both fall back to
  // pointing at the full report rather than stating a change.
  const forecast = scheduled ? undefined : dam.generationForecast;
  const forecastChange = forecast && !forecastPlanStale(forecast.windows, now)
    ? nextForecastChangeSentence(forecast.windows, forecast.timeZone, now)
    : null;
  // The forecast's OWN check time, in the footer corner where a scheduled card
  // says "Schedule checked". Without it the only time on the card was
  // "Measured…" in the readings band, which dates the readings and would be
  // read as dating the forecast too.
  const forecastCheck = forecast && forecastChange ? scheduleCheckLine([forecast.retrievedAt], now, 'Forecast') : null;
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
          <span className="flex shrink-0 items-center gap-2">
            {scheduled && <ScheduleDateline now={now} />}
            <ChevronRight className="size-5 shrink-0 text-neutral-500" aria-hidden="true" />
          </span>
        </Link>

        <DamReadings dam={dam} now={now} showLakeLevel={showLakeLevel} unsupported={unsupported} />
      </div>

      <div className="flex flex-1 flex-col px-4 pb-1 pt-1.5 sm:px-5">
        {scheduled ? (
          <GenerationSchedule schedule={dam.schedule} reference={dam.generationReference} now={now} compact expandedChart={showLakeLevel} info={<DamScheduleInfoTip dam={dam} />} />
        ) : availability && (
          <section aria-label="Generation schedule" data-schedule-availability={availability.kind} className="py-2">
            <h4 className="text-base font-semibold leading-snug text-primary-900">
              {forecastChange ? `${forecastChange}.` : availability.title}
            </h4>
            <p className="mt-1 text-sm leading-5 text-neutral-600">
              {forecastChange
                ? 'Corps operating forecast, not a posted schedule. Central time, at the dam.'
                : availability.brief}
            </p>
            {forecastChange && (
              <p data-forecast-caution className="mt-1 text-xs leading-4 text-neutral-600">Subject to change · Downstream timing varies</p>
            )}
          </section>
        )}
        <div className="mt-auto pt-3">
          <div className="flex flex-wrap items-center justify-between gap-x-3 border-t border-neutral-200">
            <Link href={href} prefetch={false} className="inline-flex min-h-11 items-center gap-1 rounded text-sm font-medium text-primary-700 underline-offset-4 hover:text-primary-900 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-600">
              Full report<span className="sr-only"> for {dam.name}</span><ChevronRight className="size-4" aria-hidden="true" />
            </Link>
            {(scheduleCheck ?? forecastCheck) && <div className="ml-auto py-1"><ScheduleCheck check={(scheduleCheck ?? forecastCheck)!} /></div>}
          </div>
        </div>
      </div>
    </Card>
  );
}
