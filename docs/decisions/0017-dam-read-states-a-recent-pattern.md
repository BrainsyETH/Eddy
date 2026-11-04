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
   middle half of starts is wider than 3 hours. The earliest recent start
   remains in the legacy report data when known; the compact card does not
   repeat historical fact rows beside the generation-pattern section. A day whose
   first start could be hidden by missing observations has an unknown start
   and is left out of the pattern and the scoring; it never counts as a later
   start.
2. **A posted schedule always outranks the pattern.** The takeaway interprets
   today's posted schedule, re-read from the current snapshot
   each time the Read is served. All times are at the dam, in Central time;
   nothing estimates when water reaches a downstream access.
3. **Code writes the whole Read, in Eddy's voice.** No model. Two earlier
   versions let one write part of it and checked the text afterwards; review
   broke both checks (a wrong schedule and invented counts passed the first;
   "mornings have stayed quiet" beside fourteen mornings of generation passed
   the second, which never saw the facts). `dam-read-facts.ts` now computes
   conclusions from the facts and writes them, so nothing can say what the
   numbers do not. The voice is `src/lib/eddy/voice.ts` applied to a dam:
   "generation" and "generators' worth" as the rest of the dam page says them,
   surprises first and plainly ("Heads up"), counts kept beside what they count.
   A test fails the build on "units", "first start", "came on", "accuracy",
   the company "we", promises and absolutes in any rendered Read.
4. **Compact reading order (2026-11-04):** the existing otter mark and a teal
   Fredoka “Eddy's Read” label, a short Geist headline, one interpretation
   sentence, and a quiet “Updated” timestamp. No fact rows, pattern disclosure,
   full list of generation windows, or repeated freshness/downstream paragraphs.
   The free schedule and generation-pattern section carry that context. Copy is
   selected from the computed facts, never clipped or ellipsized; native text
   can grow with Dynamic Type. The API adds `read.takeaway` and retains its
   legacy report fields for released clients. New clients talking to an older
   API use its headline as body copy under a short neutral heading. The web
   teaser uses the same otter and concise pitch while remaining Premium-gated.
   The compact copy handles unposted schedules, minimum flow, ended windows,
   sparse/irregular history, and weekdays/weekends independently. A posted quiet
   day with recent unposted generation keeps that exception in the one sentence.
5. **Definitions:** a typical generating day is total hours and number of
   runs, not the first run; runs carrying past midnight are counted, never
   dropped from the end time; the track record scores only days where
   something was posted or ran, with quiet days posted quiet counted apart;
   a usual start is always stated with how many days generated at all.
6. **Rewritten when due, served only while true.** `/api/cron/generate-dam-updates`
   runs hourly at :47 and rewrites a dam's Read when none exists for today,
   when the posted schedule changes, or when the last one is 6 hours old. A
   stored Read is served only on its own Central day and only if the posted
   schedule still matches the one it was written against.
7. **The whole Read is Premium.** A public caller of `/api/dam-update/[damId]`
   learns only that a Read exists and when it was written. The measured pattern
   strip, the posted schedule and the water readings on the dam page stay free;
   what Premium buys is Eddy's reading of them. This is a deliberate exception
   to the river and gauge Reads, whose one-line summary is public. It sits
   inside the rule in `eddy-ios/src/lib/premiumCopy.ts` because the data stays
   free and only the interpretation is paid.
8. **Pilot dams:** Table Rock, Bull Shoals, Norfork, Beaver and Greers Ferry
   (`src/lib/eddy/dam-read-dams.ts`). Adding a dam is a list edit, but its
   history should be checked against the backtest first.

9. **On a tailwater river, the dam Read replaces the river Read on the dam's
   own unrated release tab** (2026-11-02). The river Read there can only say
   that no assessment is available (no ladder, no condition), and its bottom
   line only that there is not enough data, while the dam has a Read of the
   schedule that actually moves the water. The rule is per tab
   (`shared/dam-release-tab.ts`): a USACE release gauge with no ladder takes
   the Read of the dam whose id is its site id. A downstream USGS tab keeps its
   own reading and river Read, because every time in the dam Read is at the
   dam; a rated release (Clearwater on the Black) keeps its verdict and river
   Read. Weather stays and is written for a dam-controlled river; Bottom line
   is dropped. On the web this puts the locked teaser in the river page's
   "Eddy's read" slot, so a tailwater's dam tab shows no free Eddy prose, the
   exception in decision 7 applied to the river page. On iOS the dam Read sits
   inside Eddy's take under its one lock row, with decision 7's access rules.
   The same change moved the dam into the live report card on both platforms,
   drawn as the dam cards draw it (the directory card's readings and hourly
   bars on web, the Favorites card's body on iOS): it is the whole card on
   that tab, with Tomorrow's bars and nothing of the gauge card after it, and
   closes the reading card on every other tab with Today's.

## Not decided here

- How long it takes a release to reach each access point downstream. Until
  that is modelled, every time stays "at the dam".
- Whether the stated range should widen with the measured error per dam, for
  example for Bull Shoals.
