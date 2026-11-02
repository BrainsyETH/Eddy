// src/components/dam/RiverDamPanel.tsx
// The dam's part of a tailwater river's live report: a header row, NOW and the
// next two days side by side, and at most two lines of what the water below the
// dam may be doing.
//
// ── Inside the reading card, not a section of its own ──────────────────────
// It was a "Dam release" section under the whole live report, with a separate
// one-line status row under the reading card saying much of the same thing.
// The schedule is what decides a day on a tailwater, so it now lives IN the
// card, in one of two positions (RiverGaugeDetail picks):
//
//   lead    on the dam's own unrated release tab, in place of an "Unknown"
//           verdict and "Not rated by Eddy". The release has no float ladder
//           (shared/tailwater-status.ts says why one cannot be borrowed), so
//           the dam is the answer and it opens the card.
//   footer  on every other tab, under the reading it qualifies: a rated gauge
//           keeps its verdict, a downstream USGS gauge its own reading.
//
// Built on the outlook card's language (WillItHold): primary-100 rules and
// column dividers, uppercase day labels, mono figures. Nothing here borrows a
// condition colour — a second coloured badge in the card would read as a
// second rating.
//
// The days come from SWPA's posted schedule for a hydropower dam, and from the
// Corps' daily-average forecast only for a dam with no powerhouse. Why, and why
// those forecast days are shifted back one, is in shared/river-dam-panel.ts.
// The two supporting lines are buildTailwaterStatus()'s, the same strings the
// iOS card prints, and they carry the safety caveat ("Water already released
// may still be moving downstream") that the old status row did.
//
// Server component, fed by fetchRiverDam() inside the page's Promise.all.

import Link from 'next/link';
import { ChevronRight, Waves, Zap } from 'lucide-react';
import type { RiverDamContext } from '@/lib/data/dams';
import { readingStaleness, relativeAge } from '@shared/dam-schedule-copy';
import { generationNow } from '@shared/dam-generation';
import { dailyForecastDays, scheduleDaySummaries } from '@shared/river-dam-panel';
import { buildTailwaterStatus } from '@shared/tailwater-status';

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

export type RiverDamPanelPosition = 'lead' | 'footer';

export default function RiverDamPanel({
  context,
  position,
  now = Date.now(),
}: {
  context: RiverDamContext | null;
  position: RiverDamPanelPosition;
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

  // Null for a dam with no powerhouse, whose only true sentence is the header.
  const supporting = buildTailwaterStatus(dam, now)?.supporting ?? [];

  const scheduled = dam.hasTurbines && dam.schedule.length > 0;
  const subtitle = dam.hasTurbines
    ? scheduled
      ? 'SWPA generation schedule'
      : 'Schedule not posted yet'
    : 'Corps release forecast';

  return (
    <section
      className={position === 'footer' ? 'mt-1 border-t border-neutral-200' : ''}
      aria-labelledby="river-dam-heading"
      data-dam-panel={position}
    >
      <div className="flex items-start justify-between gap-2 px-4 pt-4 sm:px-5">
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
        className="mx-4 mt-3 grid divide-x-2 divide-primary-100 rounded-lg border-2 border-primary-100 sm:mx-5"
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

      {supporting.length > 0 && (
        <ul className="mx-4 mt-2 list-none space-y-0.5 p-0 text-sm text-neutral-600 sm:mx-5">
          {supporting.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )}

      {/* Times are at the dam (ADR 0017); nothing here estimates arrival downstream. */}
      <p className={`mx-4 mt-2 text-xs text-neutral-500 sm:mx-5 ${position === 'footer' ? 'pb-4' : ''}`}>
        Schedules are posted for the dam and can change without notice.
      </p>
    </section>
  );
}
