# Camping UX plan (iOS)

Status: proposed, October 2026. Follows a UX review of the iOS Camping tab
(`eddy-ios/app/(tabs)/(today,map,floats,favorites,alerts)/camping.tsx`, the
campground sheet in `CampingDetailSheet.tsx`, and the map sheet's camping tab in
`map-sheet/AccessTabs.tsx`).

Two review items already shipped on `claude/sharp-lamport-yid38c`:

- **Sort and distance (review #3).** The Camping tab has a Sort chip with three
  options: By river, Nearest, and Most open. "Most open" ranks by one named
  night (the night List view shows), and the chip says which: "Sort: Most open
  · Sat, Oct 10". It never sums a weekend, because 20 Friday-only openings would
  outrank 5 on both nights. Ranking by a whole stay waits for #2's same-site
  matching. Nearby defaults to Nearest. Choosing Nearest without location uses
  the same pending, failure (Open Settings / Retry) and superseded-request
  handling as Nearby, in `campingFilterReducer`.
  Each row shows "≈ 18 mi", or "Under 1 mi" when it's that close. The logic is
  `orderCampingRows`, `campingOpenings` and `campingMilesLabel` in
  `src/lib/campingHeatmap.ts`.
- **Site-type filters in the Camping tab's campground sheet (review #4).** These
  are the map sheet's Tent / RV / Electric / No hookup / Walk-in / Group chips,
  applied to the whole stay. A selected chip stays visible at zero when dates
  change, with "No electric sites available for these dates" and Clear
  filters, so the user's requirement is never silently dropped. The map sheet
  uses the same rule (`siteFilterChips`). The logic is `filterCampsiteStays` and
  `campsiteStayFilterCounts` in `src/lib/campingStay.ts`.

The rest of this document plans review items 1, 2, 5, 6, 7 and 8.

---

## Constraints that shape every plan

1. **Availability syncs once a day.** `sync-availability` runs from 09:00 to
   11:30 UTC (4–6:30am Central) in `vercel.json`, split into slots per source.
   Every "open" Eddy shows is up to about a day old.
2. **Recreation.gov asks for a 10-second crawl delay** and disallows `/api` in
   robots.txt. `src/lib/camping/limiter.ts` honors that serially and on purpose.
   That gives a budget of roughly 6 federal requests a minute, or about 360 an
   hour. Any plan that polls more often has to fit inside it. UseDirect (Missouri
   State Parks) publishes no limit, and we keep it at the same politeness.
3. **The tracked window is 90 nights.** The overview fetches 21 nights first and
   then extends to 90. Per-site data is fetched per facility and window.
4. **The pieces already exist.** Push delivery (`src/lib/push/expo.ts`, the
   `deliver-push` cron), device tokens, alert subscriptions with one-shot
   semantics (`alert_subscriptions.one_shot`, `fired_at`), quiet hours, and
   subscription entitlements (`useAccount`).
5. **Every migration follows the ledger rule in `CLAUDE.md`**
   (`supabase/production-migrations.txt`). Nothing touches production without
   explicit sign-off.

---

## 1. Cancellation and opening alerts ("Watch this campground")

### What exists elsewhere

- **Recreation.gov has its own Availability Alerts.** The official feature
  emails your Recreation.gov account when a cancellation at a campground
  matches your dates and filters. Limits: email only, campground-level (you
  can't watch one specific site), and the same alert goes to everyone watching
  those dates, so it's first come, first served.
  ([help article](https://help.recreation.gov/helpcenter/en/camping-availability-alerts?id=kb_article&sysparm_article=KB0011970))
  Missouri State Parks (UseDirect / icampmo) has no equivalent that we know of.
- **Campnab** scans more than 7,000 campgrounds (federal, state, provincial)
  and alerts by text. It costs about $10–30 a month, or you can pay per search.
- **Campflare** is free and covers national parks, state parks and Forest
  Service campgrounds, with real-time push alerts.
- **Arvie** is RV-only, mostly private RV parks, about $20 a month, and offers
  "insta-book".
- **Campsite Tonight** adds the opened Recreation.gov site to your cart.
  **Campsite Notifier**, **Outdoorithm** and **OpenCampsite** are similar.
  Outdoorithm advertises 15-minute free scans and 2-minute paid scans.
  ([overview](https://happiestoutdoors.ca/camping-cancellation-apps/),
  [Outdoorithm](https://outdoorithm.com/campground-alerts),
  [Campsite Tonight](https://campsitetonight.app/recreation-gov-cancellation-alerts))

**What this means for Eddy.** The generic "alert me on a sold-out campground"
market is crowded, and its leaders poll every few minutes. Eddy shouldn't try
to win on raw speed against Recreation.gov's crawl-delay. Eddy's edge is
**context**:

- It already knows the float: "your put-in is Akers on Saturday, so watch
  Pulltite for Friday night."
- It covers Missouri State Parks, which Recreation.gov's own alerts don't.
- It can bundle a campground alert with a river-condition alert: "tell me if a
  site opens **and** the Current is floatable."

### UX

- **Entry points:**
  - The Camping tab's campground sheet. When nothing is open for the stay, the
    call to action becomes **Watch for openings**, next to "Check park
    reservations".
  - The map sheet's camping tab, for a booked-out night.
  - The planner's endpoint camping panel ("Nothing open near the take-out ·
    Watch").
- **Setup sheet:**
  - Stay dates, prefilled from the picker.
  - Site types, reusing the same chips (Tent, Electric, …).
  - Minimum nights: the whole stay or any night.
  - Optional: "also tell me if the river is floatable".
  - One watch can cover several campgrounds, e.g. "any campground on the
    Jacks Fork, Fri–Sat".
- **Where watches live:** a **Watches** section in the Alerts tab, listing each
  watch with its state (Watching, Found, Expired) and the time it was last
  checked.
- **The push:** "2 sites opened at Alley Spring for Fri Oct 9 – Sun Oct 11.
  Book before someone else does." Tapping it opens the campground sheet with
  those dates applied and the matching sites first. The **Book site** button
  deep-links to the exact site on Recreation.gov, or to the park page for state
  parks.
- **Honest copy:** state the cadence Eddy has actually measured ("Eddy checks
  about every N minutes"), never a target. Openings often go within minutes,
  so say "book right away". Never promise a booking.
- **For federal campgrounds:** add a secondary link, "Also set a Recreation.gov
  alert", that opens that campground's page. It's free redundancy and
  acknowledges their official tool.
- **Expiry:** a watch ends at arrival day, or once it fires, if the user picked
  one-shot (the default).

### Backend

- **New table `campsite_watches`:** `user_id`, `facility_ids uuid[]` (or a
  river id), `arrival`, `departure`, `site_filters text[]`, `whole_stay bool`,
  `with_river_floatable bool`, `one_shot`, `fired_at`, `last_matched_at`,
  `expires_at`. Row-level security matches `alert_subscriptions`: you can only
  see or change your own, and you need a permanent account.
- **New cron `evaluate-campsite-watches`:**
  - Reads only the facility and month pairs that have active watches.
  - Fetches them through the existing limiter, serially at 10 seconds per
    federal request.
  - 360 requests an hour is a theoretical ceiling, not a budget. It leaves no
    room for request duration, retries, backoff, the nightly sync and growth.
    Before committing to a cadence or watch limits, run a complete polling
    cycle against the real watched set, measure its wall-clock time and
    failure rate, and set the cadence and caps with headroom from that
    measurement. Eddy tracks 30 federal and 6 state facilities today.
  - Writes into `campsite_site_availability` (which also keeps the per-site
    sheet fresher), then diffs against the previous state for each watch.
  - Fires through `alerts/fanout.ts` and `deliver-push`.
- **Dedupe:** fire once per watch per "new opening set". Don't re-fire when the
  same site stays open across cycles.
- **Quiet hours:** always respected by default. A watch can carry an explicit,
  user-chosen "notify me even during quiet hours" switch (off by default),
  offered in the setup sheet. Nothing overrides quiet hours automatically,
  including an arrival date that is close.
- **Kill switch:** use the `push/kill-switch.ts` pattern, plus a per-source
  circuit breaker. The limiter already self-silences on repeated failures.

### Product and gating

- A free tier gets **one active watch**. Premium gets a higher, bounded number
  of watches, plus multi-campground and river-wide watches and the
  river-condition combo. Set both limits from the measured polling cycle
  (above), and don't advertise "unlimited". This fits the "notify me" funnel
  `alert_subscriptions` was built for.
- **Telemetry:** watches created, fired, and opened-to-booking tap-through
  (push open → Book tap).

### Phases

1. Table, cron and push for single-campground, single-stay watches, federal and
   state.
2. River-wide and multi-campground watches, the planner entry point, and the
   river-floatable combo.
3. Smarter cadence: check more often for nights within 7 days, and less often
   for nights 60+ days out.

### Risks

- **Rate budget.** Mitigated by watch-driven fetching, the existing limiter,
  and caps set from a measured cycle rather than the theoretical ceiling.
- **Expectations.** Mitigated by honest latency copy.
- **Recreation.gov's API is undocumented.** It's the same exposure the nightly
  sync already carries.

---

## 2. Search by stay across campgrounds

### Problem

The real question is "where can I stay Fri–Sat?", but the Camping tab answers
one night at a time (List) or as raw counts per night (Grid). The overview's
per-night counts can't answer "is one site free both nights?". Three open
Friday and two open Saturday may be five different sites.

### UX

- **A stay control at the top of the Camping tab:** "Any dates" by default, or
  "Fri Oct 9 – Sun Oct 11" after picking. It reuses `CampingStayPicker`.
- **With a stay set:**
  - Rows show "4 sites for your whole stay", or "Open some nights only".
  - A toggle, **Only show available**, hides the rest.
  - The site-type chips from review #4 move up to the screen level here, as an
    optional step.
  - The stay carries into each campground's sheet, which already accepts
    `initialStay`.
- **Grid view:** shade the chosen stay columns and scroll them into view.

### Data

- **New endpoint `GET /api/camping/stay?arrival&departure&types=`.** It returns,
  per tracked facility, `{ wholeStay: n, someNights: n, checkedAt }`, computed
  server-side from `campsite_site_availability` (per-site, so "the same site
  every night" is exact).
  - It's cheap: one SQL aggregate over at most 90 nights by about 40
    facilities, with a short CDN cache keyed by query.
- **Alternative:** fetch per-site data client-side for the visible campgrounds.
  Rejected because it means N requests and slow scrolling.
- **Pure logic:** `src/lib/campingStaySearch.ts` (row state and copy), tested in
  the web suite like the rest.

### Phases

1. Endpoint, stay control, row copy and the "Only show available" toggle.
2. Type chips at the screen level, and grid column highlighting.
3. Today's camping card: "Your saved stay: 3 campgrounds have sites."

---

## 5. Bring the Camping tab's campground sheet up to the map sheet

### Problem

`CampingDetailSheet` shows the name, dates, map and website, then the sites.
The map sheet's camping tab shows much more:

- The site mix (`siteMixLine`)
- How you get a site (`bookingLine`)
- Amenities
- Fees and the NPS reservation prose
- An official booking button

The sheet also has no Directions, no Share, no distance, and no way to save the
campground.

### UX (top to bottom)

1. **Header:** photo, name, "≈ 18 mi · Current River".
2. **Action row:** Book (the main button), Directions (reuses the app's
   directions chooser), Share, and Save (a star).
3. **Stay picker, type chips (shipped), and sites.** Unchanged.
4. **About:** site mix, "42 reservable · 10 first come", amenities chips
   (water, showers, toilets, dump station, cell reception, firewood), fees,
   and season/operating hours. All of these come from `campgroundFacts.ts`, and
   empty fields are hidden, never printed as zeros.

### Implementation

- Extract the map sheet's facts block from `AccessTabs.tsx` into a shared
  `CampgroundFacts` component that both sheets render.
- Source the facts from `TrackedCampground`. The overview has no NPS summary
  today, so either:
  - **(a)** add a slim `facts` object to the overview payload (the site mix,
    amenities and fees already sit server-side in `getNPSCampgroundInfo`), or
  - **(b)** lazy-load `/api/access-points/{id}` when the sheet opens. This only
    works where `accessDestination` exists.
  - Prefer (a), behind a schema-compatible optional field.
- **Share:** a deep link `eddy.guide/camping?facility=…&night=…`. The Camping
  route already reads `facility` and `night`. Add a matching web page, or
  redirect to the river page.
- **Save:** extend starred items with `kind: 'campground'`. Make sure
  `useStarredRivers` and server reconciliation accept the new kind. Then the
  Favorites filter becomes "Saved rivers and campgrounds".

### Phases

1. Shared facts component, Directions, Share.
2. Save campground, Favorites integration, and the overview `facts` field.

---

## 6. Connect camping to the float

### UX

- **River headings on the Camping tab** carry a conditions badge: "Current
  River · Good · 410 cfs", reusing the shared condition system and the existing
  river conditions data on Today. Tapping it opens the river.
- **Each campground** shows its access relationship: "Put in at camp" when
  `accessDestination` is the campground's own access, otherwise "Nearest access:
  Pulltite · 0.3 mi".
- **"Plan a float from here"** in the campground sheet opens the planner with
  this access point as the put-in or take-out. The planner already accepts a
  focused access point.
- **Weekend weather** in the stay picker: highs and lows plus a rain icon per
  night, from the weather source Today already uses.
- **The reverse direction:** the planner's endpoint camping panel already
  exists. Add "See all camping on this river" to open the Camping tab scoped to
  that river and night (the `river` and `night` params exist).

### Implementation

- Join river conditions client-side. Today and Map already load river
  conditions, so reuse the cached river list hook keyed by `riverSlugs`. That
  avoids changing the CDN-cached overview.
- Nearest access needs campground → access-point distance. Compute it
  server-side once in the overview build (cheap, static) as
  `nearestAccess: { slug, name, miles }`.
- Keep the copy honest: "Conditions now". Never imply a forecast for the stay
  dates.

### Phases

1. Condition badges, "Plan a float from here", and "See all camping".
2. Nearest-access field and weather in the stay picker.

---

## 7. First-come and gravel-bar camping

### Problem

Much Ozarks float camping is first-come campgrounds and free gravel-bar
camping (e.g. on the Ozark National Scenic Riverways). The Camping tab only
tracks reservable inventory. Untracked campgrounds sit in a collapsed "More
campgrounds" footer with a name and a "Check ↗" link. Gravel bars appear only
as map pins (`access_points.types` includes `gravel_bar`).

**Untracked does not mean "no reservation needed".** It only means Eddy has no
availability feed for that campground. Many untracked campgrounds still take
reservations. First-come is a separate, verified fact: `firstCome: 'present'`
on the row.

### UX

- **Split the footer by what Eddy actually knows:**
  - **"First-come campgrounds"**: only rows with `firstCome: 'present'`. Each
    shows a photo, name, miles, "First-come", the fee if known, and
    Directions.
  - **"More campgrounds · Check with campground"**: every other untracked
    row, as today, with miles and Directions added. No claim about how to get
    a site.
- **A "Gravel bars" subsection per river:** named gravel-bar access points with
  river mile and nearest access. Tapping one opens it on the map.
- **A short guidance card per river, from editorial data:** typical fill times
  ("first-come sites at Two Rivers fill by Friday noon on summer weekends"),
  gravel-bar rules (ONSR permits gravel-bar camping, but you must stay a set
  distance from developed sites and follow fire rules), and water rising after
  rain. Use the existing safety copy rules and the trust gate. No unsourced
  claims.
- **Optional, later:** crowd signal for first-come sites, using the existing
  community reports pattern ("Full at 2pm Sat").

### Data and implementation

- Untracked rows already carry `firstCome`, `location` and the website. Add NPS
  fees where available.
- Serve gravel bars to the Camping tab with a small `gravelBars` array per
  river in the overview, or reuse the map's access-point layer data.
- Guidance copy belongs in the river knowledge base (`src/lib/eddy/knowledge`)
  with sources, so it passes the trust checks rather than being hard-coded in
  the app.

### Phases

1. The verified first-come section and the "Check with campground" list,
   with distance and directions.
2. Gravel bars per river.
3. Sourced guidance cards.

---

## 8. Smaller polish

| Item | Change | Where |
| --- | --- | --- |
| Price | "$" to "$$$", or "Free", from NPS `fees` (federal). State parks: a static fee table per site kind, kept with the park facts. | Overview `facts`, both sheets, grid name cell |
| Stale rows | "Needs update" becomes "Checked 2 days ago" | `CampingTableRow`, `campingRowNeedsUpdate` + `checkedLabel` |
| Next opening in List view | "Next opening: Sat 14" under each row whose selected night is full (the logic exists in `campingRowSummary`) | `CampingAvailabilityRow` |
| Reservable-only disclosure | Move "Reservable sites only" from the footer into the coverage caption at the top | `camping.tsx` header |
| Dead ends | When a stay has no openings: "3 other campgrounds on this river have sites" (from #2's endpoint) plus Watch (#1) | `CampingDetailSheet` empty state |
| Empty filters | "No campgrounds match these filters" gains a "Clear filters" action | `camping.tsx` footer |
| Hookup detail | State parks list 102 "Sewer/Electric/Water" and 76 "Electric/Water" sites; today both tag only Electric. Add two distinct tags and chips: **Full hookup** (sewer, electric and water) and **Water + electric** (no sewer). Never give Electric/Water the Full hookup label. Both keep the Electric tag so the Electric filter still matches them. | `siteList.ts` `TYPE_TAGS`, `SITE_FILTERS` |

All of these are small and independent, so ship them as one PR, or fold each
into the plan item it touches.

---

## Suggested order

1. **#8 polish and #5 phase 1.** Low risk, pure client work, uses existing data.
2. **#2 stay search.** One endpoint, high value, and it sets up #1's matching
   logic.
3. **#1 alerts phase 1.** The biggest differentiator. Builds on #2's per-site
   stay query.
4. **#6, then #7.** Context and coverage, after the core camping loop is solid.

Validation for every item: `make check-web`, `make check-mobile`,
`make bundle-mobile`. Run `make check-db` after any migration is applied.
