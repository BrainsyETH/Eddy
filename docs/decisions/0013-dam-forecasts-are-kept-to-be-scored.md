# 0013 — Dam forecasts are kept so they can be scored

Status: active · 2026-10 · the table is pending in
`missouri-float-planner/supabase/production-migrations.txt` until applied.

## Context

`src/lib/data/dams.ts` and the `dam_snapshots` migration both said a copy of
yesterday's forecast is worthless, so nothing kept one. For **serving** that
is still true: a route never reads an old forecast. It was not true for
**evaluation**. `dam_metric_readings` keeps 730 days of what the turbines
actually did. Without the forecasts that came before those hours, Eddy cannot
say how often "no generation scheduled" was wrong, by how much, or how that
changes with lead time. That matters most on trout tailwaters, where wading
decisions depend on the schedule.

## Decision

1. **Keep each distinct version, not each hourly rebuild.** The snapshot cron
   (`/api/cron/sync-dam-snapshots`) passes the snapshots it already wrote to
   `recordForecastHistory` (`src/lib/data/dam-forecast-history.ts`). The
   `record_dam_forecasts` function inserts a row when a dam's forecast differs
   from its latest stored version, and otherwise extends that version's
   `last_seen_at`. `[first_seen_at, last_seen_at]` is when Eddy served it.
2. **Two sources, stored as served:** the CWMS generation forecast
   (`generationForecast`) and the SWPA schedule (`schedule`). The comparison
   hash ignores fetch time (`retrievedAt`) and the start of the window that is
   currently running, which `buildForecastWindows` moves every hour.
3. **Only snapshots the cron accepted.** A snapshot `decideWrites` held back
   during an outage is not recorded, and an empty schedule or forecast writes
   nothing. A fetch failure must not look like a forecast of no generation.
4. **Retain 730 days**, matching `dam_metric_readings`. An older forecast has
   no observations left to be compared with.
5. **Failures do not affect serving.** A history write that fails is logged and
   reported as `forecastHistory: null` in the cron response. The dam pages are
   unaffected.

## Not decided here

How accuracy is scored (which lead times, what counts as a miss, where it is
shown). That waits until enough history exists to look at.
