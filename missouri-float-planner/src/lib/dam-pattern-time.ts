import type { PatternRow } from '@shared/dam-generation';
import { centralClock } from '@shared/dam-schedule-copy';

export const PATTERN_TIME_TICKS = [
  { hour: 0, label: '12 AM', position: 0 },
  { hour: 6, label: '6 AM', position: 0.25 },
  { hour: 12, label: 'Noon', position: 0.5 },
  { hour: 18, label: '6 PM', position: 0.75 },
  { hour: 24, label: '12 AM', position: 1 },
];

const centralHour = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago', hour: 'numeric', hourCycle: 'h23',
});

/** Observed cells use real hours; the upcoming half uses posted wall-clock hours. */
export function patternTimeTicks(row: PatternRow, startUtc: string | undefined, now: number) {
  if (!row.cells.length) return PATTERN_TIME_TICKS;
  const start = startUtc ? Date.parse(startUtc) : NaN;
  const wallSplit = Math.floor(centralClock(now).hoursElapsed);
  const hours = row.cells.map((_, index) => {
    if (row.today && row.splitIndex !== null && index >= row.splitIndex) {
      return wallSplit + index - row.splitIndex;
    }
    return Number.isFinite(start) ? Number(centralHour.format(start + index * 3_600_000)) : index;
  });
  return PATTERN_TIME_TICKS.map(tick => {
    if (tick.hour === 0 || tick.hour === 24) return tick;
    const index = hours.indexOf(tick.hour);
    return index < 0 ? tick : { ...tick, position: index / row.cells.length };
  });
}
