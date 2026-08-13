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
// ── Why this is the feature's first client component ───────────────────────
// Two things need the reader's own clock rather than the server's: the "now"
// marker, and the per-hour readout. The pages are ISR'd at 300 seconds, so a
// server-rendered marker can be five minutes wrong. The clock is therefore
// SEEDED from the page's render time and replaced on mount — see `renderedAt`
// for why neither calling Date.now() here nor waiting for the effect works.
//
// ── Why there are no per-bar touch targets ─────────────────────────────────
// Twenty-four bars across a phone is about 14pt each, far under the 44pt floor.
// So the ROW is the control: one 44pt-tall element that reports whichever hour
// the pointer or the arrow keys are over, into a single readout line above it.
// The bars themselves are hidden from assistive technology and the row carries
// a composed sentence, the pattern NightStrip established.

import { useEffect, useMemo, useRef, useState } from 'react';
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
  renderedAt,
}: {
  day: DamScheduleDay;
  reference?: GenerationReference | null;
  /**
   * The server's render instant, handed down as a prop.
   *
   * ── Why not just call Date.now() here ────────────────────────────────────
   * Because this is a client component inside a server-rendered page, and the
   * two renders must agree or React throws the server HTML away. Calling the
   * clock independently on each side puts them milliseconds to minutes apart,
   * and if an hour boundary falls in that gap the bars change shape.
   *
   * ── Why not leave it null until mount ────────────────────────────────────
   * That is what this did first, and it meant the marker — and, in the pattern
   * strip, the whole section — was absent from the server HTML: nothing for a
   * crawler, and a visible pop-in for everyone else. Seeding from the page's
   * own render time gives correct markup immediately, and the effect below
   * replaces it with the reader's real clock a frame later. The page is ISR'd
   * at 300 seconds, so the seeded marker can be up to five minutes behind —
   * the same staleness the clock-times-never-countdowns rule already accepts,
   * and it corrects itself on mount.
   */
  renderedAt: number;
}) {
  const [now, setNow] = useState(renderedAt);
  const [hovered, setHovered] = useState<number | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  // The reader's own clock, once there is one.
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

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
      {/* One readout line, above the bars, replacing per-bar tooltips. It holds
          the day summary until something is selected so the space never jumps. */}
      <p className="mb-1 min-h-[1.25rem] text-xs tabular-nums text-neutral-600">
        {hoveredHour ? hourReadout(hoveredHour, reference) : summary}
      </p>

      <div
        ref={rowRef}
        role="img"
        aria-label={summary}
        tabIndex={0}
        className="relative flex h-11 items-end rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary-500"
        onPointerMove={(e) => setHovered(hourFromPointer(e.clientX))}
        onPointerLeave={() => setHovered(null)}
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
