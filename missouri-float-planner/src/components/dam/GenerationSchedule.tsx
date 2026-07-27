// src/components/dam/GenerationSchedule.tsx
// SWPA's hourly generation schedule for one dam — the part CWMS cannot give,
// and the reason this feature exists. Server component; the whole thing is
// static markup over read-through data.
//
// PRECISION DISCIPLINE, measured rather than assumed. Validated against CWMS
// turbine flow for Table Rock on 2026-07-27:
//   - idle hours are EXACT (0 MW scheduled matched ~20 cfs leakage every time)
//   - steady generation lands within ~10%
//   - RAMP hours ran -41% to +117% off, because units spin up partway through
//     the hour and CWMS reports an hourly average
// So the on/off PATTERN is stated plainly, cfs is always rounded with a "~",
// and a ramp hour shows NO number at all. Overstating what SWPA knows here
// would be telling someone it is safe to stand in a river.
//
// Hours are SWPA's own "hour ending" convention: hour 14 covers 1pm-2pm. Kept
// in the source's terms and rendered as ranges, because an off-by-one puts an
// angler in the water an hour early.

import { Clock } from 'lucide-react';
import type { DamScheduleDay } from '@/lib/data/dams';

/** "hour ending 14" → "1 PM". The hour the water actually starts moving. */
function hourEndingLabel(hourEnding: number): string {
  const startHour = (hourEnding - 1) % 24;
  const suffix = startHour < 12 ? 'AM' : 'PM';
  const display = startHour % 12 === 0 ? 12 : startHour % 12;
  return `${display} ${suffix}`;
}

/** A window given as hour-ending bounds → "midnight – 6 AM". */
function windowLabel(from: number, to: number): string {
  const start = hourEndingLabel(from);
  const end = hourEndingLabel(to + 1);
  return `${start === '12 AM' ? 'midnight' : start} – ${end === '12 AM' ? 'midnight' : end}`;
}

function dayLabel(iso: string): string {
  // Parsed as a plain calendar date; SWPA schedules are Central-time days and
  // must not be shifted by the viewer's timezone.
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

function DayRow({ day }: { day: DamScheduleDay }) {
  const peak = day.hours.reduce((max, h) => (h.megawatts > max ? h.megawatts : max), 0);
  const generatingHours = day.hours.filter((h) => h.megawatts > 0).length;

  return (
    <div className="border-t border-neutral-200 py-4 first:border-t-0 first:pt-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-bold text-neutral-900">{dayLabel(day.scheduleDate)}</h3>
        <span className="text-xs text-neutral-500">
          {generatingHours === 0
            ? 'no generation scheduled'
            : `${generatingHours} of 24 hours generating`}
        </span>
      </div>

      {/* 24 blocks, one per hour-ending. Height encodes load; colour encodes
          only on/off, because on/off is the part that measured exact. */}
      <div className="mt-2 flex h-10 items-end gap-px" aria-hidden="true">
        {day.hours.map((h) => {
          const share = peak > 0 ? h.megawatts / peak : 0;
          return (
            <div
              key={h.hourEnding}
              className={
                h.megawatts > 0
                  ? 'flex-1 rounded-sm bg-accent-500'
                  : 'flex-1 rounded-sm bg-neutral-200'
              }
              style={{ height: `${Math.max(share * 100, 12)}%` }}
            />
          );
        })}
      </div>
      <div className="mt-1 flex justify-between text-[10px] text-neutral-400">
        <span>midnight</span>
        <span>noon</span>
        <span>midnight</span>
      </div>

      {day.idle.length > 0 ? (
        <p className="mt-2 text-sm text-neutral-700">
          <span className="font-medium">Water off:</span>{' '}
          {day.idle.map((w) => windowLabel(w.from, w.to)).join(', ')}
        </p>
      ) : (
        <p className="mt-2 text-sm text-neutral-700">
          <span className="font-medium">Generating every hour</span> — no break in the
          schedule.
        </p>
      )}

      {/* Magnitude, only where the estimate is meaningful: steady hours with a
          real load. Ramp hours are excluded by isRamp. */}
      {(() => {
        const steady = day.hours.filter((h) => !h.isRamp && h.cfs !== null);
        if (steady.length === 0) return null;
        const low = Math.min(...steady.map((h) => h.cfs!));
        const high = Math.max(...steady.map((h) => h.cfs!));
        return (
          <p className="mt-1 text-xs text-neutral-500">
            When running, roughly{' '}
            {low === high
              ? `${low.toLocaleString()} cfs`
              : `${low.toLocaleString()}–${high.toLocaleString()} cfs`}
            {' '}(estimated from scheduled megawatts)
          </p>
        );
      })()}
    </div>
  );
}

export default function GenerationSchedule({ schedule }: { schedule: DamScheduleDay[] }) {
  if (schedule.length === 0) return null;

  return (
    <section className="rounded-xl border-2 border-neutral-300 bg-white p-5">
      <div className="flex items-center gap-2">
        <Clock className="h-4 w-4 text-primary-700" />
        <h2
          className="text-lg font-bold text-neutral-900"
          style={{ fontFamily: 'var(--font-display)' }}
        >
          Generation schedule
        </h2>
      </div>
      <p className="mt-1 text-sm text-neutral-600">
        Posted each afternoon by Southwestern Power Administration, in
        &ldquo;hour ending&rdquo; terms.
      </p>

      <div className="mt-4">
        {schedule.map((day) => (
          <DayRow key={day.scheduleDate} day={day} />
        ))}
      </div>

      <p className="mt-4 border-t border-neutral-200 pt-3 text-xs text-neutral-500">
        Schedules can change without notice — power demand, transmission
        constraints, generator outages and inflow all move them. Never wade or
        anchor below a dam without checking the horn and posted warnings.
      </p>
    </section>
  );
}
