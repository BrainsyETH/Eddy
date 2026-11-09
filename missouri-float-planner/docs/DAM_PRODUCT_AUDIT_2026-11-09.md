# Dam product audit — 2026-11-09

**Status: measurements + findings + a recommended order of work.** Covers the
dam pages (`/dams`, `/dams/[damId]`), their search presence, Eddy's Read for
dams, the logic behind the schedule and generation surfaces, the data pipeline
that feeds them, and the iOS dam surfaces. Companions:
`RIVERS_AND_DAMS_REVIEW_2026-08-24.md` (the last review of this layer),
`TAILWATER_PLAN.md` (what to build next), ADR 0013 and ADR 0017.

**What was measured.** Production tables were read (never written) on
2026-11-09 around 03:00 UTC: `dam_snapshots`, `dam_metric_readings`,
`dam_forecast_history`, `dam_updates`, `starred_dams`, `embed_impressions`,
`admin_job_runs`, `trust_findings`, `entitlements`, `profiles`. The live site
was fetched for three dam pages, the index, the API, the sitemap, robots and an
Open Graph image. The code was read end to end, and three independent review
passes (shared logic, data pipeline, iOS) fed the findings below. GA4 and
Search Console were **not** available from this environment; see §2.

**Verdict in one line:** the dam layer is now well built and well watched, the
history that could not be recovered in August is being recorded for every dam
that has one, and the pages are fast and correctly titled. What holds the
product back is no longer data: it is one write path that can erase a good
schedule, product copy built on a wrong assumption about when SWPA posts, an
index page that does not know it is a dam page, and no content or linking
around pages whose titles already target the right searches.

---

## 1. Where the dam product stands

### Footprint and health

| Measure | Value |
| --- | --- |
| Dams in the registry | 24 (SWL 8, SWT 8, MVS 2, LRN 3, NWK 2 schedule-only, Ameren 1) |
| Dams with an hourly SWPA schedule | 18, all wired |
| Dams recording hourly turbine history | 18 of 18 expected, every one 2–4 h fresh |
| History depth | since 2026-08-07, ~2,235 hours per dam per metric |
| Stored schedule versions (ADR 0013) | since 2026-10-12, 36–38 per SWPA dam, 84–136 per LRN forecast |
| Dams with an Eddy's Read | 5 (Table Rock, Bull Shoals, Norfork, Beaver, Greers Ferry) |
| Reads written | 165 since 2026-11-02, about 4.7 per dam per day |
| `sync-dam-snapshots`, last 7 days | 167 runs, all `ok`, mean 10 s, max 83 s |
| `sync-dam-history`, last 7 days | 133 `ok`, 33 `partial`, 1 `error` |
| `generate-dam-updates`, last 7 days | 167 runs, all `ok`, mean 3.6 s |
| Open `dam_freshness` findings | 0 (all historical findings resolved) |
| Live page TTFB (Table Rock, Fort Gibson, Stockton) | 0.25–0.65 s |

The August review's P0 (three Nashville dams frozen, nothing watching) and P1
(no trust check on the dam layer) are both closed: the `dam_freshness` check
exists and has caught and resolved real outages (Tulsa, 2026-10-15; LRN,
resolved 2026-11-09). That is the single biggest improvement since August.

### Demand signals Eddy already holds

| Signal | Value | Reading |
| --- | --- | --- |
| Starred dams | 21 stars by 9 dams | Bull Shoals 7, Table Rock 5, Beaver 2, Mark Twain 2, five others 1 each |
| Profiles / active Premium | 129 / 17 | The Read's paying audience is small; the web is the acquisition surface |
| Push device tokens | 8 | Any dam notification feature starts with a tiny reachable audience |
| Dam embed impressions, 30 days | 51 across six dam widget types | All from `eddy.guide` itself (the configurator); no partner has installed a dam widget |
| River embed impressions, 30 days | ~2,400 | For scale: the river widgets have real partner hosts, the dam widgets have none |
| Blog posts about dams, tailwaters or generation | 0 of 26 | No supporting content for pages whose titles target "generation schedule" |

The two dams people star are the two dams the index features and the two the
app promotion targets. That is consistent, and it says the White River trout
tailwaters are the product, as `TAILWATER_PLAN.md` decided.

## 2. What analytics exist, and what does not

The repository's only Search Console evidence is a sentence in
`src/lib/dam-page-copy.ts`: lake-level queries show impressions with few
clicks, and release-schedule queries (Fort Gibson among them) have real
traction. That sentence drove the November title rewrite and it is the right
call, but it cannot be re-checked from the repository, and nothing records the
numbers it summarised.

GA4 events for the dam surfaces are wired (`app_promotion_view`,
`app_landing_click` and `app_store_click` with `dam_id`,
`VISIBILITY_MEASUREMENT.md`). Whether `dam_id` is registered as a custom
dimension, and what the view → click → store funnel looks like, is not
knowable from here.

**Recommendation.** Before deciding where the dam product goes next, export
28 days of Search Console (queries and pages filtered to `/dams`) and the three
GA4 dam events, and check them into `docs/research/` with a date. Every
prioritisation below that mentions search is made on the proxies above and on
the one sentence in `dam-page-copy.ts`, and says so.

## 3. Findings, ranked

### P1 — a failed SWPA fetch overwrites a good stored schedule

*Fixed 2026-11-09: `carryForwardSchedule` in `dams.ts`, bounded to six hours
after each day's own fetch (`SCHEDULE_CARRY_MAX_HOURS`); the pattern no longer
counts in `saysAnything`; the cron reports `scheduleCarried`. Note that #1742
since stopped withholding a Read on a schedule-hash mismatch, so the
"withholds the previous Read" consequence below no longer applies; the empty
schedule would now be rendered into the Read instead.*

`src/lib/data/dam-snapshot-store.ts` `saysAnything()` (line 196) treats a
snapshot as "something was read" if it has metrics, a schedule, a forecast
**or a pattern**. The pattern comes from `dam_metric_readings`, Eddy's own
table, not from an upstream source. So:

- SWPA fails or fails closed at :35 (a 5xx, a parse failure after a format
  change, a holiday file) while CWMS is fine → every SWPA dam's live snapshot
  has metrics and `schedule: []` → `decideWrites` accepts it → the stored row
  with this morning's good schedule is replaced by one with no schedule.
  `carryFromPrevious` carries metrics only, by design.
- CWMS **and** SWPA both fail while Supabase is fine → the snapshot still "says
  something" through its pattern → same overwrite, and `keptOnOutage` stays 0.

`/api/dams/[damId]`, the dam page and the iOS app all prefer the stored row to
a live read for the next hour, so readers see "Today's generation schedule is
unavailable" while SWPA is posting generation. `generate-dam-updates` at :47
then sees the schedule hash change to `null`, rewrites the Read as "Today's
schedule isn't posted", and the route withholds the previous Read. The
docblock above `decideWrites` says "nothing read → skipped, whatever is stored
stands"; that is true only when every source fails and the dam has no pattern.

Fix: when the live schedule is empty and the stored row still carries today's
or tomorrow's date, carry the stored schedule forward (with its own
`retrievedAt`, so the freshness line stays honest), and count it in the cron
response as `scheduleCarried`. Exclude `pattern` from `saysAnything`, or test
sources separately from derived sections.

### P1 — the product assumes SWPA posts "each afternoon"; it does not

*Copy fixed 2026-11-09: one measured `SCHEDULE_POSTING_NOTE` in
`shared/dam-schedule-copy.ts` on web and iOS, with a test that fails on any dam
surface claiming afternoon posting. Parts (2) and (3) below remain open.*

Every copy surface says so: the dam page availability text
(`src/app/dams/[damId]/page.tsx:70`), the generation info tip
(`GenerationCard.tsx:30`), both iOS cards (`GenerationSchedule.tsx:193`,
`GenerationCard.tsx:96`), the comment in `swpa.ts:59` ("post 2–4 PM CT"), and
the design rationale for drawing Tomorrow on the river lead card ("anglers
plan the night before and SWPA posts the afternoon before").

`dam_forecast_history` says otherwise. For Table Rock (one file per weekday
serves every project, so this generalises), the first time Eddy held a day's
sheet, Central time, over the last four weeks:

| Sheet for | First held |
| --- | --- |
| Tue, Wed, Thu, Fri | 03:35–04:35 the same morning on most days; a few by 00:35 |
| Sat | 03:35–04:35 Saturday morning, carrying Sun and Mon with it |
| Sun, Mon | the evening before (about 19:30–23:30) |

Measured against the live site at 21:20 CST Sunday 2026-11-08: Monday's sheet
was present, so "Generation starts at 7 AM tomorrow" rendered correctly.
Measured in the table for Mon–Fri evenings of 2026-11-02 to 11-06: Tomorrow's
sheet was **never** present; each day's version carried one date. SWPA's cache
(`max-age=600`) and Eddy's 30-minute revalidate add at most 40 minutes to
these times, so the sheets genuinely land overnight and in the early morning.

Consequences today:

- On weekday mornings from midnight to about 04:30 CT the dam pages show
  "Today's generation schedule is unavailable" with copy telling the reader it
  is posted in the afternoon.
- The midnight Read is written against no schedule ("Today's schedule isn't
  posted") and stands until the 04:47 run; the data shows 5 of 7 recent
  Table Rock days had this shape.
- On Mon–Fri evenings the "next change" line and the Tomorrow bars have no
  tomorrow to draw, so the night-before planning promise is only kept on
  weekends.
- `SUMMARY_SCHEDULE_DAYS = 2` costs a second file fetch on evenings when it can
  never pay.

Fix, in three parts: (1) rewrite the copy on web and iOS to "SWPA usually
posts the day's schedule overnight; weekend and Monday schedules often appear
the evening before"; (2) make the posting hour a measured fact: a small query
over `dam_forecast_history` (first `first_seen_at` per `scheduleDate`) in the
admin dashboard, so the copy is checked against the source rather than
remembered; (3) consider skipping the midnight Read rewrite when the hash is
`null` and yesterday's Read is still younger than six hours, so the "isn't
posted" Read is not the first thing an early riser sees.

### P2 — the schedule's day enumeration runs in the server's time zone

`swpa.ts` `fetchProjectSchedule` (lines 428–433) builds the three wanted days
with `setDate(+i)` on a `Date` in the server's zone (UTC on Vercel), then maps
each to a Central day. On the fall-back night that produces the same Central
day twice and skips tomorrow. Production confirms it: the version first seen
at 00:35 CT on 2026-11-01 carried `2026-11-01, 2026-11-01, 2026-11-02`. The
spring-forward night skips a day instead: reproduced under `TZ=UTC`, at 23:30
CST on 2026-03-07 the wanted days are Mar 7, Mar 9, Mar 10, so Sunday's sheet
is never fetched and the hero says "No more releases in the posted schedule"
while Sunday's start is posted. One hour a year, baked in for the 30-minute
fetch cache plus the hourly cron, and it also minted a spurious schedule
version and a Read rewrite. Enumerate Central day keys with `nextDayKey` and
derive the weekday file from the key.

### P2 — the wire `generating` boolean is age-blind, and iOS draws it as a present-tense chip and pin label

`dams.ts` `buildSnapshot` (line 687) sets `generating` from the latest turbine
reading with no staleness test, and `refreshStaleness` never recomputes it.
The web is safe: the detail page hides the chip (`DamStateCard` is always
`secondary` there) and the hero derives its status from `generationNow`,
which says "at last reading" once the point is no longer fresh. iOS is not:
`eddy-ios/src/components/dam/DamStateCard.tsx:155–177` renders a bold
"Generating" or "Not generating" chip from the boolean, and
`eddy-ios/src/lib/damCatalog.ts:213–214` labels the map pin "Generating" or
"Units idle" from it. Scenario: CWMS lags five hours (the code documents
half-day lags), the last point is 15,000 cfs, SWPA stopped the units at 2 PM;
the pin and chip say "Generating". Drive both from `generationNow(...).kind`
with `speaksForNow`, or drop the present tense from the wire field and give it
an `at`.

### P2 — "No more releases in the posted schedule" is a water claim

`shared/dam-generation.ts:707–709` says "Releasing through the end of the
posted schedule" and "No more releases in the posted schedule" when the
posted schedule runs out without changing. At Bull Shoals after the last
generating hour, with minimum flow posted for every remaining hour, the line
reads "No more releases" while about 800 cfs runs all night. The file's own
rule is that the schedule describes generation, not water. Say "No more
generation in the posted schedule" and, at a minimum-flow project, "Only
minimum flow for the rest of the posted schedule".

### P2 — `/dams` is titled as a dam page and rendered as the Conditions page

`src/app/dams/page.tsx` sets the title "Lake Levels, Dam Releases &
Generation Schedules" and a dam-specific description, then renders
`ConditionsPage` with `defaultKind="dams"`. Live, the page's H1 is
"Conditions", the intro sentence summarises river conditions, and the body is
the same explorer `/rivers` renders. For a searcher the title promises
something the page does not say in its own words, and for a crawler `/rivers`
and `/dams` are near-duplicates with different canonicals.

Recommend a real index: an H1 that matches the title, two or three sentences
that say what a generation schedule is and where the data comes from, the dam
groups `dam-grouping.ts` already defines (home states first, locks and dams
last), the trout tailwaters called out, links to the three tailwater rivers,
and a short FAQ (hour ending, minimum flow, "no generation does not mean no
water"). The explorer can stay below it. This is the one page that can rank
for the category queries the per-dam titles cannot.

### P2 — no content and no internal links support the dam pages

The per-dam titles and descriptions are now specific and good. Around them:

- Zero blog posts mention a dam, a tailwater, generation or Taneycomo.
- A dam page links to `/dams`, to one river for four dams, to a phone number
  and to the app. It does not link to the dam upstream or downstream of it
  (Beaver → Table Rock → Bull Shoals → Norfork is one river system), to the
  tailwater's access points or outfitters, or to any explanation of how to
  read the schedule.
- Every dam shares one Open Graph illustration except Bagnell. The embed layer
  already renders a `dam-strip-image` of today's schedule per dam; a share
  image that shows today's bars would make a shared dam link distinct and
  current.
- The About paragraph is unique per dam but two sentences; it could carry the
  tailwater fishery, the river below, the nearest town and the access points
  Eddy already has for the three live tailwaters.

Three explainer posts ("How to read a SWPA generation schedule", "Wading the
White below Bull Shoals: what the schedule does and does not tell you", "Why
Taneycomo rises hours after Table Rock starts") interlinked with the dam pages
would be the cheapest search investment in the repository, and they are the
kind of content the dam pages' titles already set up.

### P2 — Eddy's Read wording: "quiet most weekends" at two of four

`dam-read-facts.ts` `patternSentence` takes the `!mostlyGenerating(p)` branch
whenever generating days are not a strict majority, so a weekend pattern of 2
of 4 days renders "The dam's been quiet most weekends lately, generating on 2
of the last 4 weekend days." Four of the five Reads written on 2026-11-08
carry exactly that sentence. Add an "about half" branch, or require a strict
minority before saying "most".

Two smaller Read observations from the same rows:

- A 14-day window holds only four weekend days, so `consistent` is false for
  every weekend pattern in production and the weekend Read always falls back
  to "quiet most weekends" or "all over the place". Either widen the weekend
  window (the last six weekend days, say) or say "weekend history is too
  short" rather than implying a pattern was looked for and found scattered.
- The whole Read is Premium on the web, and the web has no way to buy
  Premium. The locked card's only job is app acquisition, which the
  `app_landing_click` event can measure. If that click rate is negligible,
  consider publishing the one-line takeaway headline on the web (as the river
  Reads do) and keeping the story and track record Premium: it is unique,
  daily text on a page that otherwise changes only in numbers, and it is the
  part a searcher for "is Table Rock generating today" came for. This is a
  change to ADR 0017 decision 7 and should be decided, not drifted into.

### P3 — observability gaps in the snapshot and Read crons

From the pipeline review, each verified against the code:

- A lock failure is recorded as a healthy run. `sync-dam-snapshots` and
  `generate-dam-updates` return `{ skipped: '<string>' }`, and the job model
  recognises only `skipped === true` or `monitoring_status`. A broken
  `try_cron_lock` RPC would silence both jobs while the dashboard shows `ok`.
  `sync-dam-history` does this correctly.
- `sync-dam-snapshots` can never be `partial`: `keptOnOutage` equal to the dam
  count or a failed forecast-history write both return `ok: true`.
- No trust check covers `dam_snapshots`, the SWPA fetch, or snapshot-only
  metrics (pool, tailwater temperature). A renamed `Temp-Water` series is a
  404 in the logs and nothing else.
- A mid-day SWPA revision reaches a reader about two hours later at worst
  (SWPA cache, 30-minute revalidate, hourly cron, stored-first routes, CDN
  900 s / 3600 s). Acceptable if stated; the "may be outdated" banner at 90
  minutes already fires on an unchanged daily sheet because of the same
  layering.
- The forecast hash still churns inside a running window: `peakCfs` is
  recomputed over the remaining hours, so passing the peak hour mints a new
  LRN "version" with no district change (136 Wolf Creek versions in four
  weeks). The SWPA hash includes all three dates, so Central midnight mints a
  version per dam per day. Both inflate ADR 0013's record and both are cheap
  to exclude.
- `readMetrics` stamps the requested unit, not the response's `units`; a CDA
  change that ignored `unit=` would mislabel rather than drop.
- The history window's left edge starts mid-hour, so a sub-hourly series would
  overwrite a complete first bucket with a partial one. Harmless while every
  recorded series is hourly; the resolver admits `15Minutes` for
  `generationFlow`, so note it.

### P3 — shared schedule logic, smaller holes

From the shared-logic review, each reproduced with a scratch input:

- `generationNow` (`dam-generation.ts:240`) treats a missing floor as zero
  unconditionally, though its comment says "only when the reading is
  unambiguous"; 20 cfs of leakage on a dam with no `generationFloorCfs` reads
  "Generating now". Unreachable today because every turbine dam declares a
  floor; reachable by the next registry entry.
- `readingStaleness` (`dam-schedule-copy.ts:644`) calls a future-stamped `at`
  fresh forever; the widget guards against a clock skew of five minutes
  (`dam-widget.ts:11`), `generationNow` does not.
- `isRamp` for hour ending 1 compares against hour 24 of the same day
  (`swpa.ts:297`), so a day that starts at full load after an idle day prints
  a cfs estimate for its first hour, and that hour can become the day's peak.
- `dam-widget.ts:56`: when today's file failed but tomorrow's is present, the
  widget says "No upcoming schedule posted", which denies a posted schedule.
- The 90-minute "may be outdated" threshold (`dam-schedule-copy.ts:705`) is
  tighter than the real chain (about 115 minutes), so a healthy pipeline shows
  the badge for some minutes every hour.
- Today's pattern row draws every completed hour without a stored bucket as
  "missing" (`dam-generation.ts:1498`); with an hourly history cron the last
  one or two hours are nearly always drawn as an outage. A "not yet synced"
  treatment would be more honest. A stored snapshot built before Central
  midnight also has no today row until the next cron.

### P3 — iOS dam surfaces

From the iOS review, each pointing at a line:

- `dam/[damId].tsx:243–253, 345–351`: any throw becomes "Couldn't load this
  dam. Check your connection", including a 404 for a removed dam.
- `damReadFreshness.ts:14–19` + `DamEddyRead.tsx:88–92, 177–178`: at every
  hour boundary the Read is treated as not current until the 15-second poll
  refetches, so members see a skeleton and the teaser unmounts briefly each
  hour; a failed refetch then discards the previously good Read. ADR 0017 §6
  asks for the discipline; the blink is the cost of the implementation.
- `SupplementaryWidgetData.swift:24–29`: the widget formats "Observed" in the
  device zone beside "Schedule · CT"; a non-Central user sees two clocks on
  one card.
- `shared/dam-widget.ts:55–57`: `scheduleSummary` is computed and shipped but
  never drawn by `EddyReportWidgets.swift`.
- Bar scale differs by surface: the widget and the Favorites card scale to the
  day's own peak, the dam screen to the SWPA reference. Documented as a
  choice in the iOS README; worth revisiting now that the web scales every
  surface to the reference.
- `dam/[damId].tsx:628–643` says the release-alert button is "Clearwater
  alone"; the registry now sets `tailwater.gaugeSiteId` for Table Rock, Bull
  Shoals and Norfork too. The button routes them to a gauge alert on the dam's
  own release station; whether the evaluator ingests those stations end to end
  was not verified here.
- No universal-link mapping for `/dams/[damId]`; a shared dam page link never
  opens the app.
- The widget picker matches on name and state; the catalog carries no lake
  name, so "Taneycomo" finds nothing while in-app search matches lakes.
- Both iOS catalogs (`DAM_CATALOG`, `DamWidgetCatalog.json`) are pinned to the
  registry by web tests and currently match; no drift.

### P3 — carried over from the August review, still open

- Mark Twain and Bagnell have no turbine history (Bagnell's hourly discharge
  is fetched for display and not recorded).
- `releaseExcludesGeneration` is unset everywhere; Keystone's two series were
  byte-identical for 100% of measured hours and still render as two facts.
- `rivers.controlling_dam_id` remains NULL on every row and used by nothing.

### Tests

The 22 dam test files were run in this sandbox: 329 assertions passed and
seven files failed to **load** because the container has no Node 20 and no
installed `node_modules` (`@supabase/supabase-js`, `@electric-sql/pglite`);
`bootstrap.sh` refused for the same reason. No assertion failed. CI on `main`
is the authority for green; nothing here contradicts it. Every finding above
that names a line was checked against the file, and the schedule-logic
findings were reproduced with scratch inputs rather than inferred.

## 4. What is working well

Worth stating so the list above is read in proportion:

- The freshness discipline is unusually good. Every reading carries its own
  observation time; staleness is re-banded on the serving clock; the stored
  snapshot ages out after three hours; `retrievedAt` comes from the response
  `Date` header, never the clock; the pattern strip draws observed, scheduled
  and missing hours three different ways.
- The November page work was right: per-dam titles that lead with what the
  page uniquely offers, canonical and Open Graph metadata on every public
  page, breadcrumbs and a correctly typed `CivicStructure`, per-request render
  so Today is the reader's day, 0.25–0.65 s TTFB from the stored snapshot.
- The Read is written by code from computed facts (ADR 0017). The production
  rows read well, the track record numbers are real, and nothing in them can
  say what the hours do not.
- The history that cannot be backfilled is now watched, and the watcher has
  already paid for itself twice.
- Floors, minimum flow and spillway flow are measured from the district's own
  series and documented with dates; `hasPowerhouse` separates the plant from
  the schedule.

## 5. Where to invest, in order

Ordered by leverage against the signals Eddy has, cheapest first within a tier.

1. **Close the two P1s.** Carry the stored schedule when the live one is
   empty; rewrite the posting-time copy on both platforms; add the posting
   hour to the admin dashboard. Half a day, and it removes the one way the
   pages can currently tell a reader something false.
2. **Make `/dams` a dam page.** Title-matching H1, intro, grouped dams, FAQ,
   links to the three tailwater rivers. One page, and the only one that can
   rank for the category queries.
3. **Write the three explainer posts and link them** from the dam pages and
   the index; add sibling-dam links for the White River chain; give the dam
   pages a share image that shows today's bars. These are what turns the
   title rewrite into traffic.
4. **Notify starred dams.** `TAILWATER_PLAN.md` step 6: "tomorrow's schedule
   is posted" and "generation starts in the next hour" for the 21 stars, using
   the schedule hash the snapshot cron already computes. Bull Shoals and Table
   Rock stars are the warmest retention signal Eddy has, and winter is when
   the trout tailwaters fish best and float demand collapses. Small audience
   today (8 device tokens); the point is to have it before the audience grows.
5. **Decide the Read's public line.** Measure the locked card's click-through
   first. If it is negligible, publish the headline on the web and keep the
   rest Premium.
6. **Fix the P2 logic items and the P3s in one pass**: the iOS age-blind chip
   and pin, the "no more releases" wording, the DST enumeration, the Read's
   "most weekends" branch, lock-failure reporting, a `partial` outcome for the
   snapshot cron, a trust check on the SWPA fetch and snapshot metrics, the
   forecast hash, the iOS 404 and widget clock.
7. **Then, and only then, lag calibration** (`TAILWATER_PLAN.md` step 1). It
   is the feature nobody else publishes and the one with real liability, and
   it needs the measurement script to say yes before anything is designed.

Not recommended now: adding dams. SWPA is exhausted, Kansas City publishes
nothing, the Vicksburg candidates publish daily manual flows only, and TVA
needs the time-zone work and an eastern reach. The 24 dams already carried are
more than the content and linking around them can support.
