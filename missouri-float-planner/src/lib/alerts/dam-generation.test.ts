// Dam generation alerts: which posted starts exist, which notices are due,
// what a notice says, and that the delivery pass sends each one exactly once.
// See ADR 0020 and the headers of dam-generation.ts / dam-generation-delivery.ts.

import assert from 'node:assert/strict';
import test from 'node:test';
import { FakeOutboxDb } from './fake-outbox-db';
import {
  buildDamGenerationNotification,
  dueNotices,
  freshPostedSchedule,
  postedStarts,
  pushTtlSeconds,
  scheduleDayIsFresh,
  startStanding,
  startTimeLabel,
  type DamAlertRow,
} from './dam-generation';
import { deliverDamGenerationAlerts } from './dam-generation-delivery';
import type { ExpoMessage, ExpoTicket } from '@/lib/push/expo';
import type { DamScheduleDay } from '@shared/dam-types';

const DAM = 'swl-table-rock-dam';
const MINUTE = 60_000;

/**
 * A schedule day generating in the given hour-endings; `floor` marks every
 * other hour minimum flow. `retrievedAt` is when Eddy fetched the sheet, which
 * is what freshness is measured on.
 */
function day(
  scheduleDate: string,
  generating: number[],
  options: { floor?: boolean; retrievedAt?: string | null } = {},
): DamScheduleDay {
  return {
    scheduleDate,
    hours: Array.from({ length: 24 }, (_, i) => {
      const hourEnding = i + 1;
      const on = generating.includes(hourEnding);
      return {
        hourEnding,
        megawatts: on ? 100 : options.floor ? 5 : 0,
        cfs: on ? 6_500 : null,
        isRamp: false,
        ...(options.floor && !on ? { minimumFlow: true } : {}),
      };
    }),
    idle: [],
    retrievedAt: options.retrievedAt === undefined ? '2026-07-25T18:35:00.000Z' : options.retrievedAt,
  };
}

const iso = (ms: number) => new Date(ms).toISOString();

// July is CDT (UTC-5): hour ending 16 runs 3 PM-4 PM, so it starts at 20:00Z.
const AFTERNOON = [16, 17, 18, 19, 20, 21];
const START_3PM = Date.parse('2026-07-25T20:00:00.000Z');

// ── Posted starts ────────────────────────────────────────────────────────────

test('a posted start is the first generating hour after a quiet one, at the hour it begins', () => {
  const starts = postedStarts([day('2026-07-25', AFTERNOON)]);
  assert.deepEqual(starts.map((s) => iso(s.startAt)), ['2026-07-25T20:00:00.000Z']);
  assert.equal(starts[0].hourEnding, 16);
  assert.equal(startTimeLabel(starts[0].startAt), '3 PM');
});

test('every posted start in a day is found, not only the first', () => {
  const starts = postedStarts([day('2026-07-25', [8, 9, 10, ...AFTERNOON])]);
  assert.deepEqual(starts.map((s) => iso(s.startAt)), ['2026-07-25T12:00:00.000Z', '2026-07-25T20:00:00.000Z']);
});

test('minimum-flow hours are not generation, so they neither start nor hide a start', () => {
  // Bull Shoals: a few megawatts posted in every hour of an otherwise quiet day.
  assert.deepEqual(postedStarts([day('2026-07-25', [], { floor: true })]), []);
  const starts = postedStarts([day('2026-07-25', AFTERNOON, { floor: true })]);
  assert.deepEqual(starts.map((s) => s.hourEnding), [16]);
});

test('generation in the first hour is a start only when the day before is known and ended quiet', () => {
  // Alone: the hour before midnight is unknown, and unknown is not a start.
  assert.deepEqual(postedStarts([day('2026-07-25', [1, 2])]), []);
  // Carried through midnight: not a start.
  assert.deepEqual(postedStarts([day('2026-07-24', [23, 24]), day('2026-07-25', [1, 2])]).map((s) => s.hourEnding), [23]);
  // Quiet before midnight: a start at midnight Central (05:00Z in July).
  const starts = postedStarts([day('2026-07-24', []), day('2026-07-25', [1, 2])]);
  assert.deepEqual(starts.map((s) => iso(s.startAt)), ['2026-07-25T05:00:00.000Z']);
  // A gap between the days is not "the day before".
  assert.deepEqual(postedStarts([day('2026-07-23', []), day('2026-07-25', [1, 2])]), []);
});

test('a start in an hour the clock skips is left out, and the repeated hour takes its earlier instant', () => {
  // 2026-03-08: 2 AM Central does not exist.
  assert.deepEqual(postedStarts([day('2026-03-08', [3, 4])]), []);
  // 2026-11-01: 1 AM happens twice; the first is 1 AM CDT, 06:00Z.
  const starts = postedStarts([day('2026-11-01', [2, 3])]);
  assert.deepEqual(starts.map((s) => iso(s.startAt)), ['2026-11-01T06:00:00.000Z']);
});

// ── Due notices ──────────────────────────────────────────────────────────────

const ALERT: DamAlertRow = { id: 'a1', user_id: 'u1', dam_id: DAM, notify_at_start: true, notify_hour_before: true };
const STARTS = new Map([[DAM, postedStarts([day('2026-07-25', AFTERNOON)])]]);
const leadsDueAt = (alert: DamAlertRow, at: string) =>
  dueNotices([alert], STARTS, Date.parse(at)).map((n) => n.leadMinutes);

test('each notice is due from its time for half an hour, and not before', () => {
  assert.deepEqual(leadsDueAt(ALERT, '2026-07-25T18:59:00.000Z'), []);
  assert.deepEqual(leadsDueAt(ALERT, '2026-07-25T19:00:00.000Z'), [60]);
  assert.deepEqual(leadsDueAt(ALERT, '2026-07-25T19:29:00.000Z'), [60]);
  assert.deepEqual(leadsDueAt(ALERT, '2026-07-25T19:30:00.000Z'), []);
  assert.deepEqual(leadsDueAt(ALERT, '2026-07-25T20:00:00.000Z'), [0]);
  assert.deepEqual(leadsDueAt(ALERT, '2026-07-25T20:30:00.000Z'), []);
});

test('an alert is only told at the times it asked for', () => {
  const atStartOnly = { ...ALERT, notify_hour_before: false };
  const hourBeforeOnly = { ...ALERT, notify_at_start: false };
  assert.deepEqual(leadsDueAt(atStartOnly, '2026-07-25T19:00:00.000Z'), []);
  assert.deepEqual(leadsDueAt(atStartOnly, '2026-07-25T20:00:00.000Z'), [0]);
  assert.deepEqual(leadsDueAt(hourBeforeOnly, '2026-07-25T19:00:00.000Z'), [60]);
  assert.deepEqual(leadsDueAt(hourBeforeOnly, '2026-07-25T20:00:00.000Z'), []);
});

test('a dam with no known schedule this pass has nothing due', () => {
  assert.deepEqual(dueNotices([{ ...ALERT, dam_id: 'swl-norfork-dam' }], STARTS, START_3PM), []);
});

// ── Copy ─────────────────────────────────────────────────────────────────────

test('the push is the dam and one sentence, with no countdown to go stale', () => {
  const { title, body } = buildDamGenerationNotification({ damName: 'Table Rock Dam', startAt: START_3PM });
  assert.equal(title, 'Table Rock Dam');
  assert.equal(body, '3 PM Central: generation is posted to start at the dam.');
  // Nothing relative: a push sent at 2:00 can arrive at 2:25, or be read at 5.
  assert.doesNotMatch(body, /\bnow\b|from now|minutes|hour|ago|soon|shortly/i);
  // And nothing that claims generation began.
  assert.doesNotMatch(body, /has started|is running|generating|units|water (is )?(on|off)/i);
});

test('the time is the dam\u2019s, whatever the season', () => {
  // 3 PM CDT in July and 3 PM CST in January are different instants, one label.
  assert.equal(buildDamGenerationNotification({ damName: 'D', startAt: Date.parse('2026-01-15T21:00:00.000Z') }).body,
    '3 PM Central: generation is posted to start at the dam.');
  assert.equal(buildDamGenerationNotification({ damName: 'D', startAt: Date.parse('2026-07-25T05:00:00.000Z') }).body,
    '12 AM Central: generation is posted to start at the dam.');
});

test('a push expires with its send window, so an offline phone is not told late', () => {
  // Hour-before, sent on time: the window closes 30 minutes later.
  assert.equal(pushTtlSeconds(START_3PM, 60, START_3PM - 60 * MINUTE), 30 * 60);
  // Sent 25 minutes into the window: five minutes left.
  assert.equal(pushTtlSeconds(START_3PM, 60, START_3PM - 35 * MINUTE), 5 * 60);
  assert.equal(pushTtlSeconds(START_3PM, 0, START_3PM), 30 * 60);
  // Never zero or negative, which a push service would read as "keep it".
  assert.equal(pushTtlSeconds(START_3PM, 0, START_3PM + 30 * MINUTE), 60);
});

// ── Freshness: by the sheet's own fetch time ─────────────────────────────────

test('a posted day is fresh for three hours after Eddy fetched it, and never when undated', () => {
  const now = Date.parse('2026-07-25T19:00:00.000Z');
  assert.equal(scheduleDayIsFresh({ retrievedAt: '2026-07-25T16:00:01.000Z' }, now), true);
  assert.equal(scheduleDayIsFresh({ retrievedAt: '2026-07-25T16:00:00.000Z' }, now), false);
  // One failed hourly read (a sheet about two hours old) still alerts.
  assert.equal(scheduleDayIsFresh({ retrievedAt: '2026-07-25T17:05:00.000Z' }, now), true);
  assert.equal(scheduleDayIsFresh({ retrievedAt: null }, now), false);
  assert.equal(scheduleDayIsFresh({ retrievedAt: 'not a date' }, now), false);
});

test('a queued start is posted, withdrawn or unconfirmed against the schedule known now', () => {
  const now = Date.parse('2026-07-25T19:05:00.000Z');
  const fresh = freshPostedSchedule([day('2026-07-25', AFTERNOON)], now);
  assert.equal(startStanding(fresh, START_3PM), 'posted');
  // A fresh sheet for that day without the start: it was withdrawn.
  assert.equal(startStanding(freshPostedSchedule([day('2026-07-25', [])], now), START_3PM), 'withdrawn');
  // The sheet is too old to say, the day is not held, or there is no snapshot.
  const old = freshPostedSchedule([day('2026-07-25', AFTERNOON, { retrievedAt: '2026-07-25T14:00:00.000Z' })], now);
  assert.equal(startStanding(old, START_3PM), 'unconfirmed');
  assert.equal(startStanding(freshPostedSchedule([day('2026-07-26', AFTERNOON)], now), START_3PM), 'unconfirmed');
  assert.equal(startStanding(undefined, START_3PM), 'unconfirmed');
});

// ── The delivery pass ────────────────────────────────────────────────────────

function transport(failing: Set<string> = new Set()) {
  const messages: ExpoMessage[] = [];
  const send = async (batch: ExpoMessage[]): Promise<ExpoTicket[]> =>
    batch.map((m) => {
      if (failing.has(String(m.to))) {
        return { status: 'error', message: 'injected', details: { error: 'MessageRateExceeded' } } as ExpoTicket;
      }
      messages.push(m);
      return { status: 'ok', id: `ticket-${messages.length}` } as ExpoTicket;
    });
  return { send, messages, failing };
}

function world(alert: Partial<DamAlertRow> = {}, schedule: DamScheduleDay[] = [day('2026-07-25', AFTERNOON)]) {
  return new FakeOutboxDb('2026-07-25T19:00:00.000Z')
    .seed('dam_generation_alerts', [{ ...ALERT, ...alert }])
    .seed('dam_snapshots', [{ dam_id: DAM, built_at: '2026-07-25T18:35:00.000Z', schedule }])
    .seed('device_tokens', [
      { id: 'tok-1', user_id: 'u1', expo_push_token: 'ExponentPushToken[u1]', disabled_at: null, failure_count: 0 },
    ]);
}

const run = (db: FakeOutboxDb, at: string, t: ReturnType<typeof transport>) =>
  deliverDamGenerationAlerts(db, new Date(at), { send: t.send, pauseMs: 0 });

const events = (db: FakeOutboxDb) => db.rows('dam_generation_alert_events') as Array<Record<string, unknown>>;

test('one push an hour before and one at the posted time, each sent once across many passes', async () => {
  const db = world();
  const t = transport();

  await run(db, '2026-07-25T18:55:00.000Z', t);
  assert.equal(t.messages.length, 0, 'Nothing is due yet');

  const first = await run(db, '2026-07-25T19:00:00.000Z', t);
  assert.equal(first.sent, 1);
  await run(db, '2026-07-25T19:05:00.000Z', t);
  await run(db, '2026-07-25T19:25:00.000Z', t);
  assert.equal(t.messages.length, 1, 'Still inside the window: not queued or sent again');

  await run(db, '2026-07-25T20:00:00.000Z', t);
  await run(db, '2026-07-25T20:05:00.000Z', t);
  assert.equal(t.messages.length, 2);

  assert.equal(t.messages[0].title, 'Table Rock Dam');
  // The same sentence an hour before and at the start: the clock time, no countdown.
  assert.deepEqual(t.messages.map((m) => m.body), Array(2).fill('3 PM Central: generation is posted to start at the dam.'));
  // Each push dies with its own half-hour window.
  assert.deepEqual(t.messages.map((m) => m.ttl), [30 * 60, 30 * 60]);
  // One routing key, and no river or gauge for an older build to follow.
  assert.deepEqual(
    { damId: t.messages[0].data?.damId, kind: t.messages[0].data?.kind, riverSlug: t.messages[0].data?.riverSlug, gaugeSiteId: t.messages[0].data?.gaugeSiteId },
    { damId: DAM, kind: 'generation_start', riverSlug: undefined, gaugeSiteId: undefined },
  );

  assert.deepEqual(events(db).map((e) => e.push_outcome), ['sent', 'sent']);
  const ledger = db.rows('alert_push_deliveries') as Array<Record<string, unknown>>;
  assert.deepEqual(ledger.map((r) => r.event_source), ['dam_generation', 'dam_generation']);
});

test('before the migration is applied the pass reports not ready, and is not an error', async () => {
  const db = world().fail({ table: 'dam_generation_alerts', mode: 'select', code: 'PGRST205' });
  const t = transport();
  const stats = await run(db, '2026-07-25T19:00:00.000Z', t);
  assert.equal(stats.notReady, true);
  assert.equal(stats.error, undefined);
  assert.equal(t.messages.length, 0);
});

test('quiet hours hold a dam alert back, and the notice is not retried after them', async () => {
  // Generation posted for 6 AM; the hour-before notice falls at 5 AM Central (10:00Z).
  const db = world({}, [day('2026-07-25', [7, 8, 9], { retrievedAt: '2026-07-25T09:35:00.000Z' })]).seed('notification_preferences', [
    {
      user_id: 'u1',
      quiet_hours_enabled: true,
      quiet_start_minute: 22 * 60,
      quiet_end_minute: 7 * 60,
      timezone: 'America/Chicago',
      safety_overrides_quiet: true,
    },
  ]);
  const t = transport();

  const stats = await run(db, '2026-07-25T10:00:00.000Z', t);
  assert.equal(stats.quietSuppressed, 1);
  assert.equal(t.messages.length, 0);
  assert.deepEqual(events(db).map((e) => e.push_outcome), ['skipped']);
});

test('an old sheet inside a freshly rebuilt snapshot queues nothing', async () => {
  // The carry-forward case: the row was rebuilt five minutes ago, around a
  // sheet Eddy last fetched five hours ago.
  const db = world({}, [day('2026-07-25', AFTERNOON, { retrievedAt: '2026-07-25T14:00:00.000Z' })]);
  (db.rows('dam_snapshots')[0] as Record<string, unknown>).built_at = '2026-07-25T18:55:00.000Z';
  const t = transport();
  const stats = await run(db, '2026-07-25T19:00:00.000Z', t);
  assert.equal(stats.due, 0);
  assert.equal(t.messages.length, 0);
  assert.equal(events(db).length, 0);
});

test('a sheet with no fetch time queues nothing', async () => {
  const db = world({}, [day('2026-07-25', AFTERNOON, { retrievedAt: null })]);
  const t = transport();
  await run(db, '2026-07-25T19:00:00.000Z', t);
  assert.equal(t.messages.length, 0);
  assert.equal(events(db).length, 0);
});

test('a retry is not sent on a sheet that has gone stale, and goes out once a fresh one confirms it', async () => {
  // Fetched 16:10: fresh at 19:00 when the notice is queued, stale by 19:10.
  const db = world({ notify_at_start: false }, [day('2026-07-25', AFTERNOON, { retrievedAt: '2026-07-25T16:10:00.000Z' })]);
  const t = transport(new Set(['ExponentPushToken[u1]']));
  await run(db, '2026-07-25T19:00:00.000Z', t);
  assert.equal(events(db)[0].push_attempts, 1);

  t.failing.clear();
  const heldPass = await run(db, '2026-07-25T19:15:00.000Z', t);
  assert.equal(heldPass.unconfirmed, 1);
  assert.equal(t.messages.length, 0, 'Not sent on the stale sheet');
  assert.equal(events(db)[0].push_delivered_at, undefined, 'Not thrown away either');
  assert.equal(events(db)[0].push_attempts, 1, 'Waiting does not spend an attempt');

  // The hourly rebuild lands with a fresh read of the same sheet.
  (db.rows('dam_snapshots')[0] as Record<string, unknown>).schedule = [
    day('2026-07-25', AFTERNOON, { retrievedAt: '2026-07-25T19:18:00.000Z' }),
  ];
  await run(db, '2026-07-25T19:20:00.000Z', t);
  assert.equal(t.messages.length, 1);
  assert.equal(t.messages[0].ttl, 10 * 60);
  assert.equal(events(db)[0].push_outcome, 'sent');
});

test('a queue write that fails is reported, and the notice still goes out on the next pass', async () => {
  const db = world({ notify_at_start: false }).fail({ table: 'dam_generation_alert_events', mode: 'upsert', times: 1 });
  const t = transport();
  const failed = await run(db, '2026-07-25T19:00:00.000Z', t);
  assert.equal(failed.due, 1);
  assert.ok(failed.error, 'One due, none queued, must not read as a clean run');
  assert.equal(t.messages.length, 0);

  const recovered = await run(db, '2026-07-25T19:05:00.000Z', t);
  assert.equal(recovered.error, undefined);
  assert.equal(t.messages.length, 1);
});

test('a time switched off after its notice was queued is not sent', async () => {
  const db = world().fail({ table: 'device_tokens', mode: 'select', times: 1 });
  const t = transport();
  // Queued, then the pass aborts on the token read: the notice waits.
  const failed = await run(db, '2026-07-25T19:00:00.000Z', t);
  assert.ok(failed.error);
  assert.equal(events(db)[0].push_delivered_at, undefined);

  (db.rows('dam_generation_alerts')[0] as Record<string, unknown>).notify_hour_before = false;
  const stats = await run(db, '2026-07-25T19:05:00.000Z', t);
  assert.equal(stats.gated, 1);
  assert.equal(t.messages.length, 0);
  assert.equal(events(db)[0].push_outcome, 'skipped');
});

test('a start that has left the posted schedule is not announced', async () => {
  const db = world().fail({ table: 'device_tokens', mode: 'select', times: 1 });
  const t = transport();
  await run(db, '2026-07-25T19:00:00.000Z', t);

  // A fresh sheet for the same day, with no generation on it.
  (db.rows('dam_snapshots')[0] as Record<string, unknown>).schedule = [day('2026-07-25', [])];
  const stats = await run(db, '2026-07-25T19:05:00.000Z', t);
  assert.equal(stats.gated, 1);
  assert.equal(t.messages.length, 0);
});

test('a failed send is retried on the next pass, inside the window', async () => {
  const db = world();
  const t = transport(new Set(['ExponentPushToken[u1]']));
  const first = await run(db, '2026-07-25T19:00:00.000Z', t);
  assert.equal(first.failed, 1);
  assert.equal(events(db)[0].push_attempts, 1);
  assert.equal(events(db)[0].push_delivered_at, undefined);

  t.failing.clear();
  await run(db, '2026-07-25T19:05:00.000Z', t);
  assert.equal(t.messages.length, 1);
  assert.equal(t.messages[0].body, '3 PM Central: generation is posted to start at the dam.');
  assert.equal(events(db)[0].push_outcome, 'sent');
});

test('a notice that could not go out inside its window is dropped, not sent late', async () => {
  const db = world({ notify_at_start: false });
  const t = transport(new Set(['ExponentPushToken[u1]']));
  await run(db, '2026-07-25T19:00:00.000Z', t);

  t.failing.clear();
  const stats = await run(db, '2026-07-25T19:35:00.000Z', t);
  assert.equal(stats.expired, 1);
  assert.equal(t.messages.length, 0);
  assert.equal(events(db)[0].push_outcome, 'expired');
});

test('a delivered notice whose drain write failed is not sent again', async () => {
  const db = world({ notify_at_start: false }).fail({ table: 'dam_generation_alert_events', mode: 'update', times: 1 });
  const t = transport();
  await run(db, '2026-07-25T19:00:00.000Z', t);
  assert.equal(t.messages.length, 1);
  assert.equal(events(db)[0].push_delivered_at, undefined, 'Drain write failed');

  await run(db, '2026-07-25T19:05:00.000Z', t);
  assert.equal(t.messages.length, 1, 'No second push');
  assert.equal(events(db)[0].push_outcome, 'sent');
});

// ── A ticket write that fails is retried, then recorded where the next pass looks ──

test('a dam ledger write that fails once is retried, so the ticket still gets a receipt check', async () => {
  const db = world({ notify_at_start: false }).fail({ table: 'alert_push_deliveries', mode: 'upsert', times: 1 });
  const t = transport();
  await run(db, '2026-07-25T19:00:00.000Z', t);
  assert.equal(t.messages.length, 1);
  const ledger = db.rows('alert_push_deliveries') as Array<Record<string, unknown>>;
  assert.equal(ledger.length, 1, 'Written on the retry');
  assert.equal(ledger[0].ticket_id, 'ticket-1');
  assert.equal(ledger[0].event_source, 'dam_generation');
  assert.equal(ledger[0].sent_at, '2026-07-25T19:00:00.000Z');
  assert.equal(db.rows('alert_push_unrecorded_recipients').length, 0);
});

test('a dam push whose ticket and drain writes both fail is recorded, and not sent again', async () => {
  // The push left. Without the fallback record, the next pass found no ledger
  // row and an undrained event, and sent it a second time.
  const db = world({ notify_at_start: false })
    .fail({ table: 'alert_push_deliveries', mode: 'upsert' })
    .fail({ table: 'dam_generation_alert_events', mode: 'update', times: 1 });
  const t = transport();
  await run(db, '2026-07-25T19:00:00.000Z', t);
  assert.equal(t.messages.length, 1);
  assert.equal(events(db)[0].push_delivered_at, undefined, 'Drain write failed');
  const fallback = db.rows('alert_push_unrecorded_recipients') as Array<Record<string, unknown>>;
  assert.deepEqual(fallback.map((r) => [r.dam_event_id, r.user_id]), [[events(db)[0].id, 'u1']]);

  await run(db, '2026-07-25T19:05:00.000Z', t);
  assert.equal(t.messages.length, 1, 'No second push');
  assert.equal(events(db)[0].push_outcome, 'sent');
});

test('before the fallback column exists the dam pass still sends', async () => {
  // Code deployed ahead of migration 20261120203000: the read finds no column.
  const db = world({ notify_at_start: false }).fail({
    table: 'alert_push_unrecorded_recipients', mode: 'select', code: '42703', message: 'column dam_event_id does not exist',
  });
  const t = transport();
  const stats = await run(db, '2026-07-25T19:00:00.000Z', t);
  assert.equal(stats.error, undefined);
  assert.equal(t.messages.length, 1);
  assert.equal(events(db)[0].push_outcome, 'sent');
});

test('any other failure reading the dam fallback record defers the pass before sending', async () => {
  const db = world({ notify_at_start: false }).fail({ table: 'alert_push_unrecorded_recipients', mode: 'select' });
  const t = transport();
  const stats = await run(db, '2026-07-25T19:00:00.000Z', t);
  assert.ok(stats.error);
  assert.equal(t.messages.length, 0);
});
