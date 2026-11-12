import type { DamSnapshot } from './dam-types';
import { damWidgetScheduleDay } from './dam-widget';
import { scheduleIsStale } from './dam-schedule-copy';

export const DAM_SCHEDULE_IMAGE_SIZE = { width: 1200, height: 800 };

export function validScheduleDate(date: string): boolean {
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
}

/** Explicit calendar dates survive forwarding and never depend on the viewer's zone. */
export function scheduleShareDate(date: string): string {
  return new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', {
    timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric',
  });
}

export function damSchedulePath(damId: string, date: string): string {
  return `/dams/${encodeURIComponent(damId)}/schedule/${encodeURIComponent(date)}`;
}

export function damScheduleImagePath(damId: string, date: string): string {
  return `${damSchedulePath(damId, date)}/image.png`;
}

export function damScheduleFileName(damId: string, date: string): string {
  return `eddy-${damId}-${date}-schedule`;
}

export function damScheduleTitle(name: string, date: string): string {
  return `${name} · ${scheduleShareDate(date)} generation schedule`;
}

export function shareableScheduleDates(schedule: DamSnapshot['schedule']): string[] {
  return schedule.filter(day => validScheduleDate(day.scheduleDate)
    && schedule.filter(other => other.scheduleDate === day.scheduleDate).length === 1
    && damWidgetScheduleDay(day).hours.some(hour => hour.megawatts !== null))
    .map(day => day.scheduleDate).sort().slice(0, 7);
}

export function damScheduleShare(dam: DamSnapshot, date: string, now: number) {
  if (!validScheduleDate(date)) return null;
  const days = dam.schedule.filter(day => day.scheduleDate === date);
  if (days.length !== 1) return null;
  const source = days[0];
  const day = damWidgetScheduleDay(source, dam.generationReference);
  if (!day.hours.some(hour => hour.megawatts !== null)) return null;
  const checkedAt = source.retrievedAt ? Date.parse(source.retrievedAt) : NaN;
  const knownCheck = Number.isFinite(checkedAt) && checkedAt <= now + 300_000;
  const checked = knownCheck ? new Date(checkedAt).toLocaleString('en-US', {
    timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  }) : null;
  const missing = day.hours.filter(hour => hour.megawatts === null).length;
  const generating = day.hours.some(hour => (hour.megawatts ?? 0) > 0 && !hour.minimumFlow);
  const minimumFlow = day.hours.some(hour => hour.minimumFlow);
  return {
    damId: dam.id, name: dam.name, location: [dam.lakeName, dam.state].filter(Boolean).join(' · '),
    date, dateLabel: scheduleShareDate(date), day,
    checked: checked ? `Schedule checked ${checked}` : 'Schedule check time unavailable',
    warning: !knownCheck ? 'Check the latest schedule before you go.'
      : scheduleIsStale(source.retrievedAt, now) ? 'This schedule may have changed. Check the latest before you go.' : null,
    summary: day.summary ?? (missing ? 'Some hours unavailable' : minimumFlow ? 'Minimum flow only' : 'No generation scheduled'),
    missing, generating, minimumFlow,
    source: 'Southwestern Power Administration',
    imagePath: damScheduleImagePath(dam.id, date),
    pagePath: damSchedulePath(dam.id, date),
    livePath: `/dams/${dam.id}#generation`,
  };
}

export type DamScheduleShare = NonNullable<ReturnType<typeof damScheduleShare>>;
