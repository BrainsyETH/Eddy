// src/components/dam/RiverDamPanel.tsx
// The dam section on a tailwater river page, as one compact widget: a header
// row, then NOW and the next two days side by side.
//
// Built on the river page's own outlook card (WillItHold): same white panel,
// primary-100 rules and column dividers, uppercase day labels, mono figures.
// One row of columns, no prose — the sentences live on the dam page, which the
// header links to (an ordinary in-site link, hence the chevron).
//
// The days come from SWPA's posted schedule for a hydropower dam, and from the
// Corps' daily-average forecast only for a dam with no powerhouse. Why, and why
// those forecast days are shifted back one, is in src/lib/river-dam-panel.ts.
//
// Server component, fed by fetchRiverDam() inside the page's Promise.all.

import Link from 'next/link';
import { ChevronRight, Waves, Zap } from 'lucide-react';
import type { RiverDamContext } from '@/lib/data/dams';
import { readingStaleness, relativeAge } from '@shared/dam-schedule-copy';
import { generationNow } from '@shared/dam-generation';
import { dailyForecastDays, scheduleDaySummaries } from '@/lib/river-dam-panel';

interface Column {
  key: string;
  label: string;
  /** Generating columns take the accent; everything else is the brand teal. */
  generating: boolean;
  value: string;
  detail: string;
  /** Detail is the ALERT (generation hours) rather than a plain note. */
  emphasis: boolean;
}

function cfs(n: number): string {
  return `${Math.round(n).toLocaleString()} cfs`;
}

export default function RiverDamPanel({
  context,
  now = Date.now(),
}: {
  context: RiverDamContext | null;
  now?: number;
}) {
  if (!context) return null;

  const { dam, forecast } = context;
  const release = dam.metrics.release;
  const columns: Column[] = [];

  if (release) {
    const state = generationNow(dam, now);
    const lag = readingStaleness(release.at, now);
    const current = lag === 'fresh';
    const status =
      state.kind === 'generating'
        ? 'Generating'
        : state.kind === 'not-generating'
          ? state.minimumFlow
            ? 'Min flow'
            : 'Not generating'
          : release.dailyMean
            ? 'Daily avg'
            : 'Release';
    columns.push({
      key: 'now',
      // A reading past two hours does not get to say "now"; it says its age.
      label: current ? 'Now' : (relativeAge(release.at, now) ?? 'Last reading'),
      generating: state.kind === 'generating',
      value: cfs(release.value),
      detail: status,
      emphasis: state.kind === 'generating',
    });
  }

  if (dam.hasTurbines) {
    for (const d of scheduleDaySummaries(dam.schedule, dam.generationReference, now).slice(0, 2)) {
      columns.push({
        key: d.key,
        label: d.dayName,
        generating: d.generates,
        value: d.value,
        detail: d.detail,
        emphasis: d.generates,
      });
    }
  } else {
    for (const d of dailyForecastDays(forecast, now, 2)) {
      columns.push({
        key: d.key,
        label: d.dayName,
        generating: false,
        value: cfs(d.cfs),
        detail: context.forecastIsDaily ? 'Daily avg' : 'Peak',
        emphasis: false,
      });
    }
  }

  if (columns.length === 0) return null;

  const scheduled = dam.hasTurbines && dam.schedule.length > 0;
  const subtitle = dam.hasTurbines
    ? scheduled
      ? 'SWPA generation schedule'
      : 'Schedule not posted yet'
    : 'Corps release forecast';

  return (
    <section
      className="overflow-hidden rounded-xl border border-neutral-200 bg-white"
      aria-labelledby="river-dam-heading"
    >
      <div className="flex items-start justify-between gap-2 border-b-2 border-primary-100 px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h3 id="river-dam-heading" className="font-heading text-sm font-bold text-neutral-900">
            {dam.name}
          </h3>
          <p className="font-sans text-[11px] font-semibold uppercase tracking-wider text-neutral-500">
            {subtitle}
          </p>
        </div>
        <Link
          href={`/dams/${dam.id}`}
          className="inline-flex shrink-0 items-center gap-0.5 py-1 text-[11px] font-semibold text-primary-700 hover:text-primary-800"
        >
          {dam.hasTurbines ? 'Full schedule' : 'Dam page'}
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        </Link>
      </div>

      <div
        className="grid divide-x-2 divide-primary-100"
        style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
      >
        {columns.map((c) => {
          const Icon = c.generating ? Zap : Waves;
          return (
            <div key={c.key} className="flex min-w-0 flex-col items-center px-2 py-3 text-center sm:px-3">
              <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">{c.label}</span>
              <Icon
                className={`my-1 h-6 w-6 ${c.generating ? 'text-accent-600' : 'text-primary-700'}`}
                strokeWidth={1.75}
                aria-hidden="true"
              />
              <span className="font-mono text-xs font-bold tabular-nums text-neutral-900">{c.value}</span>
              <span
                className={`mt-1 text-[10px] uppercase tracking-wide ${
                  c.emphasis ? 'font-bold text-accent-700' : 'text-neutral-500'
                }`}
              >
                {c.detail}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
