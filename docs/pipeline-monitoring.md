# Pipeline monitoring

How to know the alert pipeline is **working**, not merely deployed.

`/api/health` is liveness only: it answers 200 whenever the function boots. Every
outage that has hurt Eddy looked healthy there — a push kill switch left on for
six days, a cron lock that could not be evaluated and recorded every run as
"skipped", a gauge pass that died before writing a reading. Nothing inside
Vercel notices when Vercel's crons stop, so the check below is meant to be
polled from **outside**.

## The endpoint

`GET /api/health/pipeline` — 200 when every check passes, 503 when any fails or
cannot be read (an unreadable check never passes).

| Check | Passes when | Source |
| --- | --- | --- |
| `job:update-gauges` | the hourly or 15-minute gauge pass finished (`ok`/`partial`) within 75 min | `admin_job_runs` |
| `job:evaluate-gauge-alerts` | finished within 50 min | `admin_job_runs` |
| `job:deliver-push` | finished within 20 min | `admin_job_runs` |
| `freshness:curated-readings` | the newest curated gauge reading is under 120 min old | `get_latest_curated_readings` |
| `outbox:oldest-pending-alert` | no deliverable alert has waited over 30 min (empty passes) | both outbox tables |

Thresholds live in `src/lib/monitoring/pipeline-health.ts`; each allows a couple
of missed runs so a single dropped Vercel invocation does not page anyone.

Unauthenticated callers get only `ok` per check, CDN-cached for 60s and
rate-limited. With `Authorization: Bearer $CRON_SECRET` the response adds ages
and reasons (`stale`, `never`, `unreadable`) and is never cached.

A pushed kill switch (`EXPO_PUSH_ENABLED=false` or `app_config`) makes the outbox
check fail within 30 minutes of the first undelivered alert. That is intended:
a switch nobody remembers is on is the outage this exists to catch.

## Wiring a monitor (one-time, outside the repo)

1. In an external uptime service, add an HTTP check on
   `https://eddy.guide/api/health/pipeline`, every 5 minutes, alerting on any
   non-200 for two consecutive checks.
2. Route its alerts to a channel someone reads (email or phone push).
3. Confirm it goes red: temporarily set the threshold-breaking condition on a
   preview deployment, or watch it during the next intentional kill-switch use.

Until step 1 is done this endpoint is a dashboard nobody opens — the failure
mode it replaces.

## Outcomes on outbox rows

Drained events record why in `push_outcome` (`sent`, `skipped`, `expired`,
`given_up`) once migration `20261101180000_push_outcome.sql` is applied. Code
deployed before the migration keeps draining and logs one warning per instance.
