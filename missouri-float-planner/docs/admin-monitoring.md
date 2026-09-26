# Admin monitoring rollout

The admin landing page combines operational health, subscriptions, sign-ins,
trip plans, inbox, push, content gaps, and reach. It authenticates every request
before reading a three-minute server-side cache. Responses are private/no-store.
The sidebar does not fetch the old stats endpoint on this page.

## Stage 1

The dashboard migrations were applied to production on 2026-09-26:

- `20260926182334_admin_dashboard_summary.sql`
- `20260926182346_admin_job_runs.sql`
- `20260926182352_upstream_usage_daily.sql`

The filenames and production ledger use the versions assigned by Supabase.
The production service-role summary returned 67 available metrics out of 72;
the five unavailable chat metrics reflect the known absent `chat_logs` table.
Job status and the empty rollup RPC were verified, and anon/authenticated
access to all new monitoring tables and functions is denied.

For another environment, apply these migrations in order. Configure and verify
Sentry/Redis separately; applying the migrations does not activate telemetry.

The summary uses service-only invoker RPCs and independent metric failures. Its
only definer helper is an aggregate-only recent-sign-in counter in the unexposed
`admin_metrics` schema. Only service_role may execute it; clients receive counts,
never raw `auth.users` rows. No auth-table privileges are granted to API roles.
The service-role key remains server-side.

Optional Sentry summaries require `SENTRY_DASHBOARD_TOKEN` (read-only project
issue scope), `SENTRY_DASHBOARD_ORG`, and comma-separated
`SENTRY_DASHBOARD_PROJECTS` (maximum three). Collection DSNs do not authorize the
Sentry reporting API. `SENTRY_DASHBOARD_ENVIRONMENT` defaults to `production`. No issues, messages, bodies, or stack traces are persisted
or sent to the admin browser by this integration; it returns bounded counts.

Cron monitoring adds one bounded start write and one finish write per authorized
run. Outcomes separate HTTP failures, partial application failures, skips, and
unfinished runs. Schedule variants have separate identities. No free-text error
messages or request URLs are written. Rows expire after 30 days via the telemetry
rollup cron. The job migration stores a durable rollout timestamp. Apply it at rollout; this
clock is not reset by a redeploy or retention cleanup. A never-recorded job is
Unknown until its first scheduled UTC occurrence plus 15 minutes, then overdue.
Deadline checks run only in Vercel production (preview/local have no cron scheduler).
A failed monitoring query remains Unknown rather than falsely reporting missed runs.
`src/lib/admin/dashboard/expected-jobs.json` is intentionally independent of
`vercel.json`; reconcile both when deliberately changing schedules. Missing or
changed expected schedules raise Needs attention. Minute lists, steps, ranges,
multiple daily runs and weekday schedules use actual next execution times.
Unsupported calendar syntax becomes Unknown instead of an invented deadline.
Cron JSON may supply `monitoring_status` (`ok`, `partial`, `error`, `skipped`) to
replace response-key heuristics. HTTP failures always remain errors; Trust lock
contention is skipped, while unavailable locking is an error. Recent sign-ins are not
DAU/MAU. Subscription state is current production Premium access, not revenue.

Login audit recording is globally limited to 30 rows/minute by a database lock.
Rejected rate-limited attempts are not separately inserted. No entered passwords,
IP addresses or user input are recorded. Counts are explicitly recorded attempts.

### Data limitations found during review

- Production currently lacks `chat_logs`; chat cards remain Unknown. This change
  does not silently recreate a table holding message text. Decide separately
  whether that collection should be restored.
- `email_subscribers` exists in production but lacks its own repository migration.
  Its historical schema reconciliation is separate from this monitoring change.
- `push_delivered_at` also means cleared without sending. Historical suppressed,
  expired and exhausted events cannot be reliably separated. The dashboard does
  not present queue-cleared events as delivered to a phone.
- Receipt-checked sent rows can include old receipts expired by the worker;
  consequently this dashboard does not claim a confirmed device delivery rate.
- Reads' expiry cards count stored rows, including historic rows. They do not
  assert that a live page served expired prose. Live condition mismatch checks
  link to Trust; opening the dashboard never recomputes live conditions. These
  limitations are explanatory text, not permanently unavailable metric cards.
- iOS adoption covers recent push-registered devices. The version list groups a
  long tail into Other versions, counted as unknown for adoption comparisons.
- Health observed inside Eddy cannot establish external uptime during a complete
  Eddy outage. Existing Sentry/provider surfaces remain independent backstops.

## Stage 2

Apply `upstream_usage_daily` after Stage 1. The daily cron runs at 06:50 UTC,
re-reads today and the preceding six days, and upserts absolute snapshots.
It never deletes a Redis key after copying. Keys expire after eight days;
Postgres retains 90 days. Copy timestamps and monotonic observation counts prevent
older concurrent snapshots overwriting newer data. An outage longer than Redis
retention loses uncopied history and is not silently represented as zero.

Collection is OFF by default. Configure:

| Variable | Meaning |
| --- | --- |
| `UPSTREAM_TELEMETRY_ENABLED=true` | Enable recording and Redis reads |
| `TELEMETRY_REDIS_REST_URL`, `TELEMETRY_REDIS_REST_TOKEN` | Dedicated telemetry Redis endpoint, preferred |
| `UPSTREAM_TELEMETRY_ALLOW_SHARED_REDIS=true` | Explicitly allow fallback to existing rate-limit Redis credentials |
| `UPSTREAM_TELEMETRY_SAMPLE_RATE=0.1` | Sample successful request-path operations; 0–1 |
| `UPSTREAM_TELEMETRY_DAILY_COMMAND_BUDGET=2000` | Conservative per-environment recording-operation budget |

Cron measurements are buffered per invocation (maximum 2,000), batched in groups
of 50, and unsampled. Anthropic logical calls and errors are unsampled; ordinary
successful request-path operations are sampled. All collection is best-effort.
The budget counts operations within recording scripts; EVAL overhead, rejected
probes, summary reads and rollup reads are additional. It is **not a hard billing
cap**. Each environment has a separate budget. A dedicated Redis database avoids
sharing resource exhaustion with security controls; a separate database may have
its own cost. No paid resource is provisioned by this change.

Before enabling shared Redis, inspect actual Upstash command usage plus Vercel
logs from a representative day, including high-volume cron runs. Count all
existing rate-limiter commands and both preview/production telemetry budgets.
Keep headroom and verify account pricing; no claim of a free tier fit is made
without those account measurements. If constrained, reduce successful-request
sampling and the budget or use dedicated storage. Budget exhaustion and observed
buffer overflow are visible in Needs attention.

`after()` extends the request lifetime for flushing. There are no detached
unawaited network writes, timers that require a warm instance, or synchronous
telemetry prerequisites for ordinary fetch results. Telemetry outage pauses
collection locally for one minute; hitting the daily budget pauses that instance
until UTC midnight. New instances can still incur rejected budget probes.

### Measurement definitions

- USGS/NWS/OpenWeather/Mapbox: instrumented fetch **invocations**, potentially
  answered by Next's data cache. `no-store`/revalidate=0 are separate dimensions.
  Latency stops at response headers; it excludes JSON/body consumption.
- Mapbox includes server directions and geocoding, not map loads or tiles.
- Anthropic: logical SDK operations across all five current call sites, including
  each chat tool-loop iteration. SDK retry attempts are not separately counted.
  Recorded tokens and standard-model cost estimates are not an invoice. The
  versioned price table excludes discounts/region modifiers and assumes the
  five-minute cache TTL used by current call sites. Unknown models are unpriced.
- MCP: all eight registered tools, including tool-level `isError` results. HTTP
  handshake requests are not tool calls. Transport is limited to 120 requests/IP
  per minute using the existing limiter. Without global Redis configuration this
  is only a per-instance fallback, explicitly shown in admin.
- No URL, coordinates, search text, tool argument, credential, user ID, or body
  is recorded. Dimensions are operation names and configured model names.
- Histograms are retained and merged before deriving approximate percentiles;
  daily p95 values are never averaged. Sampling rates are retained per dimension.
- Cache-inclusive fetch counters cannot drive provider quota alarms. In
  particular, no OpenWeather 80% billed-quota warning is generated from them.

## Validation and activation

1. Run `make check-web`. Where tsx CLI IPC sockets are unavailable, the same file
   list runs via `TSX_TSCONFIG_PATH=tsconfig.test.json node --import tsx --test`.
2. Apply to a nonproduction database first; verify anon/authenticated cannot call
   dashboard/audit/rollup RPCs and cannot read monitoring tables.
3. Configure a preview telemetry store. Make a successful/failed provider call,
   an MCP tool call, and an authorized cron request. Verify the Redis fields and
   isolation of preview from production, then invoke rollup twice.
4. Confirm row counts and totals are unchanged on the duplicate copy, retained
   hashes still exist, and a late observation updates the same daily row.
5. Force a Redis failure and a low budget. Ordinary requests must retain their
   original responses; dashboard coverage must become Unknown or capped.
6. Confirm one cached summary request per refresh, visible-tab polling only,
   authentication on cache hits, and explicit missing-source states.
7. Record the final production migration versions before merging the ledger.

### Verification status

Configured Vercel preview checks against real Sentry and Redis remain an activation
gate; local fixtures are not evidence of working provider credentials or quotas.
Sentry and job-source failures emit bounded diagnostic messages without tokens or
provider response bodies. Collection is unsampled for errors/AI/cron paths, not
guaranteed: budgets, buffer limits, store outages and interrupted execution can
drop observations. Neither the recording budget nor repeatable rollups guarantee
a hard billing cap or lossless history.
