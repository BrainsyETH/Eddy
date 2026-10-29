import type { DamSnapshot } from '@eddy/types';
import { damWidgetSnapshot } from '@eddy/conditions/dam-widget';
import { relativeAge } from '@eddy/conditions/dam-schedule-copy';

type PacketHour = { megawatts: number | null; minimumFlow?: boolean };

/**
 * A posted hour that is scheduled generation: published load above zero and
 * not the minimum-flow release. Bull Shoals runs a unit at low output for its
 * minimum flow; that hour is "Minimum flow", never a generation bar, and never
 * "no generation". The same rule as the dam screen's `scheduledGeneration`.
 */
export function packetHourGenerating(hour: PacketHour): boolean {
  return hour.megawatts !== null && hour.megawatts > 0 && hour.minimumFlow !== true;
}

/** Favorites reuses the widget's validated hours and clocked observations. */
export function damFavoriteDisplay(dam: DamSnapshot, now: number) {
  const packet = damWidgetSnapshot(dam, now);
  const moment = packet.entries[0];
  // Retrieval age governs next-change predictions, not whether a posted daily
  // chart can be read. Keep today's bars, even offline, but never relabel a
  // previous or upcoming Central-time day as today.
  const schedule = packet.scheduleDays.find(day => day.date === moment.scheduleDate) ?? null;
  // The chart's scale and caption are scheduled generation only: a
  // minimum-flow day's ~7 MW must not become a full-height "peak".
  const peak = schedule?.hours.reduce((max, hour) =>
    packetHourGenerating(hour) ? Math.max(max, hour.megawatts ?? 0) : max, 0) ?? 0;
  const minimumFlowOnly = Boolean(schedule && peak === 0
    && schedule.hours.some((hour: PacketHour) => hour.minimumFlow === true));
  const scheduleCaption = !schedule?.hours.some(hour => hour.megawatts !== null) ? null
    : minimumFlowOnly ? 'Minimum flow' : `${Math.round(peak).toLocaleString()} MW`;
  const status = !dam.hasTurbines ? 'No powerhouse'
    : !moment.current ? (moment.turbineCfs === null ? 'Unavailable' : 'Older reading')
    : moment.generationKind === 'generating' ? 'Generating'
    : moment.minimumFlow ? 'Minimum flow' : 'No generation';
  const scheduleNotice = packet.scheduleDays.length ? 'Not posted today' : 'Not posted';
  const observedAge = moment.observedAt === null ? null
    : relativeAge(new Date(moment.observedAt).toISOString(), now);
  const scheduleDescription = schedule
    ? `Today's posted schedule, Central time. ${schedule.hours.map((hour: PacketHour & { label: string; hourEnding: number }) =>
      `${hour.label}: ${hour.megawatts === null ? 'unavailable'
        : hour.minimumFlow === true ? 'minimum flow' : `${hour.megawatts} megawatts`}${hour.hourEnding === moment.scheduleHour ? ', current hour' : ''}`
    ).join('; ')}`
    : `Today's schedule, Central time: ${scheduleNotice}`;
  return { moment, schedule, peak, scheduleCaption, status, scheduleNotice, observedAge, scheduleDescription };
}
