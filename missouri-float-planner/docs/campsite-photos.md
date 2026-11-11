# Individual campsite photos

The iOS Camping tab requests `/api/campsites/photos?media=2&facility=<Eddy UUID>&site=<Eddy site UUID>` after
site inventory arrives, only while Camping is active. Availability never waits
for media. Photos map Eddy site UUIDs to up to eight images with titles and credits.
The existing site availability response and database schema are unchanged.

## Coverage

Recreation.gov and Missouri State Parks/UseDirect are supported. Recreation.gov
photos come from its public website media service, one exact campsite at a time:
`https://www.recreation.gov/api/media/public/campsite/{source_site_id}`.
This is an unofficial endpoint, independently cached from availability. It does
not need an API key. Only public, active image records with the exact campsite
entity ID and HTTPS cdn.recreation.gov URLs are used. Credits are preserved;
primary images come first, followed by provider position, capped at eight.
The API verifies the Eddy site belongs to the requested enabled campground before
resolving its provider ID. No matching by name, loop number or campground photo.

The captured Buffalo Point B31 (6506) response from 2026-09-23 is checked into
`src/lib/camping/fixtures/recgov-campsite-6506.json` and covered by parser tests.
Its eight image records have an empty media_type; MIME type identifies images.

Older clients without a site parameter retain the RIDB facility path (and its
RIDB_API_KEY requirement). This compatibility path can still return no photos;
updated clients are needed for the per-site fix.

State Parks requests add `&site=<Eddy site UUID>`. The public reservation
site uses `search/details/{UnitId}/startdate/{date}/nights/1/0/0`; its `Images`
array contains the actual gallery paths. The adapter verifies the returned
UnitId and that its FacilityId belongs to a campground at the requested park.
Grid dictionary keys are not IDs (Meramec site 112: key `3370.1`, UnitId `11972`).
Only paths returned in the gallery are used, resolved against the reservation
website's image base. Map icons and park-level pictures are excluded.

Both providers load media per rendered row, behind the existing Show more cap,
only while Camping is active, with at most three photo requests running at once.
Queued work is cancelled on tab/pin changes; successful metadata stays in the
app request cache for one hour. The park's booking action remains above the list;
individual photo targets do not imply an individual-site reservation URL.
Other providers retain their existing UI. Empty/failed photos retain text rows.
Both sources use the gallery with source labels, credits, navigation and zoom.

Live verification on 2026-09-21: Meramec unit 11972 returned three gallery paths;
the first photo served HTTP 200 image/jpeg and was visually checked. No API key
is required for State Parks. Recreation.gov site 6506 returned eight exact-site images on 2026-09-23.

## Caching and release

- Only the legacy facility-wide Recreation.gov path needs `RIDB_API_KEY`.
- Updated clients use media=2 and per-site URLs to bypass previously cached empty responses.
- Successful provider responses cache for 24 hours, including sites without media.
- API responses cache for one hour with one day of stale-while-revalidate.
- Unsupported sources return empty maps; missing RIDB credentials/provider failures
  return an uncached 503. The app silently keeps its availability/text UI.
- Images use the native iOS URL cache; no new native dependency or DB migration.

Deploy the API before releasing the app. Older API deployments return 404 for
the optional photo request and remain usable. This PR does not deploy either.
Before release, verify a tracked Recreation.gov site's Eddy endpoint returns
nonempty exact-site entries after the API deployment. On an iPhone,
check thumbnail vs booking taps, gallery navigation/zoom/close, VoiceOver, dark
mode, failed images, and changing pins/tabs while photos load. Check State Park site rows, photo source labels, filters, Show more, and the
park-level booking action. Fully booked loops retain their compact summaries.

## Web campground dialog

Web opens with the overview's campground-level image, with Eddy artwork when
that image is missing or fails. Exact-site thumbnails load automatically near
the visible rows, at most three media requests at once; they never block site
availability. Clicking a thumbnail opens its inline gallery with source/credits.
Empty media retains a quiet placeholder; failed requests offer Retry photos.
Successful metadata is cached for one hour in a bounded browser cache.

Each campground section loads independently. Hovering or focusing a campground
list action starts its detail request. A bounded 60-second browser cache shares
in-flight and completed detail requests by facility and exact stay dates. Failed
requests are evicted, and the display still rechecks observation age and current
park policy. Open dialogs recheck the cache on the existing 30-second clock.
Share uses native mobile sharing or desktop clipboard feedback. Cancelling the
native sheet does not copy the link. No API contract or database change.

Web request deadlines use AbortController and a cleared timer, so photos also
work in browsers without AbortSignal.any. The ten-second photo deadline starts
when a queued request runs and covers its response body. Closing the dialog
cancels queued and running photos. Shared availability requests continue until
completion or their eight-second deadline, allowing immediate reopen reuse.

A failed background refresh keeps the previous site data and shows a small retry
notice. Observation age and current park policies still recalculate: retaining
data never extends its freshness. Initial-load failures keep the full error state.
The unavailable toggle considers only matching filters, and the date line shows
the selected night count instead of “Your stay” or “One-night preview”.
