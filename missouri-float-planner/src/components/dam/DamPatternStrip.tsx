'use client';

// src/components/dam/DamPatternStrip.tsx
// The rhythm: what this powerhouse actually did for the past week, and what it
// is scheduled to do for the next few days, on one fixed scale.
//
// ── Why this is the section people come back for ───────────────────────────
// "Start watching these patterns a week or two before you visit" is the advice
// every tailwater guide gives, and nobody publishes the thing that would let
// you follow it. A dam that runs mornings on weekdays and all day Saturday is a
// fact you can plan a trip around; no single current reading contains it.
//
// ── The rule that keeps it honest ──────────────────────────────────────────
// THE PAST COMES FROM OBSERVATIONS, THE FUTURE FROM SCHEDULES, AND THEY ARE
// DRAWN DIFFERENTLY. An old schedule is what was PLANNED; redrawing it as
// history would present a plan as a record of the river. Observed hours are
// solid, scheduled hours are outlined, and today's row switches from one to the
// other at the now marker — which is exactly where the knowledge changes.
//
// A third treatment exists for hours with NO observation, and it is not the
// idle treatment. A gap drawn as an empty bar says the units were off, which is
// a claim about the river during an outage.

import { useMemo } from 'react';
import { Activity } from 'lucide-react';
import DamInfoTip from './DamInfoTip';
import Card from '@/components/ui/Card';
import type { DamPatternDay, DamScheduleDay } from '@/lib/data/dams';
import { PATTERN_TIME_TICKS, patternTimeTicks } from '@/lib/dam-pattern-time';
// Row construction lives in shared/ because it was written twice, once per
// platform, and every rule it encodes — the past is measured, the future is
// planned, a gap is neither — is one a port can quietly get backwards.
import {
  patternRowLabel as rowLabel,
  patternRowVoiceOver as rowVoiceOver,
  patternRows,
  patternSpanLabel,
  type GenerationReference,
  type PatternRow as Row,
} from '@shared/dam-generation';

function PatternTimeAxis({ ticks = PATTERN_TIME_TICKS }: { ticks?: typeof PATTERN_TIME_TICKS }) {
  return <div data-pattern-time-axis aria-hidden="true" className="flex items-center gap-2 text-[9px] tabular-nums text-neutral-600 sm:text-[10px]">
    <span className="w-8 shrink-0 sm:w-11" />
    <div className="relative h-4 min-w-0 flex-1">
      {ticks.map(tick => <span key={tick.hour} className="absolute whitespace-nowrap" style={{ left: `${tick.position * 100}%`, transform: `translateX(${tick.hour === 0 ? '0' : tick.hour === 24 ? '-100%' : '-50%'})` }}>{tick.label}</span>)}
    </div>
    <span className="w-12 shrink-0 sm:w-16" />
  </div>;
}

export default function DamPatternStrip({
  pattern,
  schedule,
  reference,
  generationFloorCfs,
  now,
}: {
  pattern: DamPatternDay[];
  schedule: DamScheduleDay[];
  reference?: GenerationReference | null;
  generationFloorCfs?: number;
  /** The same server-seeded display clock used by the hourly schedule. */
  now: number;
}) {
  const rows = useMemo<Row[]>(
    () => patternRows(pattern, schedule, reference, generationFloorCfs, now),
    [now, pattern, schedule, reference, generationFloorCfs]
  );

  const slots = new Map(rows.map((row) => [row.dayKey, row.cells.length]));
  const starts = new Map(pattern.map(day => [day.scheduleDate, day.startUtc]));

  if (rows.length === 0) return null;

  const span = patternSpanLabel(rows);
  const todayIndex = rows.findIndex((r) => r.today);
  // Only legended when the strip actually draws one. A dam with a posted SWPA
  // sheet never has a `future` cell, and naming a treatment that is not on
  // screen is the same mismatch this legend exists to prevent.
  const hasFuture = rows.some((r) => r.cells.some((c) => c.kind === 'future'));
  const hasScheduled = rows.some((r) => r.cells.some((c) => c.kind === 'scheduled'));

  return (
    <Card as="section" variant="panel" className="min-w-0 p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary-700" aria-hidden="true" />
        <h2
          className="flex-1 text-xl font-semibold text-primary-800"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Generation pattern
        </h2>
        <DamInfoTip title="Generation pattern">
          <p>Solid bars show measured generation. Outlined bars show upcoming scheduled generation. Gaps mean a reading is missing, not that generation stopped.</p>
          <p>Today switches from measured hours to the posted schedule at the now marker. All times are Central time at the dam. Past generation does not predict future releases.</p>
        </DamInfoTip>
      </div>
      {/* WHICH DAYS. The hour axis under the rows has always said what a column
          is; nothing said what the stack of rows adds up to, so a reader had to
          count them. Shared with the app's strip so the two cannot describe the
          same window differently. */}
      {span ? <p className="mt-1 text-xs text-neutral-500">{span}</p> : null}
      {/* A legend, not a paragraph. The prose version said "hatched" while the
          implementation drew dashed outlines, which is the kind of mismatch
          that survives review precisely because nobody reads the sentence and
          the picture at the same time. Naming each treatment beside a sample of
          it makes that impossible. */}
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-neutral-600">
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-2.5 rounded-[1px] bg-primary-700" aria-hidden="true" />
          Measured
        </li>
        {hasScheduled && (
          <li className="flex items-center gap-1.5">
            <span
              className="h-3 w-2.5 rounded-[1px] border border-primary-600 bg-primary-100"
              aria-hidden="true"
            />
            Scheduled
          </li>
        )}
        <li className="flex items-center gap-1.5">
          <span
            className="h-3 w-2.5 rounded-[1px] border border-dashed border-neutral-300"
            aria-hidden="true"
          />
          No reading
        </li>
        {hasFuture && (
          <li className="flex items-center gap-1.5">
            <span className="h-px w-2.5 rounded-[1px] bg-neutral-200" aria-hidden="true" />
            Not yet
          </li>
        )}
      </ul>

      <div className="mt-4"><PatternTimeAxis /></div>
      <div className="mt-1 space-y-2">
        {rows.map((row, index) => {
          const ticks = patternTimeTicks(row, starts.get(row.dayKey), now);
          const hasClockChange = ticks.some((tick, index) => tick.position !== PATTERN_TIME_TICKS[index].position);
          return (
          <div key={row.dayKey}>
            {/* The line between what happened and what is planned. Drawn once,
                where the rows change kind. */}
            {index === todayIndex + 1 && todayIndex >= 0 && (
              <div className="my-2 border-t border-dashed border-neutral-300" />
            )}
            <div className="flex items-center gap-2">
              <span
                className={`w-8 shrink-0 text-[10px] tabular-nums sm:w-11 ${
                  row.today ? 'font-bold text-neutral-900' : 'text-neutral-500'
                }`}
              >
                {rowLabel(row.dayKey, row.today)}
              </span>

              <div
                role="img"
                aria-label={row.today && row.cells.length === 0 ? 'Today: no completed hours yet.' : rowVoiceOver(row)}
                className="relative flex h-8 min-w-0 flex-1 items-end sm:h-9"
              >
                {ticks.slice(1, -1).map(tick => <div
                  key={tick.hour}
                  aria-hidden="true"
                  data-pattern-time-guide={tick.hour}
                  className="pointer-events-none absolute inset-y-0 border-l border-neutral-200"
                  style={{ left: `${tick.position * 100}%` }}
                />)}
                {row.cells.map((cell, i) => (
                  <div key={i} className="relative flex h-full shrink-0 items-end px-[0.5px]" style={{ width: `${100 / (slots.get(row.dayKey) || 24)}%` }}>
                    {cell.kind === 'missing' ? (
                      <div className="h-full w-full rounded-[1px] border border-dashed border-neutral-300" />
                    ) : cell.kind === 'future' ? (
                      // An hour that has not happened, on a dam with no posted
                      // schedule. Deliberately NOT the dashed outage box: that
                      // one means "we should have a reading and do not", and
                      // wearing it for the rest of today read as a feed failure
                      // covering hours nobody could have a reading for yet.
                      // Flat and unemphasised — an empty slot, not a claim.
                      <div className="h-px w-full rounded-[1px] bg-neutral-200" />
                    ) : cell.kind === 'scheduled' ? (
                      <div
                        // `generating`, not `fraction > 0`: without a reference
                        // every fraction is 0, and a full-load hour would draw
                        // in the idle treatment.
                        className={
                          cell.generating
                            ? 'w-full rounded-[1px] border border-primary-600 bg-primary-100'
                            : 'w-full rounded-[1px] border border-neutral-200'
                        }
                        style={{ height: `${Math.max(cell.fraction * 100, 14)}%` }}
                      />
                    ) : (
                      <div
                        className={
                          cell.generating
                            ? 'w-full rounded-[1px] bg-primary-700'
                            : 'w-full rounded-[1px] bg-neutral-200'
                        }
                        style={{ height: `${Math.max(cell.fraction * 100, 14)}%` }}
                      />
                    )}
                  </div>
                ))}

                {/* Drawn from the row's OWN split rather than elapsed/24: on a
                    23- or 25-hour day the two disagree by a whole bar, and the
                    boundary between measured and scheduled cells is the instant
                    the marker is trying to name anyway. */}
                {row.splitIndex !== null && (
                  <div
                    data-pattern-now
                    className="pointer-events-none absolute inset-y-0 w-0.5 bg-primary-900"
                    style={{ left: `${(row.splitIndex / (slots.get(row.dayKey) || 24)) * 100}%` }}
                  />
                )}
              </div>

              <span
                className={`w-12 shrink-0 text-right text-[10px] sm:w-16 ${
                  row.scheduleStale ? 'font-medium text-accent-700' : 'text-neutral-500'
                }`}
              >
                {row.today ? 'now' : row.scheduled ? (row.scheduleStale ? 'outdated' : 'scheduled') : ''}
              </span>
            </div>
            {hasClockChange && <PatternTimeAxis ticks={ticks} />}
          </div>
        ); })}
      </div>

      <div className="mt-2"><PatternTimeAxis /></div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-neutral-100 pt-2">
        <span className="text-xs text-neutral-500">Central time · At the dam</span>
      </div>
    </Card>
  );
}
