// src/lib/alerts/dam-generation.ts
// Dam generation alerts: which posted starts exist, which notices are due, and
// what a notice says. Pure and I/O-free, like fanout.ts and gate.ts beside it:
// dam-generation-delivery.ts does the querying and sending, this owns every
// decision, so the rules can be tested without a database or a network.
//
// ── What this alert is, and is not ──────────────────────────────────────────
//
// It reads the POSTED SCHEDULE (SWPA's hourly sheet, as the dam snapshot
// serves it) and tells someone when generation is posted to start: at the
// posted time, an hour before it, or both. It does not confirm that generation
// began. Measured turbine flow reaches Eddy one to three hours after the fact
// (ADR 0020 has the measurement), so an alert built on it would arrive after
// the water did. Every sentence here therefore says "posted", and every time
// is at the dam — nothing estimates when water reaches an access downstream
// (ADR 0017, "Not decided here").

import { centralWallClockToUtc } from '@/lib/ameren/osage';
import { nextDayKey, scheduledGeneration } from '@shared/dam-schedule-copy';
import type { DamScheduleDay, ScheduledHour } from '@shared/dam-types';

/** The two times a posted start can be announced: at it, or an hour ahead. */
export const LEAD_MINUTES = [0, 60] as const;
export type LeadMinutes = (typeof LEAD_MINUTES)[number];

/**
 * How long after a notice falls due it may still be sent.
 *
 * The delivery cron runs every five minutes, so this is slack for a missed or
 * failed pass, not a schedule. Half an hour keeps an "hour before" notice at
 * least thirty minutes ahead of the start it announces; past that the notice
 * is dropped rather than sent late, because its whole value is the head start.
 */
export const SEND_WINDOW_MINUTES = 30;

const MINUTE_MS = 60_000;

/** Stored on the delivery ledger and sent as the push's `kind`. */
export const DAM_GENERATION_KIND = 'generation_start';

/** One posted start: generation scheduled for an hour that follows an hour without it. */
export interface PostedStart {
  /** The posted start at the dam, epoch ms. */
  startAt: number;
  /** The Central day and SWPA hour-ending it was read from. */
  scheduleDate: string;
  hourEnding: number;
}

function hourOf(day: DamScheduleDay, hourEnding: number): ScheduledHour | null {
  return day.hours.find((hour) => hour.hourEnding === hourEnding) ?? null;
}

/**
 * Every posted start in a schedule, oldest first.
 *
 * ── What counts as a start ──────────────────────────────────────────────────
 * An hour with generation scheduled whose PREVIOUS hour is known and has none.
 * Every hour is tested through scheduledGeneration(), never `megawatts > 0`:
 * Bull Shoals passes its minimum flow through a turbine, so SWPA posts a few
 * megawatts in every hour of a quiet day, and the raw test would read each of
 * them as generation.
 *
 * ── The first hour of a day ─────────────────────────────────────────────────
 * Hour ending 1 (midnight to 1 AM) follows the previous day's hour ending 24.
 * It is a start only when that day is in the same schedule and its last hour
 * is quiet. When the previous day is absent the answer is unknown, and unknown
 * is not a start: generation that ran through midnight would otherwise be
 * announced as beginning at midnight, every night it carried over.
 *
 * ── Fails closed on the clock ───────────────────────────────────────────────
 * A start whose Central hour does not exist (2 AM on the spring-forward day)
 * is left out rather than guessed; the repeated fall-back hour takes its
 * earlier instant. Both come from centralWallClockToUtc.
 */
export function postedStarts(schedule: readonly DamScheduleDay[]): PostedStart[] {
  const byDate = new Map<string, DamScheduleDay>();
  for (const day of schedule) byDate.set(day.scheduleDate, day);

  const starts: PostedStart[] = [];
  for (const day of byDate.values()) {
    for (const hour of day.hours) {
      if (!Number.isInteger(hour.hourEnding) || hour.hourEnding < 1 || hour.hourEnding > 24) continue;
      if (!scheduledGeneration(hour)) continue;

      let previous: ScheduledHour | null;
      if (hour.hourEnding > 1) {
        previous = hourOf(day, hour.hourEnding - 1);
      } else {
        const dayBefore = [...byDate.values()].find((other) => nextDayKey(other.scheduleDate) === day.scheduleDate);
        previous = dayBefore ? hourOf(dayBefore, 24) : null;
      }
      if (!previous || scheduledGeneration(previous)) continue;

      const startAt = centralWallClockToUtc(
        `${day.scheduleDate}T${String(hour.hourEnding - 1).padStart(2, '0')}:00:00`,
      );
      if (startAt === null) continue;
      starts.push({ startAt, scheduleDate: day.scheduleDate, hourEnding: hour.hourEnding });
    }
  }
  return starts.sort((a, b) => a.startAt - b.startAt);
}

/** A dam_generation_alerts row, as the delivery pass reads it. */
export interface DamAlertRow {
  id: string;
  user_id: string;
  dam_id: string;
  notify_at_start: boolean;
  notify_hour_before: boolean;
}

/** Which lead times an alert asks for. */
export function leadsOf(alert: Pick<DamAlertRow, 'notify_at_start' | 'notify_hour_before'>): LeadMinutes[] {
  const leads: LeadMinutes[] = [];
  if (alert.notify_hour_before) leads.push(60);
  if (alert.notify_at_start) leads.push(0);
  return leads;
}

/** A notice to queue: one alert, one posted start, one lead time. */
export interface DueNotice {
  alertId: string;
  userId: string;
  damId: string;
  /** ISO instant of the posted start. */
  startAt: string;
  leadMinutes: LeadMinutes;
}

/** When a notice falls due: the posted start, less its lead. */
export function dueAt(startAt: number, leadMinutes: number): number {
  return startAt - leadMinutes * MINUTE_MS;
}

/** Is a notice inside the window it may be sent in? */
export function inSendWindow(startAt: number, leadMinutes: number, now: number): boolean {
  const due = dueAt(startAt, leadMinutes);
  return now >= due && now < due + SEND_WINDOW_MINUTES * MINUTE_MS;
}

/**
 * The notices due right now, for every alert whose dam has a posted start.
 *
 * Re-derived from scratch on every pass. The same notice comes back for as
 * long as it is inside its window; the outbox's unique constraint is what
 * makes queueing it again a no-op.
 *
 * An alert created inside a window gets that notice at once: switching on
 * "an hour before" forty minutes ahead of a start is told about that start.
 */
export function dueNotices(
  alerts: readonly DamAlertRow[],
  startsByDam: ReadonlyMap<string, readonly PostedStart[]>,
  now: number,
): DueNotice[] {
  const due: DueNotice[] = [];
  for (const alert of alerts) {
    const starts = startsByDam.get(alert.dam_id);
    if (!starts) continue;
    for (const lead of leadsOf(alert)) {
      for (const start of starts) {
        if (!inSendWindow(start.startAt, lead, now)) continue;
        due.push({
          alertId: alert.id,
          userId: alert.user_id,
          damId: alert.dam_id,
          startAt: new Date(start.startAt).toISOString(),
          leadMinutes: lead,
        });
      }
    }
  }
  return due;
}

/** "3 PM" at the dam. Schedules are hourly, so minutes are never shown. */
export function startTimeLabel(startAt: number): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    hour: 'numeric',
    hour12: true,
  }).format(new Date(startAt));
}

/**
 * The push itself.
 *
 * ── The wait is computed when the push is SENT ──────────────────────────────
 * A notice can go out up to SEND_WINDOW_MINUTES after it fell due. "About an
 * hour from now" on a push that left twenty-five minutes late would be wrong
 * by nearly half, and this is a sentence someone times getting out of the
 * water against. So the relative part is worked out from the clock at send.
 *
 * ── Every sentence names the place and the source ───────────────────────────
 * "Posted" because this reads a schedule and has not looked at the powerhouse;
 * "at the dam" because the water reaches an access downstream later, and
 * nothing here knows how much later; "Central" because the schedule is in the
 * dam's zone and the phone may not be.
 */
export function buildDamGenerationNotification(input: {
  damName: string;
  startAt: number;
  leadMinutes: LeadMinutes;
  now: number;
}): { title: string; body: string } {
  const time = `${startTimeLabel(input.startAt)} Central`;
  const minutesUntil = Math.round((input.startAt - input.now) / MINUTE_MS);

  let body: string;
  if (minutesUntil >= 50) {
    body = `Generation is posted to start at the dam at ${time}, about an hour from now.`;
  } else if (minutesUntil >= 10) {
    body = `Generation is posted to start at the dam at ${time}, in about ${Math.round(minutesUntil / 5) * 5} minutes.`;
  } else if (minutesUntil > -10) {
    body = `Generation is posted to start at the dam now, at ${time}.`;
  } else {
    body = `Generation was posted to start at the dam at ${time}.`;
  }

  return { title: input.damName, body };
}
