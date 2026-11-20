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
 * back into signal that evening would be buzzed about a 3 PM start long past.
 * The server stops SENDING at the end of the window; this stops the push
 * ARRIVING after it. Inside the window a push can still arrive late, which is
 * why its wording carries no countdown — see buildDamGenerationNotification.
 */
export function pushTtlSeconds(startAt: number, leadMinutes: number, now: number): number {
  const windowEnd = dueAt(startAt, leadMinutes) + SEND_WINDOW_MINUTES * MINUTE_MS;
  return Math.max(60, Math.round((windowEnd - now) / 1000));
}

/**
 * The push itself: the dam, and one sentence.
 *
 * ── Why there is no "about an hour from now" ────────────────────────────────
 * There was, twice. First worked out from the lead time, then from the clock
 * when the push was SENT. Both were wrong for the same reason: a push is read
 * when it ARRIVES, or later. One sent at 2:00 for a 3 PM start may be delivered
 * at 2:25 — still inside its window, so pushTtlSeconds lets it through — and
 * then says "about an hour" with thirty-five minutes left. That is the wrong
 * direction to be wrong in: it is the sentence someone times getting out of the
 * water against.
 *
 * A clock time cannot go stale. "The posted schedule has generation starting
 * at 3 PM Central at the dam." is true when it is sent, when it arrives, and
 * when it is opened from Notification Center that evening. The phone's own
 * timestamp says when it came in. So the "hour before" push and the "at the
 * start" push read the same, by design: each states the one fact, and neither
 * makes a claim about how long is left that delivery could falsify.
 *
 * ── It reports the sheet, even when it is sent after the start ──────────────
 * The "at the start" push is always sent at or after the posted time (up to
 * SEND_WINDOW_MINUTES late), and a sheet that reaches Eddy after midnight can
 * be the first sign of a 12 AM start. All a late sheet establishes is what was
 * POSTED for that hour, never that generation began. So the sentence is about
 * the schedule ("the posted schedule has…"), not the dam: nothing in it says
 * generation started, is running, or is starting now. It used to read "3 PM
 * Central: generation is posted to start at the dam.", which said "posted" but
 * still read as an announcement of the start when it arrived after it.
 *
 * ── Every word names the place and the source ───────────────────────────────
 * "Posted" because this reads a schedule and has not looked at the powerhouse;
 * "at the dam" because the water reaches an access downstream later, and
 * nothing here knows how much later; "Central" because the schedule is in the
 * dam's zone and the phone may not be.
 */
export function buildDamGenerationNotification(input: {
  damName: string;
  startAt: number;
}): { title: string; body: string } {
  return {
    title: input.damName,
    body: `The posted schedule has generation starting at ${startTimeLabel(input.startAt)} Central at the dam.`,
  };
}
