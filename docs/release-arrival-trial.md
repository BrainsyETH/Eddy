# Release-arrival trial (internal)

A private log that tests one question before anything is shown to users: when
Bull Shoals Dam raises its release, can Eddy say in advance when the river
will start to rise at the gauge near Norfork?

**Status: implemented, switched off.** Nothing in this trial is released. It
writes two private tables and changes no page, widget, alert or Read.

## Why it exists

Three studies in
[`scripts/research/bull-shoals-lag-2026-11`](../missouri-float-planner/scripts/research/bull-shoals-lag-2026-11/README.md)
found the delay is predictable on a normal river and early on a high one, then
ran out of untouched history before a live rule could be confirmed
([replay](../missouri-float-planner/scripts/research/bull-shoals-lag-2026-11/REPLAY.md):
39 estimates, 60 needed). The remaining test is forward: write the estimate
down before the river can answer, then record what the river did.

## What it does

`/api/cron/log-release-arrivals` runs hourly at :32, after
`sync-dam-history` has stored the newest release hours.

1. **Detect.** Six steady hours of release, then an hour at least 1,000 cfs
   higher, is a release increase.
2. **Decide once.** When three hours of the increase are in hand, the frozen
   rule either issues an estimate or withholds one with a reason. The row is
   written then and never changed.
3. **Read the outcome.** At least 26 hours later, a second row records when the
   gauge first rose 0.10 ft, when it rose fastest, and whether that rise can be
   matched to this increase alone.

Every detected increase gets a row, issued or withheld, so availability is
measured against all of them.

### The rule (`norfork-v1`)

An estimate is issued only when all of these hold:

| Check | Limit |
| --- | --- |
| Release data for the first three hours | present, and in hand before the arrival window opens |
| Baseline before the increase | 300 to 1,500 cfs |
| Peak of the first three hours | at least 2,000 cfs above the baseline |
| Smaller increase in the previous 20 hours | none of 500 cfs or more |
| Gauge near Norfork (USGS 07057370) in the hour before | read, and under 7 ft |
| Buffalo + Crooked Creek discharge, 12 hours up to the decision | read, and moving 500 cfs or less |

The estimate is `ln(hours) = 4.2145 - 0.1633 ln(peak cfs) - 0.0231 x gauge ft`
after half past the increase's first hour, with a range from 1.5 hours earlier
to 1.25 hours later. The rule lives in
[`src/lib/arrival-trial/rule.ts`](../missouri-float-planner/src/lib/arrival-trial/rule.ts).
Its test replays 42 real increases through both this code and the Python
study and fails if any decision differs.

**Changing the rule means a new `RULE_VERSION`**, which logs new rows and
starts its own count. Editing the rule in place would mix two rules in one
result.

## What makes the log trustworthy

- **Rows cannot be revised.** The service role may insert and read both
  tables, nothing else. A prediction and its outcome are separate inserts.
- **The database stamps the time.** The application cannot supply
  `decided_at`, and an issued row is rejected unless it is stored before the
  earliest moment the study counts as an arrival.
- **Lateness is recorded, not hidden.** If release data or the job itself is
  too late, the row is withheld with that as its reason.
- **Inputs are saved with the decision:** each reading used, its own time and
  when Eddy stored it.

`src/lib/arrival-trial/migration.test.ts` checks the first three against the
migration itself.

## Pass marks

Fixed in
[`protocol_forward.json`](../missouri-float-planner/scripts/research/bull-shoals-lag-2026-11/protocol_forward.json)
before any row existed. Scored once, when 60 issued estimates have a matched
outcome:

| Mark | Needed |
| --- | ---: |
| Within 2 hours of the estimate | 80% or more |
| Arriving more than 2 hours early | 5% or less |
| Inside the range | 90% or more |
| Before the range's early edge | 5% or less |

At recent rates that is roughly 15 to 110 scored estimates a year, so expect
six months to two years. Counts and job health can be checked at any time.
Looking at accuracy early does not change the rule or the marks.

## Turning it on

1. Review and merge. The migration
   `20261112213000_release_arrival_trial.sql` is listed under `[pending]`.
2. Apply the migration to production. This needs explicit authorization. Then
   record the version production assigned in
   `supabase/production-migrations.txt`, rename the file if it differs, and run
   `make check-db`.
3. Set `RELEASE_ARRIVAL_TRIAL_ENABLED=true` in production only. Leave preview
   off if it shares the production database, or it will log duplicate work.
4. Call the endpoint once with the cron secret. Expect a JSON summary with
   `monitoring_status: "ok"`. With the flag off it answers `skipped`.
5. Confirm the job appears under Jobs in the admin dashboard, that a row
   appears after the next qualifying release, and that its outcome row appears
   about 26 hours later.

The first pass after switching on also logs increases from the previous 30
hours as withheld for lateness; they are real rows and count toward
availability.

Unset the flag to pause. Existing rows stay.

## Reading the log

Read-only. What happened to every detected increase:

```sql
select p.decision, coalesce(p.reason, 'issued') as reason, o.status, count(*)
from release_arrival_predictions p
left join release_arrival_outcomes o on o.prediction_id = p.id
where p.rule_version = 'norfork-v1'
group by 1, 2, 3
order by 4 desc;
```

The four pass marks, once enough rows exist:

```sql
select count(*) as scored,
       avg((abs(e) <= 2)::int) as within_2h,
       avg((e > 2)::int) as more_than_2h_early,
       avg((o.matched_rise_at between p.range_early_at and p.range_late_at)::int) as inside_range,
       avg((o.matched_rise_at < p.range_early_at)::int) as before_early_edge
from release_arrival_predictions p
join release_arrival_outcomes o on o.prediction_id = p.id
cross join lateral (
  select extract(epoch from (p.predicted_arrival_at - o.matched_rise_at)) / 3600 as e
) x
where p.rule_version = 'norfork-v1' and p.decision = 'issued' and o.status = 'matched';
```

`e` is predicted minus observed hours, so a positive value is an early
arrival.

## What a pass would and would not mean

A pass supports an estimate of when a release increase reaches the gauge near
Norfork, on a normal river. It does not cover accesses without a gauge
(Cotter, Rim Shoals and the rest of the first 41 miles), estimates from the
posted schedule instead of the observed release, or any wading or launch
window. Those need their own evidence, and the liability decision in
[TAILWATER_PLAN.md](../missouri-float-planner/docs/TAILWATER_PLAN.md) still
comes first.

## Known limits

- There is one pass to spare. Release hours reached Eddy about 85 minutes
  after they ended (observed 2026-11-08), so a decision lands roughly four and
  a half hours after an increase begins and the window opens at five and a
  half. One missed sync turns an estimate into a `too late` row.
- The rule cannot see rain coming. Rain during the 13 hours a release is
  travelling caused the largest early arrivals in the studies.
- A smaller release that ended shortly before can reach the gauge first. Such
  rows are flagged `earlier release in transit`, not withheld.
- `received_at` for a release hour is when Eddy first stored it, taken from
  `dam_metric_readings.updated_at`. It is the best available measure of
  publication delay, not an exact one.
- One dam and one gauge. The tables carry `dam_id` and `gauge_site_id` so
  another pair could be added, but each would need its own study first.
