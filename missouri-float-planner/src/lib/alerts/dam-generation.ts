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
import { centralDayKey, nextDayKey, scheduledGeneration } from '@shared/dam-schedule-copy';
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

/**
 * How long after EDDY FETCHED a posted day that day may still raise an alert.
 *
 * Measured on the day's own `retrievedAt`, never on when the snapshot around
 * it was rebuilt. A rebuild can carry the previous sheet forward over failed
 * SWPA reads for up to six hours (carryForwardSchedule in data/dams.ts), each
 * day still wearing the time it was really fetched; trusting the rebuild time
 * let a five-hour-old sheet inside a five-minute-old snapshot send a push.
 *
 * Three hours, not the ninety minutes at which the dam screen starts calling a
 * schedule "may be outdated" (SCHEDULE_STALE_AFTER_MINUTES). The schedule is
 * fetched hourly and notices fall due on the hour, so a healthy sheet is
 * already 25 to 95 minutes old when one is due: at ninety minutes a single
 * failed read would drop that hour's alerts, and a missed alert is the worse
 * failure for someone relying on it. A posted sheet changed after first being
 * seen on 1 of 180 dam-days (ADR 0020), so one a couple of hours old is almost
 * always still right. Three hours rides out one or two failed reads.
 */
export const SCHEDULE_FRESH_FOR_MS = 3 * 60 * 60 * 1000;

/**
 * Was this posted day fetched recently enough to alert on?
 *
 * A day with no `retrievedAt` is NOT fresh. swpa.ts leaves it null when the
 * fetch time could not be established, and a sheet that cannot be dated cannot
 * be bounded.
 */
export function scheduleDayIsFresh(day: Pick<DamScheduleDay, 'retrievedAt'>, now: number): boolean {
  if (!day.retrievedAt) return false;
  const fetched = Date.parse(day.retrievedAt);
  if (!Number.isFinite(fetched)) return false;
  return now - fetched < SCHEDULE_FRESH_FOR_MS;
}

/** The Central calendar day a start falls on, as a schedule's `scheduleDate`. */
export function startDayKey(startAt: number): string {
  return centralDayKey(startAt);
}

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

/** What a dam's schedule says right now, from the days fresh enough to trust. */
export interface PostedSchedule {
  starts: PostedStart[];
  /** The Central days a fresh sheet is held for. A start on any other day is unconfirmed. */
  freshDays: ReadonlySet<string>;
}

/**
 * The posted starts from the days of a schedule that are fresh enough to
 * alert on (scheduleDayIsFresh), and which days those are.
 *
 * Stale days are dropped BEFORE starts are read, so a midnight start whose
 * previous day is stale is unknown rather than assumed, as when that day is
 * absent.
 */
export function freshPostedSchedule(schedule: readonly DamScheduleDay[], now: number): PostedSchedule {
  const fresh = schedule.filter((day) => scheduleDayIsFresh(day, now));
  return { starts: postedStarts(fresh), freshDays: new Set(fresh.map((day) => day.scheduleDate)) };
}

/**
 * Where a queued start stands against the schedule as it is known now.
 *
 * - `posted`: a fresh sheet for that day still has it. Send.
 * - `withdrawn`: a fresh sheet for that day no longer has it. Do not send.
 * - `unconfirmed`: no fresh sheet for that day — the snapshot is missing, or
 *   the sheet has aged past SCHEDULE_FRESH_FOR_MS since the notice was queued.
 *   Not sent on an old sheet, and not thrown away either: it waits, and goes
 *   out if a fresh sheet confirms it before its window closes.
 */
export type StartStanding = 'posted' | 'withdrawn' | 'unconfirmed';

export function startStanding(posted: PostedSchedule | undefined, startAt: number): StartStanding {
  if (!posted || !posted.freshDays.has(startDayKey(startAt))) return 'unconfirmed';
  return posted.starts.some((start) => start.startAt === startAt) ? 'posted' : 'withdrawn';
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

/**
 * An alert's two times after ONE switch moved: what was sent replaces what is
 * saved, and what was not sent keeps it.
 *
 * This is the rule /api/me/dam-alerts saves by, kept here so it is tested. The
 * app first sent both times from its own copy of the alert; before that copy
 * loaded both read off, so switching one time on cleared the other.
 */
export function mergeAlertTimes(
  saved: { atStart: boolean; hourBefore: boolean } | null,
  change: { atStart?: boolean; hourBefore?: boolean },
): { atStart: boolean; hourBefore: boolean } {
  return {
    atStart: change.atStart ?? saved?.atStart ?? false,
    hourBefore: change.hourBefore ?? saved?.hourBefore ?? false,
  };
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
 * How long a push may wait for a phone that is offline, in seconds: until the
 * end of its send window, and never less than a minute.
 *
 * Without it Apple holds an undelivered push for weeks, so a phone that came
 * back into signal that evening would be told generation starts "about an hour
 * from now" hours after it had. The server stops SENDING at the end of the
 * window; this stops the push ARRIVING after it.
 */
export function pushTtlSeconds(startAt: number, leadMinutes: number, now: number): number {
  const windowEnd = dueAt(startAt, leadMinutes) + SEND_WINDOW_MINUTES * MINUTE_MS;
  return Math.max(60, Math.round((windowEnd - now) / 1000));
}

/**
 * The push itself.
 *
 * ── The clock time leads ────────────────────────────────────────────────────
 * "3 PM Central: generation is posted to start at the dam." is true whenever
 * it is read. The wait comes after it, as its own short sentence, because a
 * push sits in Notification Center long after it arrives: someone opening it
 * at five must still be able to read off when the start was posted for.
 *
 * ── The wait is computed when the push is SENT ──────────────────────────────
 * A notice can go out up to SEND_WINDOW_MINUTES after it fell due. "About an
 * hour from now" on a push that left twenty-five minutes late would be wrong
 * by nearly half, and this is a sentence someone times getting out of the
 * water against. So the relative part is worked out from the clock at send,
 * and pushTtlSeconds keeps it from arriving after its window.
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
    body = `${time}: generation is posted to start at the dam. About an hour from now.`;
  } else if (minutesUntil >= 10) {
    body = `${time}: generation is posted to start at the dam. In about ${Math.round(minutesUntil / 5) * 5} minutes.`;
  } else if (minutesUntil > -10) {
    body = `${time}: generation is posted to start at the dam. That is now.`;
  } else {
    body = `${time}: generation was posted to start at the dam.`;
  }

  return { title: input.damName, body };
}
