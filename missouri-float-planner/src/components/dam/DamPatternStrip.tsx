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

import { useEffect, useMemo, useState } from 'react';
import { Activity } from 'lucide-react';
import type { DamPatternDay, DamScheduleDay } from '@/lib/data/dams';
import { centralDayKey, scheduleHoursElapsed } from '@shared/dam-schedule-copy';
// Row construction lives in shared/ because it was written twice, once per
// platform, and every rule it encodes — the past is measured, the future is
// planned, a gap is neither — is one a port can quietly get backwards.
import {
  patternRowLabel as rowLabel,
  patternRowVoiceOver as rowVoiceOver,
  patternRows,
  type GenerationReference,
  type PatternRow as Row,
} from '@shared/dam-generation';

const HOURS = 24;

export default function DamPatternStrip({
  pattern,
  schedule,
  reference,
  generationFloorCfs,
  /** The page's render instant. See DamTimeline's `renderedAt` for the why. */
  renderedAt,
}: {
  pattern: DamPatternDay[];
  schedule: DamScheduleDay[];
  reference?: GenerationReference | null;
  generationFloorCfs?: number;
  renderedAt: number;
}) {
  const [now, setNow] = useState(renderedAt);
  // The reader's own clock, once there is one.
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const rows = useMemo<Row[]>(
    () => patternRows(pattern, schedule, reference, generationFloorCfs, now),
    [now, pattern, schedule, reference, generationFloorCfs]
  );

  if (rows.length === 0) return null;

  const todayIndex = rows.findIndex((r) => r.today);
  const elapsed = scheduleHoursElapsed(centralDayKey(now), now);

  return (
    <section className="rounded-xl border-2 border-neutral-300 bg-white p-5">
      <div className="flex items-center gap-2">
        <Activity className="h-4 w-4 text-primary-700" aria-hidden="true" />
        <h2
          className="text-lg font-bold text-neutral-900"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Generation pattern
        </h2>
      </div>
      <p className="mt-1 text-sm text-neutral-600">
        Solid bars are measured turbine discharge. Outlined bars are SWPA&rsquo;s posted
        schedule, which can change. Hatched hours are ones Eddy has no observation
        for &mdash; not hours the units were off.
      </p>

      <div className="mt-4 space-y-1">
        {rows.map((row, index) => (
          <div key={row.dayKey}>
            {/* The line between what happened and what is planned. Drawn once,
                where the rows change kind. */}
            {index === todayIndex + 1 && todayIndex >= 0 && (
              <div className="my-2 border-t border-dashed border-neutral-300" />
            )}
            <div className="flex items-center gap-2">
              <span
                className={`w-11 shrink-0 text-[10px] tabular-nums ${
                  row.today ? 'font-bold text-neutral-900' : 'text-neutral-500'
                }`}
              >
                {rowLabel(row.dayKey, row.today)}
              </span>

              <div
                role="img"
                aria-label={rowVoiceOver(row)}
                className="relative flex h-5 flex-1 items-end"
              >
                {row.cells.map((cell, i) => (
                  <div key={i} className="flex h-full flex-1 items-end px-[0.5px]">
                    {cell.kind === 'missing' ? (
                      <div className="h-full w-full rounded-[1px] border border-dashed border-neutral-300" />
                    ) : cell.kind === 'scheduled' ? (
                      <div
                        className={
                          cell.fraction > 0
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

                {row.today && elapsed !== null && (
                  <div
                    className="pointer-events-none absolute inset-y-0 w-0.5 bg-primary-900"
                    style={{ left: `${(elapsed / HOURS) * 100}%` }}
                  />
                )}
              </div>

              <span className="w-16 shrink-0 text-right text-[10px] text-neutral-400">
                {row.today ? 'now' : row.scheduled ? 'scheduled' : ''}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-2 flex justify-between pl-[3.25rem] pr-16 text-[10px] text-neutral-400">
        <span>midnight</span>
        <span>noon</span>
        <span>midnight</span>
      </div>

      <p className="mt-4 border-t border-neutral-200 pt-3 text-xs text-neutral-500">
        Central time, at the dam. A pattern is a habit, not a promise — schedules
        change without notice, and a change at the dam does not reach every
        downstream location at the same time.
      </p>
    </section>
  );
}
