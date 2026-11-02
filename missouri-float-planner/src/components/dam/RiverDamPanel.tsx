// src/components/dam/RiverDamPanel.tsx
// The dam section on a river hub — for a TAILWATER only, meaning a reach whose
// level is the release rather than the weather.
//
// Server component, fed by fetchRiverDam() inside the page's existing
// Promise.all, so it stays inside the hub's ISR window and there is no
// client-side flash. Returns null when the river has no dam above it.
//
// ── What the days ahead come from ───────────────────────────────────────────
// A hydropower dam shows SWPA's posted generation schedule — the same schedule
// the dam page charts hour by hour — as one tile per day: the peak and when it
// runs, or that only minimum flow is scheduled. A flood-control dam, which has
// no schedule, shows the Corps' daily-average release forecast. Why the hydro
// case never shows that forecast, and why its days were labelled a day late,
// is written up in src/lib/river-dam-panel.ts.
//
// Tiles, not a chart: they answer "which day, and when" directly, the repo
// ships no charting library by choice, and the hourly chart is one tap away on
// the dam page.
//
// ── The dam page link ──────────────────────────────────────────────────────
// It is an ordinary in-site link to /dams/[id], the page that carries the
// hourly chart, lake level and history. It wore an external-link icon, which
// read as "leaves Eddy" or "opens something new"; a chevron says "more of this".
//
// What it must never do is imply the release is a promise. The Corps changes
// schedules for power demand, transmission constraints, outages and inflow,
// and this panel sits next to a number someone may wade into.

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ChevronRight, Waves } from 'lucide-react';
import type { RiverDamContext } from '@/lib/data/dams';
import {
  nextScheduleChangeSentence,
  readingStaleness,
  relativeAge,
  SCHEDULE_CHANGE_NOTE,
} from '@shared/dam-schedule-copy';
import { generationNow, generationStatusLabel } from '@shared/dam-generation';
import { reachAnchorId } from '@/components/river/RiverReaches';
import { dailyForecastDays, scheduleDaySummaries } from '@/lib/river-dam-panel';

function cfs(n: number): string {
  return Math.round(n).toLocaleString();
}

function DayTile({
  dayName,
  dateLabel,
  children,
}: {
  dayName: string;
  dateLabel: string;
  children: ReactNode;
}) {
  return (
    <li className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2.5">
      <div className="text-xs font-semibold text-neutral-600">
        {/* Each half nowrap, so a narrow tile breaks BETWEEN them, never "Nov / 1". */}
        <span className="whitespace-nowrap">{dayName}</span>{' '}
        <span className="whitespace-nowrap font-normal text-neutral-400">· {dateLabel}</span>
      </div>
      {children}
    </li>
  );
}

export default function RiverDamPanel({
  context,
  /**
   * The controlled reach's slug, CONFIRMED to exist on this page — see the
   * page's controlledReach. Not read off the registry here: this renders a hash
   * link, and a hash to an id nothing emitted looks live and scrolls nowhere.
   */
  controlledReachSlug,
  now = Date.now(),
}: {
  context: RiverDamContext | null;
  controlledReachSlug?: string | null;
  now?: number;
}) {
  if (!context) return null;

  const { dam, forecast } = context;
  const release = dam.metrics.release;

  const scheduleDays = dam.hasTurbines
    ? scheduleDaySummaries(dam.schedule, dam.generationReference, now)
    : [];
  const forecastDays = dam.hasTurbines ? [] : dailyForecastDays(forecast, now);

  // Nothing to say without a current release or a forward view. Better an
  // absent section than a section explaining its own emptiness.
  if (!release && scheduleDays.length === 0 && forecastDays.length === 0) return null;

  // Null is "the timestamp could not be read", which is not a lag. `!== 'fresh'`
  // swept it in and asserted a staleness it had no basis for.
  const releaseLag = release ? readingStaleness(release.at, now) : null;
  const releaseIsLagging = releaseLag === 'lagging' || releaseLag === 'stale';

  // What the powerhouse is doing, in the same words the dam page's hero uses
  // ("Minimum flow", "Generating now"). Null for a dam with no powerhouse,
  // which falls back to describing the release itself.
  const generation = generationNow(dam, now);
  const powerhouse = generation.kind === 'unavailable' ? null : generationStatusLabel(generation);
  const releaseWords = powerhouse
    ? powerhouse
    : release?.dailyMean
        ? 'Daily average release'
        : 'Total release';

  const nextChange = dam.hasTurbines ? nextScheduleChangeSentence(dam.schedule, now) : null;

  return (
    <div className="card-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Waves className="h-4 w-4 text-primary-700" aria-hidden />
          <h3
            className="text-lg font-bold text-neutral-900"
            style={{ fontFamily: 'var(--font-display)' }}
          >
            {dam.name}
          </h3>
        </div>
        <Link
          href={`/dams/${dam.id}`}
          className="inline-flex min-h-11 items-center gap-0.5 text-sm font-medium text-primary-700 hover:text-primary-800"
        >
          {dam.hasTurbines ? 'Hourly schedule' : 'Dam page'}
          <ChevronRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>

      {release && (
        <div className="mt-2">
          <div className="text-3xl font-bold tabular-nums text-neutral-900">
            {cfs(release.value)} <span className="text-lg font-medium text-neutral-500">cfs</span>
          </div>
          <div className="text-sm text-neutral-600">
            {/* The age is from the timestamp, not the wire's `staleness` — that
                band is stamped at snapshot assembly and frozen. See
                readingStaleness in shared/. */}
            {[releaseWords, relativeAge(release.at, now), releaseIsLagging ? 'reading is lagging' : null]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </div>
      )}

      {dam.hasTurbines && (
        <div className="mt-4">
          <p className="text-xs font-medium text-neutral-500">Generation schedule (SWPA)</p>
          {scheduleDays.length > 0 ? (
            <>
              <ul className="mt-2 grid gap-2 sm:grid-cols-2">
                {scheduleDays.map((d) => (
                  <DayTile key={d.key} dayName={d.dayName} dateLabel={d.dateLabel}>
                    <div
                      className={`mt-1 text-sm font-bold tabular-nums ${
                        d.generates ? 'text-neutral-900' : 'text-neutral-600'
                      }`}
                    >
                      {d.headline}
                    </div>
                    {d.detail && <div className="mt-0.5 text-xs text-neutral-500">{d.detail}</div>}
                  </DayTile>
                ))}
              </ul>
              {nextChange && (
                <p className="mt-3 text-sm font-medium text-neutral-800">
                  {nextChange}
                  <span className="block text-xs font-normal text-neutral-500">{SCHEDULE_CHANGE_NOTE}</span>
                </p>
              )}
            </>
          ) : (
            <p className="mt-1 text-sm text-neutral-600">
              No posted schedule Eddy can confirm right now. SWPA posts the next
              day&rsquo;s schedule each afternoon.
              {dam.infoPhone && (
                <>
                  {' '}
                  Recorded release line:{' '}
                  <a
                    href={`tel:${dam.infoPhone.replace(/\D/g, '')}`}
                    className="font-medium text-primary-700 underline hover:text-primary-800"
                  >
                    {dam.infoPhone}
                  </a>
                  .
                </>
              )}
            </p>
          )}
        </div>
      )}

      {forecastDays.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-medium text-neutral-500">
            Corps release forecast · {context.forecastIsDaily ? 'daily average' : 'daily peak'}
          </p>
          <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-7">
            {forecastDays.map((d) => (
              <DayTile key={d.key} dayName={d.dayName} dateLabel={d.dateLabel}>
                <div className="mt-1 text-sm font-bold tabular-nums text-neutral-900">
                  {cfs(d.cfs)} <span className="text-xs font-medium text-neutral-500">cfs</span>
                </div>
              </DayTile>
            ))}
          </ul>
        </div>
      )}

      {/* Which reach, by name, when the river carries more than one. Same-page
          hash, so this needs no route change — the panel is already ON the
          river page. */}
      {controlledReachSlug && (
        <a
          href={`#${reachAnchorId(controlledReachSlug)}`}
          className="mt-3 inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:text-primary-800"
        >
          See the reach it controls
        </a>
      )}

      <p className="mt-4 border-t border-neutral-200 pt-3 text-xs text-neutral-500">
        This reach runs at whatever {dam.name} releases, so it follows the dam
        rather than the rain. Schedules can change without notice — never wade
        or anchor below a dam without checking the horn and posted warnings.
        {dam.sources.length > 0 && ` Source: ${dam.sources.join(' · ')}.`}
      </p>
    </div>
  );
}
