# 0020 — Dam generation alerts follow the posted schedule

Status: active · 2026-11 · implemented in code; the tables are pending in
`missouri-float-planner/supabase/production-migrations.txt`
(`20261117230000_dam_generation_alerts.sql`) until applied. Device
verification of the iOS screens and of a delivered push is unconfirmed.

## Context

Anglers below the White River dams want to know when generation starts.
`TAILWATER_PLAN.md` §4 proposed alerts on starred dams ("notify when
tomorrow's schedule changes"), and the push pipeline, starred dams and the
stored schedule history (ADR 0013) already existed. No dam alert did.

Three triggers were possible. Production history on 2026-11-17 decided between
them (read-only queries; five pilot dams, 36 days of `dam_forecast_history`):

| Trigger | Measured | Verdict |
| --- | --- | --- |
| Generation **measured** to have started | The newest stored turbine-flow hour was 1.7 to 2.7 hours behind the clock (one check, `dam_metric_readings`) | Arrives after the water |
| The posted schedule **changed** | The on/off pattern changed after first being seen on 1 of 180 dam-days | Would almost never fire |
| Generation is **posted** to start | Posted on 35 of 36 days at Table Rock, 33 Norfork, 32 Bull Shoals, 30 Beaver, 14 Greers Ferry | Known hours ahead, and stable |

The history is autumn only. Re-measure before changing the decision on the
first two rows.

## Decision

1. **The alert reads the posted schedule and says so.** It pushes when
   generation is *posted* to start at a dam. It does not confirm that
   generation began. Every push and every screen says "posted", gives the time
   "at the dam" in Central time, and estimates nothing downstream (ADR 0017,
   "Not decided here").
2. **Two times, either or both:** at the posted start, and one hour before it.
   One alert per person per dam, shown as two switches on the dam screen. There
   is no paused state: both off deletes the alert.
3. **Every posted start, not only the day's first.** A start is an hour with
   generation scheduled that follows a known hour without it, tested through
   `scheduledGeneration()` so minimum-flow hours are neither a start nor hide
   one. The first hour of a day counts only when the day before is in the same
   schedule and ended quiet.
4. **Quiet hours are respected.** It is not a safety alert and never breaks a
   quiet window. A suppressed notice is dropped, not held until morning.
5. **Late is dropped.** A notice may go out up to 30 minutes after it falls
   due (slack for a failed pass); after that it is not sent. The wait stated in
   the push ("about an hour from now", "in about 35 minutes") is computed when
   it is sent.
6. **Free**, like the rest of alerting. The schedule is free data; a permanent
   account is needed only so there is a device to push to.
7. **Only dams SWPA schedules.** The dam screen shows the switches where the
   snapshot carries `generationReference`; the route refuses a dam with no
   `swpaCode`.
8. **One pass queues and drains.** `/api/cron/deliver-push` (every five
   minutes) derives the due notices from the stored dam snapshots, inserts them
   into `dam_generation_alert_events` (unique on alert, start and lead), and
   sends through the shared ledger, receipts and token handling. A snapshot
   older than three hours queues nothing. A queued start that has left a known
   schedule, or whose time was switched off, is not sent.
9. **Kept out of `AlertRule`.** `/api/me/dam-alerts` is its own route and
   `/api/me/alerts` is unchanged, because a released iOS build that met a third
   `AlertRule.source` would treat it as one of the two it knows. The push
   carries `damId` and no river or gauge key, so an older build opens the app
   rather than the wrong screen.

## The limit, and where it is stated

Generation has started early, and without a posted start, on days Eddy tracked
(ADR 0017's Read reports those days). So no alert is not "the water is staying
down". `DAM_ALERT_NOTE` (`eddy-ios/src/lib/damAlerts.ts`) says this under the
switches and in the push primer; a test fails if it stops saying it.

## Not decided here

- A notice that generation was *measured* without a posted start. It would be
  an hour or more old when sent, and needs its own wording.
- Web: there is no web UI for this alert.
- Whether a starred dam should offer the alert without a visit to its screen.

## Where it lives

`missouri-float-planner/src/lib/alerts/dam-generation.ts` (rules and copy),
`dam-generation-delivery.ts` (the pass), `src/app/api/me/dam-alerts/route.ts`;
`eddy-ios/src/components/dam/DamGenerationAlerts.tsx`,
`src/hooks/useDamAlerts.tsx`, `src/lib/damAlerts.ts`. Tests:
`src/lib/alerts/dam-generation.test.ts` and `src/lib/dam-alerts.test.ts` in the
web suite, and `scripts/dam-generation-alerts-migration.test.ts`, which runs
the migration file against a fixture and checks its constraints and row-level
access.
