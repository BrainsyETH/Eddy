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
4. **Compact reading order (2026-11-04, rewritten 2026-11-20):** the existing
   otter mark and a teal Fredoka “Eddy's Read” label, a short Geist headline,
   at most two sentences, and a quiet “Updated” timestamp. An unverified/old
   schedule adds “Schedule couldn’t be verified” beneath the summary in both
   native Read placements, using the existing `mayBeOutdated` flag. No fact
   rows, pattern disclosure, or repeated freshness/downstream paragraphs. The
   free schedule and generation-pattern section carry that context. Copy is
   selected from the computed facts, never clipped or ellipsized; native text
   can grow with Dynamic Type. The API adds `read.takeaway` and retains its
   legacy report fields for released clients. New clients talking to an older
   API use its headline as body copy under a short neutral heading. The web
   teaser uses the same otter and concise pitch while remaining Premium-gated.

   **The first sentence is what is posted next, from the serving clock.** A
   run in progress is "posted until" its end; otherwise the next run is named
   with its start and end. One further run is named ("and again from 5 PM to
   9 PM"); more are counted with the hour the last one ends. A start that has
   passed is never the lead. When the day's posted generation is finished the
   sentence is tomorrow's sheet, or that tomorrow is not posted yet.

   **A posted run states its size as a share of full power**, in plain
   fractions: "about a quarter of full power", "about half power", "close to
   full power". The share is the posted megawatts over SWPA's scheduling
   capacity for the project, so it is a statement about the posted plan and
   involves no flow conversion. A run whose hours fall in different fractions
   is "peaking at" its strongest. The Read does not say "light" or "heavy"
   (on a tailwater "light generation" reads as an all-clear to someone
   wading), and does not say "generators' worth" (owner, 2026-11-20: too
   technical for the Read; the dam page keeps it for the measured rack).
   Without a scheduling capacity the size is left out.

   **The second sentence is the one thing that most departs from the last 14
   days**, chosen in this order:
   1. An earlier or later posted start than recent days of the same kind,
      only while that start is still ahead, and only against a consistent
      pattern. A shift of six hours or more is "much earlier", not a count.
   2. Early or unposted generation, by the eligibility rule below.
   3. While it is still morning: no morning generation posted where at least
      60% of recent mornings had some, or morning generation posted where at
      least 80% had none.
   4. A posted day at most half, or at least double, the typical recent
      generating day, and at least three hours from it.
   5. Otherwise: how many recent days of this kind generated, when most did
      not; else the track record ("started within an hour of the posted time
      on 12 of 14 tracked days"); else that the start is close to recent ones.
   A limit that is not met leaves the sentence out. The Read does not tell
   the reader that history is too short or too scattered to say.

   **The night before.** When today's posted generation is done and tomorrow
   is not posted, the Read states the recent pattern for tomorrow's kind of
   day: the usual start when the pattern is consistent, always with how many
   of those days generated, or only that count when it is not. An unposted
   today does the same, and adds the earliest recent start when it is ahead
   of the stated range. On a day with no generation posted, from 5 PM the
   second sentence is tomorrow's sheet when it is posted.

   Why it was rewritten: the 2026-11-04 card compared the day's first posted
   start with the usual first start and said nothing else. Read against the
   Reads stored on 2026-11-19, Norfork's said "A familiar start time" on a
   day posted for 3 hours where recent days ran 12; Table Rock's said starts
   were "too scattered for a usual time" on a morning with nothing posted
   until 4 PM, after generation on 10 of the last 14 mornings; Bull Shoals'
   still led with its 5 AM start at 1 PM; and none of the 20 Reads stored
   that day carried tomorrow's schedule, so every evening Read said tomorrow
   was not posted and stopped. Of the 410 Reads stored from 2026-11-02 to
   2026-11-19, the old card headed 139 (34%) "A familiar start time", "Start
   times have varied lately" or "Generation on today's schedule", none of
   which says anything about the day beyond its first start.

   The compact copy handles unposted schedules, minimum flow, ended windows,
   sparse/irregular history, and weekdays/weekends independently. A posted quiet
   day with recent unposted generation keeps that exception in its second
   sentence. When generation is posted and still ahead, an earlier/later start
   keeps the headline.
   Early or unposted generation can qualify that summary or replace generic
   timing only when the same kind occurred on at least two
   distinct tracked days, or on one of the previous three complete Central
   calendar days. A single older exception stays in the legacy detail data;
   it does not automatically lengthen the compact Read. Isolated recent events
   name their date; repeated events retain counts, with both kinds combined
   when relevant. The card is a headline of at most 45 characters and at most
   two sentences and 60 words (owner, 2026-11-20; it was one sentence of 40),
   with no pattern disclosure. These thresholds select eligible warnings, not a
   reason to hide today's earlier/later posted start. A test renders the card
   across schedules, hours of the day and exception histories and fails on a
   third sentence, a sixty-first word, or any mention of wading, downstream
   water or arrival.
5. **Definitions:** a typical generating day is total hours and number of
   runs, not the first run; runs carrying past midnight are counted, never
   dropped from the end time; the track record scores only days where
   something was posted or ran, with quiet days posted quiet counted apart;
   a usual start is always stated with how many days generated at all. Morning
   coverage walks actual elapsed hours before local noon: both fall-back
   1 AMs count, and spring's nonexistent 2 AM is not a missing observation.
   Any observed morning generation settles the morning as not quiet; otherwise
   a missing real morning hour makes it unknown.
6. **Cache history; render the schedule when serving.** `/api/cron/generate-dam-updates`
   runs hourly at :47 and rewrites a dam's Read when none exists for today,
   when the posted schedule changes, or when the last one is 6 hours old. A
   stored Read is served only on its own Central day before expiry. A current
   snapshot replaces its schedule-dependent facts even when the schedule hash
   changed; an empty current schedule also replaces the saved one. A revised
   schedule no longer hides a valid Read between the :35 snapshot and :47 job.
   Without a snapshot, a Read no older than three hours advances its saved
   windows against the serving clock and marks the schedule unverified. It
   preserves the whole-day first start and tomorrow's windows, never promotes
   yesterday's saved schedule into today, and does not mutate the cached facts.
   Regeneration remains independent of serving eligibility: the six-hour
   refresh picks up late historical observations without blocking a Read.
   Native refreshes on
   focus, foreground and five-minute boundaries, aborting work on blur. It
   hides an earlier hour’s rendered prose and rejects a previous Central day
   while refreshing. Members request the entitled representation directly;
   a public CDN availability response cannot suppress it. A failed refresh
   retains only a still-current Read and offers Retry. A 402 response shows
   the Premium action; 401/403 shows Apple sign-in, never an upgrade offer.
   These actions refresh the held account state, and purchase/sign-in completion
   retries the Read. A missing token during a failed network refresh remains a
   connection failure, distinct from an explicit authentication rejection.
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
   Read. Weather stays and Bottom line is dropped. **Web presentation updated
   2026-11-16:** every river page, including ordinary rivers and section-selected
   reports, shows the free forecast followed by one compact Read link. There is
   no summary sentence or locked teaser in this web slot. This is a deliberate
   layout decision, not a change to decision 7's API or Premium access rules;
   public river/gauge summaries remain available to other clients. The link
   opens the selected dam, gauge or primary river and carries only that Read's
   written time. It is absent when that source has no available Read; weather
   remains. The outlook says “Weather” without an official river forecast and
   “Forecast” when the NWS daily-high row is present. On iOS the dam Read sits
   inside Eddy's take under its one lock row, with decision 7's access rules.
   The same change moved the dam into the live report card on both platforms,
   drawn as the dam cards draw it (the directory card's readings and hourly
   bars on web, the Favorites card's body on iOS): it is the whole card on
   that tab, with Tomorrow's bars and nothing of the gauge card after it, and
   closes the reading card on downstream USGS tabs with Today's. Native
   holds the dam catalog and selects the snapshot by the displayed USACE site
   id, so the White's Norfork release tab pairs Norfork's schedule and Read.
   It never substitutes the controlling dam's footer on another dam's tab.
   Web loads another selected dam's own snapshot on demand. While it loads or
   if that request fails, the already available release remains visible with
   its observation age and stale/flagged/missing state, labelled “Release at
   the dam”; unavailable details get Retry. It never borrows another dam's
   schedule. Dam measurements and schedule times remain explicitly at the dam.
   The native standalone Read fallback waits for the river outlook request to settle,
   avoiding an initial card replacement and duplicate member request.

10. **A river whose level is a Read dam's release gets a river Read written
    from that dam** (2026-11-20). The White below Bull Shoals, the Norfork
    tailwater and Taneycomo below Table Rock have no float ladder, so the
    river Read generator could only store its fallback ("Gauge assessment
    unavailable for White River…"), every morning, and that was the summary
    shown wherever a river's summary is shown. Their Read is now the three
    blocks every river Read has, written by code
    (`src/lib/eddy/tailwater-river-read.ts`):
    - **Summary, public:** what is posted next at the dam, named, with its
      size, by decision 4's first-sentence rules, held to the river summary's
      120 characters (the runs after it are dropped first, then the size).
      It restates the posted schedule, which is free on the dam page. This is
      the one part of a dam's reading that is public (owner, 2026-11-20);
      decision 7 is otherwise unchanged and the dam's own Read stays Premium.
    - **Eddy's Read, Premium:** one local note for what the posted schedule
      has the dam doing in the serving hour: idle, generating, or a run
      posted at 87.5% of full power or more. The notes are in that file,
      confirmed by the owner, and say only what `EDDY_KNOWLEDGE.md` says about
      that water, as a pattern. No note when today's schedule is not posted.
    - **Full, Premium:** the recent pattern for today's kind of day, then
      early or unposted generation by decision 4's eligibility rule or else
      the track record, then the at-the-dam caveat.

    Nothing in it says whether or where the water can be waded, or when a
    release reaches a place downstream; a test fails on either outside the
    standing caveat. It is rendered on every request from the dam's stored
    facts and the current snapshot, under the dam Read's own serving rules
    (decision 6), and is never stored: a sentence about what is posted next,
    written at 5 AM and read at 3 PM, is the stale schedule decision 6 exists
    to prevent. `/api/eddy-update/[riverSlug]` and `/api/eddy-updates` serve
    it in place of the stored prose; when the dam has no servable Read they
    serve the stored row as before. The river is still unrated: the condition
    stays `unknown`, because a release is not a float verdict.

    A river qualifies when a dam with a Read names it as its tailwater and
    the river's gauge is that dam's own release. The Black below Clearwater
    is gauged by USGS, has a ladder, and keeps its model-written river Read.
    Decision 9 still decides what a river page's release tab draws: the dam,
    and the dam's Read. The embed keeps its one fixed sentence
    (`missouri-float-planner/docs/embeds.md`): an embedded page can sit
    cached on someone else's site, where a posted time would go stale.

## Not decided here

- How long it takes a release to reach each access point downstream. Until
  that is modelled, every time stays "at the dam".
- Whether the stated range should widen with the measured error per dam, for
  example for Bull Shoals.
- Whether a posted run's size should be compared with recent days ("more
  than most days lately"). The posted figure is megawatts and the record is
  measured turbine flow; the conversion between them measured within about
  10% at steady state and far worse on a ramp hour, so the comparison waits
  for a backtest.
- The thresholds in decision 4's second sentence (60%, 80%, half or double,
  three hours, six hours) are judgment, not measurement. `npm run
  report:dam-reads` counts how often each card is written, so they can be
  tuned against what the Read said.
