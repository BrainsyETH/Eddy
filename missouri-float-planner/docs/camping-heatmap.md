# Camping heatmap implementation and rollout

## What this branch adds

- Read-only `/api/camping/availability`: facility-first catalog, sparse per-night observations, 300/300 edge cache, and complete paginated reads. No provider calls from user requests.
- A four-row Today card and `/camping` expanded screen. Location stays on the phone; nearby means 120 straight-line miles, with a separately labeled saved-river/regional fallback.
- Twenty-one-night Today and ninety-night full-screen scrolling comparisons, absolute opening-count shades, distinct availability states, and a monthly campground calendar, external booking links, and optional map destinations.
- On-demand individual site lists in the expanded screen and service callouts. Site responses are cached briefly for up to eight facilities. No eager per-row site fetches.
- Date windows shared between server and phone. Cached catalogs roll forward at Chicago midnight; newly uncovered nights remain unknown.

## Findings that changed the plan

Availability history is pruned seven days behind the current date. An empty retained history cannot prove never observed. The response therefore uses `fresh`, `stale`, and `unknown`, with “No recent observations” rather than “Never checked.” `last_synced_at` is not used as an observation timestamp.

Fresh means at least one current-horizon valid observation; every cell separately checks `checkedAt` against `maxObservationAgeSeconds` (72 hours). The feature never promises one site for an entire stay. The heatmap uses absolute count buckets (1–2, 3–9, 10+) and an explicit “No reservable sites” detail status for checked nights with zero reservable inventory. These observations retain their timestamps and freshness without implying first-come availability. Existing map strips retain their original colors, proportional fills, and status semantics. Owner design decision (September 28, 2026): both camping surfaces use green for openings and red outlines for booked-out nights. The heatmap uses three solid theme-aware green shades for count buckets, not opacity; the map strip retains proportional fills.

There is no general NPS-only detail route or service callout deep-link route. Their campground detail sheet provides the calendar, sites, website, and booking destination. Verified access-point destinations open the existing map using its supported focus parameters; this does not force a particular map-sheet tab.

First-come notes come from `nps_campgrounds.sites_first_come`. No permanent first-come claim is inferred from a transient walk-up site status. Booking links do not add date parameters. The three district booking pages were verified at Recreation.gov:

- https://www.recreation.gov/camping/campgrounds/10344948
- https://www.recreation.gov/camping/campgrounds/10344874
- https://www.recreation.gov/camping/campgrounds/10344920

Loop links use their curated source facility ID and explicitly say Book through district permit.

## Rollout flag

The existing app-config table uses fixed boolean columns, not a generic JSON flag map. To avoid a schema migration for this staged release, the server adds `features.campingHeatmap` from the server-only `CAMPING_HEATMAP_ENABLED` environment variable. Only the exact string `true` enables it. Missing config, errors, older API responses, and malformed client flag values leave it off.

The heatmap is activated by `env.CAMPING_HEATMAP_ENABLED: "true"` in `missouri-float-planner/vercel.json` following owner approval on September 28, 2026. This non-secret deployment setting is version-controlled. To roll back, change that value to `"false"` and deploy; do not rely on removing a dashboard variable while the repository still sets it. Compatible iOS builds must contain PR #1344. Clients refresh config at startup and on return from background; there is no periodic timer. The existing app-config CDN policy is 60/300 seconds, so a foreground fetch can still see cached configuration. Rollback reaches an active session on a subsequent foreground refresh after caches expire, not immediately while it remains open. The forced-upgrade decision is fixed by the initial config result until the next launch. Failed config fetches clear enablement. Unrelated core defaults remain unchanged.

The flag gates both Today and direct entry into `/camping`, plus the service-callout site feature. The additive read-only API can remain deployed while UI is disabled.

## Verification

A read-only run of the actual loader using public Supabase permissions returned:

- 36 tracked campground facilities, all with usable coordinates.
- 35 with some fresh horizon data; one remained visible without observations.
- 49 untracked directory entries.
- 34 tracked booking links; missing links fall back to available campground information.
- No enabled aggregate-plus-loop overlap in the inspected catalog.

These are a September 28 UTC snapshot, not hard-coded coverage expectations. No database records were changed. The four newly added state parks remain untracked until their separate provider integration is completed.

Tests cover type parity, aliases, loop overlap, source states, expiry boundaries, missing dates, midnight/DST, nearby scope, count buckets, database failures, pagination, and fail-closed flag normalization. Tests are registered in the web package's explicit test script.

Before release, perform real-device QA for light/dark themes, large text, VoiceOver, low bandwidth, denied location, return from background, and long expanded site lists. Automated bundling is not a substitute for these checks. In particular, visually verify the shared date headings, heatmap status symbols, expanded-row scrolling, and return-to-map behavior.

Enabled loops take precedence over an overlapping aggregate from the same provider facility. The aggregate is excluded with a structured warning, and the remaining catalog is served. The detail sheet presents a monthly calendar; each selected night drives the individual site list. Service callouts use their known facility ID directly; only missing IDs require a catalog lookup.

## Compact comparison UI

Today shows four campground rows under one month/date ruler, titled Camping with a Through [date] coverage label. Both Today and the full screen use the same row component and the existing schedule's green openings/red booked-out outlines. There is no legend. Locked cells mean fully booked; a clock means booking has not opened; a faint neutral dash means unknown in comparison grids. Calendar dates without fresh observations have muted numbers and no mark. Closed nights and nights with no reservable inventory share a neutral dash in the compact grid, with distinct exact statuses in details and VoiceOver. Today identifies the selection as Nearby, Saved Rivers, or Across the Ozarks.

The full screen is a single list with a pinned date ruler. River filters use curated display names and only rivers with tracked campgrounds. River and Nearby filters intersect; Nearby means 120 straight-line miles and requests location only on a tap. Untracked campgrounds remain available in a collapsed directory using the same filters.

The footer uses the oldest current observation in the visible rows: Updated at [time] for today, otherwise Updated on [date], in America/Chicago. It always includes Reservable sites only. Rows with no current horizon observations say Needs update. Missing individual nights retain their unknown marks. No repeated row summaries or per-row timestamps are shown.

A row opens a native page sheet directly from either surface. The sheet opens on the first weekend night within the horizon, falling back to tonight. It contains a month calendar, selected-night counts, the observation timestamp, a primary Book campsite action when a booking URL exists, secondary map/website actions, and a site list fetched automatically when the sheet opens (using the existing five-minute cache). Loop booking destinations retain the district-permit explanation. Closing preserves the grid and its filters. The existing map camping schedule is unchanged.


## Ninety-night planning coverage

The scheduled sync uses `PLANNING_NIGHTS = 90`. The scrolling client requests
`/api/camping/availability?nights=90`; requests without that parameter retain
fourteen nights so already-shipped fixed-grid builds remain usable. Existing map-strip
readers retain the default fourteen nights. Missing provider dates remain unknown;
scrolling does not imply a date has been checked or released for booking.

Both comparisons keep names fixed and synchronize the header and row scroll offsets.
The full list retains its sticky header and virtualization. The campground sheet
pages through calendar months within the returned horizon; past and out-of-range
dates are disabled. Choosing a night updates the list beneath it. Site rows use the
existing individual-site photo loader, never substitute a campground photo for a
site, and show their available type/loop/occupancy data.

`/api/campsites?facility=<id>&month=YYYY-MM` reads only that month's cached data,
clipped to the next ninety nights. The month is validated before querying. Omitting
it preserves the existing fourteen-night response. The app caches up to eight
facility/month responses for five minutes and discards late responses on selection
changes. Expired site observations become unknown without hiding fresh dates in the
same month. All database reads remain paginated and all provider reads remain cron-only.

Recreation.gov fetches each touched calendar month with the existing shared permit
cache. A missing later month does not erase earlier observations. Missouri discovers
loops separately each month and fetches month-sized grids. A discovery date's
`InSeason=false` establishes closure for that date only; it is not stretched into a
three-month closure. Its boolean grid still cannot distinguish a taken site from a
seasonal closure on later dates. Live expanded-range verification from this workspace
was blocked by a provider HTTP 403; do not claim every park supplies all ninety nights.

Six spaced federal cron slots and three Missouri slots drain the existing facility
queue. Facilities attempted successfully on the current Chicago date are skipped by
later slots. Provider pacing and request ceilings are unchanged. The worker stops
starting new facilities after three minutes; provider requests and retry delays stop
at four minutes, leaving time to write before Vercel's five-minute ceiling. Interrupted
facilities keep their cursor and are retried in a later slot.

Deployment requires both the API/cron changes and a mobile build. No schema migration
is needed. After deployment, let the scheduled slots populate the longer range and
verify per-provider maximum observed date, fresh-night counts, sync failures and queue
remainder. Do not treat the UI's ninety-night horizon as proof of a completed backfill.


Read-only pre-deployment check on September 28: fresh stored availability still
ends October 11 for both providers (29 federal facilities / 406 nights and six
Missouri facilities / 84 nights). This is the existing fourteen-night dataset,
not a ninety-night backfill. Re-run this check after deployment:

```sql
select f.source, count(distinct a.facility_id) as facilities,
       min(a.date) as first_date, max(a.date) as last_date, count(*) as fresh_nights
from public.campsite_facilities f
join public.campsite_availability a on a.facility_id = f.id
where f.enabled and a.fetched_at >= now() - interval '72 hours'
  and a.date >= (now() at time zone 'America/Chicago')::date
group by f.source;
```

## Review refinements (September 28)

Today requests `nights=21`, with a separate cache from the 90-night planning view.
Opening a campground requests the longer overview on demand, retaining the short
calendar while it loads. Existing clients that omit `nights` still receive 14.
Both comparison grids trim only the trailing dates with no fresh observations in
any displayed campground. Internal gaps remain unknown. Headings say `Through
[month/day]`, or `No recent availability` when the range is empty. The campground
calendar retains its full supported planning horizon.

Scrolling uses Reanimated shared values, native scroll handlers and UI-thread
`scrollTo`; no JavaScript loop sends commands to every mounted row. Newly mounted
rows restore the shared offset after content layout. Filter or coverage changes
reset the group. Dense date/month headings cap font scaling at 1.3; campground
names and detail text keep their normal scaling. VoiceOver rows announce the
weekend counts/statuses and the next observed opening, without claiming that
unobserved dates are unavailable. Header accessibility copy identifies highlights
as Fridays and Saturdays. Pan/cancel gestures suppress row activation, including
when the finger returns to its starting position.

The Missouri map-strip change is deliberate: a seasonal discovery proves closure
only for its checked date. Other unobserved nights remain unknown; do not carry
closure through a month without a dated source. Test a winter-closed park in the
existing map Camping tab as well as the new grid and calendar.

The 34 configured cron entries fit Vercel's documented 100-per-project limit on
all plans (verified September 28 against
https://vercel.com/docs/cron-jobs/usage-and-pricing). Hobby timing precision and
function usage limits are separate constraints; this does not verify the billing
plan or guarantee provider capacity. For the first week after deployment, review
sync duration, requests, errors, queue remainder and fresh date coverage by source
each day. Persistent remainder or gaps approaching the shared 72-hour expiry need
attention even if the HTTP cron responses are successful. The read-only coverage
query above is the release check; no post-deployment week has been observed yet.

Before release, test the synchronized full list on an older iPhone, large Dynamic
Type, VoiceOver row summaries and calendar selection, and swiping/releasing over a
row without opening it. Automated type/bundle and gesture-policy checks do not
replace native-device performance and touch QA.


Unknown-date display: supported dates without a fresh observation remain selectable
in the campground calendar, but have a muted number and no availability symbol.
Selecting one says `Availability not updated`; the normal booking link remains
available. Unsupported dates stay disabled. Comparison grids use a thin, short,
neutral dash for unknown observations. This changes presentation only, not counts
or freshness rules.

September 28 afternoon verification: the production API accepts `nights=90`, but
the most recent recorded provider syncs ran at 09:20 / 09:44 UTC before deployment.
Fresh stored dates still end October 11. Manual backfill must account for the
same-day facility cursor: repeating today's job without re-queuing the facilities
would skip them. The authenticated Vercel cron trigger is required; no provider
observations have been fabricated or copied into later dates.
