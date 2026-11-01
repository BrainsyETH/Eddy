# 0017 — A dam's Eddy's Read states its recent generation pattern

Status: active · 2026-11 · table `dam_updates` applied to production as
`20261101214925`.

## Context

Anglers below the White River dams plan around one question: when do the units
come on? SWPA posts an hourly schedule, but only for today and tomorrow, and
the pattern strip on the dam page shows the last week of measured generation
without saying what it adds up to. Its info tip said "Past generation does not
predict future releases", and the gauge Read generator excluded dams outright
("Revisit when dam context is deliberately added to the prompt").

`dam_metric_readings` has kept hourly turbine flow since 2026-08-07
(ADR 0013 explains why it is kept 730 days), and `dam_forecast_history` has
kept every posted schedule since 2026-10-12. That is enough to describe the
recent pattern honestly, and to say how well the posted plan has held up.

Measured on that history (backtest in
`missouri-float-planner/src/lib/eddy/dam-read-facts.test.ts`):

- Patterns change with the season. Table Rock's first start was 6 AM on 20 of
  24 August days and 3-5 PM through October. A 90-day median put Bull Shoals'
  weekday start at 11 AM, an hour it almost never started at lately.
- With a 14-day window, weekdays and weekends kept apart, and the pattern
  stated only when its middle half falls within 3 hours, the day's first
  start fell within the stated range (±1 hour) on 80% of the days a pattern
  was stated at Table Rock, 82% at Norfork and 67% at Bull Shoals. Bull Shoals
  was too irregular to state at all on about half its days.

## Decision

1. **The dam Read may describe the recent pattern, labelled as one.** It
   reports the usual first start over the last 14 complete Central days,
   weekdays and weekends apart, and says "no consistent pattern" when the
   middle half of starts is wider than 3 hours. The **earliest recent start is
   always its own row** when one is known, pattern or no pattern, because an
   early start is the miss that catches someone in rising water. A day whose
   first start could be hidden by missing observations has an unknown start
   and is left out of the pattern and the scoring; it never counts as a later
   start.
2. **A posted schedule always outranks the pattern.** The headline and the
   first row are today's posted schedule, re-read from the current snapshot
   each time the Read is served. All times are at the dam, in Central time;
   nothing estimates when water reaches a downstream access.
3. **Code states every fact; the model only interprets.** `damReadRows` in
   `dam-read-facts.ts` renders the posted schedule, the usual and earliest
   starts, how often mornings were off before noon, the typical run and when
   it ended, the typical daily peak in units, how the posted schedule held
   (naming the days it missed), and each water reading with its own station.
   The model (the `gauge_update` workload) writes two or three sentences of
   interpretation, and `damProseProblems` rejects any digit, number word,
   clock word, schedule or "today" claim, live-state claim, promise or
   measurement in them, falling back to deterministic text. This replaced a
   first version in which the model wrote the facts and a checker looked for
   their times; review showed that checker passed a wrong schedule, a borrowed
   time and invented counts.
4. **Rewritten when due, served only while true.** `/api/cron/generate-dam-updates`
   runs hourly at :47 and rewrites a dam's Read when none exists for today,
   when the posted schedule changes, or when the last one is 6 hours old. A
   stored Read is served only on its own Central day and only if the posted
   schedule still matches the one it was written against.
5. **The whole Read is Premium.** A public caller of `/api/dam-update/[damId]`
   learns only that a Read exists and when it was written. The measured pattern
   strip, the posted schedule and the water readings on the dam page stay free;
   what Premium buys is Eddy's reading of them. This is a deliberate exception
   to the river and gauge Reads, whose one-line summary is public. It sits
   inside the rule in `eddy-ios/src/lib/premiumCopy.ts` because the data stays
   free and only the interpretation is paid.
6. **Pilot dams:** Table Rock, Bull Shoals, Norfork, Beaver and Greers Ferry
   (`src/lib/eddy/dam-read-dams.ts`). Adding a dam is a list edit, but its
   history should be checked against the backtest first.

## Not decided here

- How long it takes a release to reach each access point downstream. Until
  that is modelled, every time stays "at the dam".
- Whether the stated range should widen with the measured error per dam, for
  example for Bull Shoals.
