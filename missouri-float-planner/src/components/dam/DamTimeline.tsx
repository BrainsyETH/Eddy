'use client';

// src/components/dam/DamTimeline.tsx
// One day of SWPA's hourly schedule, drawn on a scale fixed to the PROJECT.
//
// ── The bug this replaces ──────────────────────────────────────────────────
// The old strip scaled every day against that day's own peak, so a day running
// two units for four hours drew exactly like a day running all eight flat out.
// Reading three days at once is the whole reason the section exists, and the
// scaling destroyed the only comparison worth making. Height is now scheduled
// megawatts over the project's scheduling capacity, identical on every day and
// every dam page.
//
// The page supplies one server-seeded display clock to this chart and the
// history strip, so they advance together on timer ticks and tab focus.
//
// ── Why there are no per-bar touch targets ─────────────────────────────────
// Twenty-four bars across a phone is about 14pt each, far under the 44pt floor.
// So the ROW is the control: one 44pt-tall element that reports whichever hour
// the pointer or the arrow keys are over, into a single readout line above it.
// The bars themselves are hidden from assistive technology and the row carries
// a composed sentence, the pattern NightStrip established.

import { useMemo, useRef, useState } from 'react';
import type { DamScheduleDay, ScheduledHour } from '@/lib/data/dams';
import { hourEndingLabel, scheduleHoursElapsed } from '@shared/dam-schedule-copy';
import {
  scheduledBar,
  scheduleDayVoiceOver,
  type GenerationReference,
} from '@shared/dam-generation';

const HOURS = 24;

/**
 * Fill intensity, in three steps of one hue.
 *
 * Redundant with height on purpose: magnitude is encoded twice so the strip
 * survives a reader who cannot separate the two lighter teals. Deliberately not
 * a green→red ramp — a capacity progression in condition colours reads as a
 * verdict on the river, and a schedule issues none.
 */
function fillClass(fraction: number): string {
  if (fraction < 0.34) return 'bg-primary-400';
  if (fraction < 0.67) return 'bg-primary-600';
  return 'bg-primary-800';
}

/** The readout line for one hour, or the day's summary when nothing is hovered. */
function hourReadout(hour: ScheduledHour, ref: GenerationReference | null | undefined): string {
  const window = `${hourEndingLabel(hour.hourEnding)}–${hourEndingLabel(hour.hourEnding + 1)}`;
  if (hour.megawatts <= 0) return `${window} · no generation scheduled`;

  const bar = scheduledBar(hour.megawatts, ref);
  const share = bar ? ` · ${Math.round(bar.fraction * 100)}% of capacity` : '';
  // A ramp hour's cfs estimate ran -41% to +117% against CWMS, because units
  // spin up partway through the hour while CWMS reports an hourly average. The
  // on/off pattern is exact; this number is not, so it is not printed.
  const flow = hour.isRamp || hour.cfs === null ? '' : ` · ~${hour.cfs.toLocaleString()} cfs`;
  return `${window} · ${hour.megawatts.toLocaleString()} MW${share}${flow}`;
}

export default function DamTimeline({
  day,
  reference,
  now,
}: {
  day: DamScheduleDay;
  reference?: GenerationReference | null;
  /** Shared display instant; identical on the server and first client render. */
  now: number;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const elapsed = scheduleHoursElapsed(day.scheduleDate, now);
  const summary = useMemo(() => scheduleDayVoiceOver(day, reference), [day, reference]);

  const hours = useMemo(() => {
    const byHour = new Map(day.hours.map((h) => [h.hourEnding, h]));
    return Array.from({ length: HOURS }, (_, i) => byHour.get(i + 1) ?? null);
  }, [day.hours]);

  const hoveredHour = hovered === null ? null : hours[hovered];

  function hourFromPointer(clientX: number) {
    const rect = rowRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return null;
    const index = Math.floor(((clientX - rect.left) / rect.width) * HOURS);
    return Math.max(0, Math.min(HOURS - 1, index));
  }

  return (
    <div>
      {/* The date disclosure already summarizes the day. Keep the full summary
          on the chart's accessible label and reserve this line for exploration. */}
      <p aria-live="polite" className="mb-1 min-h-[1.25rem] text-xs tabular-nums text-neutral-600">
        {hoveredHour ? hourReadout(hoveredHour, reference) : 'Select an hour for details'}
      </p>

      <div
        ref={rowRef}
        role="img"
        aria-label={summary}
        tabIndex={0}
        className="relative flex h-20 items-end rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        onPointerDown={(e) => setHovered(hourFromPointer(e.clientX))}
        onPointerMove={(e) => setHovered(hourFromPointer(e.clientX))}
        onPointerLeave={(e) => { if (e.pointerType !== 'touch') setHovered(null); }}
        onBlur={() => setHovered(null)}
        onKeyDown={(e) => {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
          e.preventDefault();
          const step = e.key === 'ArrowRight' ? 1 : -1;
          setHovered((prev) =>
            Math.max(0, Math.min(HOURS - 1, (prev === null ? -1 : prev) + step))
          );
        }}
      >
        {hours.map((hour, index) => {
          const bar = hour ? scheduledBar(hour.megawatts, reference) : null;
          const generating = (hour?.megawatts ?? 0) > 0;
          // Elapsed hours are dimmed: the schedule is a forward-looking
          // document, and the part of today that already happened is context
          // rather than plan. The observed record of it is the pattern strip.
          const past = elapsed !== null && index + 1 <= Math.floor(elapsed);

          return (
            <div key={index} className="flex h-full flex-1 items-end px-[0.5px]">
              {hour === null ? (
                // An hour SWPA did not publish. Neither scheduled nor idle, and
                // it must not draw like either.
                <div
                  className="w-full rounded-sm border border-dashed border-neutral-300"
                  style={{ height: '12%' }}
                />
              ) : (
                <div
                  className={[
                    'w-full rounded-sm',
                    generating ? fillClass(bar?.fraction ?? 0) : 'bg-neutral-200',
                    past ? 'opacity-45' : '',
                    hovered === index ? 'ring-2 ring-primary-900' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  style={{ height: `${Math.max((bar?.fraction ?? 0) * 100, 12)}%` }}
                />
              )}
            </div>
          );
        })}

        {/* Half-capacity hairline, so a bar's height reads against something. */}
        <div className="pointer-events-none absolute inset-x-0 bottom-1/2 h-px bg-neutral-200" />

        {elapsed !== null && (
          <div
            className="pointer-events-none absolute inset-y-0 w-0.5 bg-primary-900"
            style={{ left: `${(elapsed / HOURS) * 100}%` }}
          />
        )}
      </div>

      <div className="mt-1 flex justify-between text-[10px] text-neutral-400">
        <span>midnight</span>
        <span>6 AM</span>
        <span>noon</span>
        <span>6 PM</span>
        <span>midnight</span>
      </div>
    </div>
  );
}
