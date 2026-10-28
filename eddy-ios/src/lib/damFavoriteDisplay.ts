import type { DamSnapshot } from '@eddy/types';
import { damWidgetSnapshot } from '@eddy/conditions/dam-widget';
import { relativeAge } from '@eddy/conditions/dam-schedule-copy';

/** Favorites uses the WidgetKit packet's validation, clock and schedule rules. */
export function damFavoriteDisplay(dam: DamSnapshot, now: number) {
  const packet = damWidgetSnapshot(dam, now);
  const moment = packet.entries[0];
  const schedule = moment.scheduleCurrent
    ? packet.scheduleDays.find(day => day.date === moment.scheduleDate) ?? null
    : null;
  const peak = schedule?.hours.reduce((max, hour) => Math.max(max, hour.megawatts ?? 0), 0) ?? 0;
  const status = !dam.hasTurbines ? 'No powerhouse'
    : !moment.current ? (moment.turbineCfs === null ? 'Unavailable' : 'Older reading')
    : moment.generationKind === 'generating' ? 'Generating' : 'No generation';
  const scheduleNotice = moment.scheduleCurrent ? 'Not posted today'
    : moment.scheduleCheckedAt === null ? 'Not posted' : 'Check schedule';
  const observedAge = moment.observedAt === null ? null
    : relativeAge(new Date(moment.observedAt).toISOString(), now);
  const scheduleDescription = schedule
    ? `Today's posted schedule, Central time, subject to change. ${schedule.hours.map(hour =>
      `${hour.label}: ${hour.megawatts === null ? 'unavailable' : `${hour.megawatts} megawatts`}${hour.hourEnding === moment.scheduleHour ? ', current hour' : ''}`
    ).join('; ')}`
    : `Today's schedule, Central time: ${scheduleNotice}`;
  return { moment, schedule, peak, status, scheduleNotice, observedAge, scheduleDescription };
}
