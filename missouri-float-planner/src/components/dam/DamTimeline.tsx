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
import { hourEndingLabel, scheduleHoursElapsed, scheduledGeneration } from '@shared/dam-schedule-copy';
import {
  scheduledBar,
  scheduleWindowSummary,
  scheduleDayVoiceOver,
  type GenerationReference,
} from '@shared/dam-generation';

const HOURS = 24;

/**
 * Axis ticks at their true positions. A compact card drops the closing
 * midnight rather than shrinking every label to fit five.
 */
const TICKS: Array<{ label: string; at: number }> = [
  { label: '12 AM', at: 0 },
  { label: '6 AM', at: 0.25 },
  { label: 'noon', at: 0.5 },
  { label: '6 PM', at: 0.75 },
  { label: '12 AM', at: 1 },
];

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
function hourReadout(hour: ScheduledHour, ref: GenerationReference | null | undefined, plainLanguage: boolean): string {
  const window = `${hourEndingLabel(hour.hourEnding)}–${hourEndingLabel(hour.hourEnding + 1)}`;
  if (hour.minimumFlow) return `${window} · minimum flow scheduled`;
  if (hour.megawatts <= 0) return `${window} · no generation scheduled`;

  if (plainLanguage) {
    // Ramp hours have no reliable flow estimate. Retain the published power
    // figure in full instead of turning it into an unsupported river reading.
    const flow = !hour.isRamp && hour.cfs !== null
      ? ` · Est. turbine flow ${Math.round(hour.cfs).toLocaleString()} cfs`
      : '';
    return `${window} · ${hour.megawatts.toLocaleString()} MW scheduled${flow}`;
  }

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
  plainLanguage = false,
  compact = false,
  peakAtRest = true,
}: {
  day: DamScheduleDay;
  reference?: GenerationReference | null;
  /** Shared display instant; identical on the server and first client render. */
  now: number;
  /** Detail pages put a concise readout below the chart, close to its axis. */
  plainLanguage?: boolean;
  /**
    * Directory cards use a shorter plot, above the 44px touch floor.
   */
  compact?: boolean;
  /**
   * Name the peak window in the readout when no hour is inspected. A card
   * that already leads with the peak window above the chart turns this off,
   * so the line is said once; the readout still reports an inspected hour.
   */
  peakAtRest?: boolean;
}) {
  const [hovered, setHovered] = useState<number | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);

  const elapsed = scheduleHoursElapsed(day.scheduleDate, now);
  const summary = useMemo(() => scheduleDayVoiceOver(day, reference), [day, reference]);

  const hours = useMemo(() => {
    const byHour = new Map(day.hours.map((h) => [h.hourEnding, h]));
    return Array.from({ length: HOURS }, (_, i) => byHour.get(i + 1) ?? null);
  }, [day.hours]);

  const windowSummary = plainLanguage ? scheduleWindowSummary(day, reference) : null;
  const peak = windowSummary?.varied ? windowSummary.peak : null;
  const defaultHour = elapsed !== null ? Math.min(HOURS - 1, Math.floor(elapsed)) : null;
  const inspected = hovered ?? defaultHour;
  const inspectedHour = inspected === null ? null : hours[inspected];
  const capacity = reference?.schedulingCapacityMw;
  const hasScale = !compact && typeof capacity === 'number' && Number.isFinite(capacity) && capacity > 0;
  // The current scheduled hour remains visible at rest; touch selection stays
  // until another hour is picked. A missing hour must not look like zero MW.
  const defaultReadout = plainLanguage && peakAtRest ? windowSummary?.text : null;
  const readout = (
    <p data-schedule-readout aria-live="polite" className={`${plainLanguage ? 'mt-2' : 'mb-1'} min-h-15 text-[13px] leading-5 tabular-nums text-neutral-700`}>
      {inspectedHour ? hourReadout(inspectedHour, reference, plainLanguage) : inspected !== null ? `${hourEndingLabel(inspected + 1)}–${hourEndingLabel(inspected + 2)} · schedule not posted` : defaultReadout}
    </p>
  );

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
      {!plainLanguage && readout}

      <div className={`relative ${compact ? '' : 'mt-6'} ${hasScale ? 'pl-10' : ''}`}>
        {hasScale && <div data-schedule-scale aria-hidden="true" className="pointer-events-none absolute bottom-5 left-0 top-0 w-8 text-right text-[11px] leading-3 tabular-nums text-neutral-600">
          <span className="absolute -top-5 right-0 font-medium">MW</span>
          <span className="absolute -top-1.5 right-0">{capacity.toLocaleString()}</span>
          <span className="absolute -bottom-1.5 right-0">0</span>
        </div>}
        <div
          ref={rowRef}
          role="img"
          aria-label={summary}
          tabIndex={0}
          className={`relative flex ${compact ? 'h-16' : 'h-24 sm:h-28'} items-end rounded-sm border-b border-neutral-200 outline-none focus-visible:ring-2 focus-visible:ring-primary-500`}
          onPointerDown={(e) => setHovered(hourFromPointer(e.clientX))}
          onPointerMove={(e) => setHovered(hourFromPointer(e.clientX))}
          onPointerLeave={(e) => { if (e.pointerType !== 'touch') setHovered(null); }}
          onBlur={() => setHovered(null)}
          onKeyDown={(e) => {
            if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
            e.preventDefault();
            if (e.key === 'Home' || e.key === 'End') {
              setHovered(e.key === 'Home' ? 0 : HOURS - 1);
              return;
            }
            const step = e.key === 'ArrowRight' ? 1 : -1;
            setHovered((prev) =>
              Math.max(0, Math.min(HOURS - 1, (prev ?? defaultHour ?? -1) + step))
            );
          }}
        >
          {hours.map((hour, index) => {
            const bar = hour ? scheduledBar(hour.megawatts, reference) : null;
            const generating = Boolean(hour && scheduledGeneration(hour));
            const atPeak = Boolean(peak && hour?.megawatts === peak.megawatts);
            // Elapsed hours are dimmed: the schedule is a forward-looking
            // document, and the part of today that already happened is context
            // rather than plan. The observed record of it is the pattern strip.
            const past = elapsed !== null && index + 1 <= Math.floor(elapsed);

            return (
              <div key={index} className="relative z-10 flex h-full flex-1 items-end px-[0.5px]">
                {hour === null ? (
                  // An hour SWPA did not publish. Neither scheduled nor idle, and
                  // it must not draw like either.
                  <div
                    className="w-full rounded-sm border border-dashed border-neutral-300"
                    style={{ height: '12%' }}
                  />
                ) : (
                  <div
                    data-schedule-hour={hour.hourEnding}
                    data-peak-hour={atPeak ? hour.hourEnding : undefined}
                    className={[
                      'w-full rounded-sm',
                      generating ? fillClass(bar?.fraction ?? 0) : 'bg-neutral-200',
                      past ? 'opacity-90' : '',
                      atPeak && inspected !== index ? 'ring-1 ring-inset ring-primary-900' : '',
                      inspected === index ? 'ring-2 ring-primary-900' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    // A 12% floor flattened Bull Shoals' entire low-output day:
                    // even its 40 MW peak is only 10.2% of 391 MW capacity.
                    // Keep the capacity scale, with just a 2px visibility floor.
                    // Without a reference, retain an unscaled presence marker.
                    style={{ height: generating ? bar ? `${bar.fraction * 100}%` : '12%' : '0%', minHeight: 2 }}
                  />
                )}
              </div>
            );
          })}

          {hasScale && <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-neutral-200" />}

          {elapsed !== null && <>
            <div
              data-schedule-now
              className="pointer-events-none absolute inset-y-0 z-20 w-0.5 bg-accent-600"
              style={{ left: `${(elapsed / HOURS) * 100}%` }}
            />
            <span aria-hidden="true" className={`pointer-events-none absolute ${compact ? 'top-0' : '-top-5'} z-20 -translate-x-1/2 rounded-sm bg-white px-1 text-[11px] font-semibold leading-3 text-accent-800`} style={{ left: `clamp(15px, ${(elapsed / HOURS) * 100}%, calc(100% - 15px))` }}>Now</span>
          </>}
        </div>

        <div aria-hidden="true" className="relative mt-1 h-4 text-xs leading-4 tabular-nums text-neutral-600">
          {TICKS.filter((tick) => !compact || tick.at < 1).map((tick) => (
            <span
              key={tick.at}
              className={`absolute top-0 whitespace-nowrap ${tick.at === 0 ? '' : tick.at === 1 ? '-translate-x-full' : '-translate-x-1/2'}`}
              style={{ left: `${tick.at * 100}%` }}
            >
              {tick.label}
            </span>
          ))}
        </div>
      </div>
      {plainLanguage && readout}
    </div>
  );
}
