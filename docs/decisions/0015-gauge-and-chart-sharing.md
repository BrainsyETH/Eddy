# ADR 0015: Station links, fixed chart views, and share images

Status: accepted for implementation. Store release, device verification and activation are unconfirmed.

## Decision

Ordinary `/gauges/*`, `/dams/*`, and river URLs retain their existing behavior.
New shares use `/share/gauge/<provider>/<id>` for latest conditions and
`/share/chart/usgs/<id>` for a fixed view. The dedicated station page preserves
station identity even when the station belongs to several rivers. USACE station
shares render the dam page; fixed chart shares initially support USGS only.

Version 1 carries absolute UTC loaded and visible windows separately, explicit
station calendar dates, station IANA timezone, measurement, selected comparison
layers, original statistic, scale mode, and optional river threshold identity.
An invalid field or unknown version restores none of the chart state and opens
latest conditions with an explanation. Daily dates retain the publisher's day;
labels and comparison alignment use the station zone. Missing coordinates use
UTC explicitly, with a visible UTC note on native charts. An older web response
without `timeZone` also uses UTC; deploy the web before distributing the build.
Geographic timezone resolution is server-only (`geo-tz@8.1.10`, the since-1970
boundaries); its data files are included in the server route traces. Detail and
history both use the coordinates projected by `search_gauges`, with no application
PostGIS decoder. New ordinary views use the current boundary data. A saved view
keeps its validated IANA timezone even after catalog or boundary corrections;
history accepts that timezone only with `calendar=station`. Dependency/data
updates therefore do not invalidate existing links. Missing or ambiguous
coordinates use UTC. A lookup outage is never cached as UTC: an ordinary
history response omits `timeZone` (clients label that as UTC, as above) and is
served `no-store`, so the next request retries; a saved view carries its own
timezone and does not depend on the lookup.

New links carry both the river UUID (`river`) and a slug (`rslug`). Resolution
uses the UUID first, then a unique matching slug among this gauge's linked
rivers. Existing UUID-only v1 links remain valid. Imports must retain published
UUIDs and slugs; this fallback cannot recover old UUID-only links after a
destructive reseed. If neither identity resolves, never substitute another
river's scale. A share with no threshold identity suppresses the chart ladder,
not the page's ordinary river association, condition vocabulary, or navigation.

The three value scales are `loaded` (all loaded values), `visible` (visible
values including line intersections at viewport edges), and `full` (all values
and reference thresholds). Gap splitting, daily alignment, domain math and image
geometry live in `missouri-float-planner/shared/`; they contain no native or web
renderer dependency. Native and web snapshot adapters use the same validated
contract. Changes must pass the cross-platform sharing test in the web suite.

Fixed dates do not promise immutable data. Expired instantaneous windows can
return daily averages or daily observations, explicitly labelled by the served
statistic. USGS provisional values can be revised. Forecasts and percentile
context also reflect the source's current available data.

An image request freezes the selection, loads coherent public history, and
renders SVG through `next/og`. It contains no paid Eddy Read. The PNG that is
shown is the PNG that is sent: on the web the user previews it, then shares
it on touch devices or copies or downloads it on desktop; on iOS the system
share sheet is the preview and receives the file together with the link text.
Shared titles and link-preview metadata name the station and the visible
station-calendar dates (`chartShareTitle`), not a bare site number. Web share
controls use the system share sheet only on touch devices and copy on
desktop, matching the site's other Share buttons. Image preparation requires
internet; link sharing does not wait for it. Transient render/data failures return retryable 503 responses and are never
cached. Missing saved station/history/river context returns a typed 422 for
image attachments. Social metadata requests `preview=1` and receive a neutral
"saved view unavailable" PNG, never a chart of replacement readings. Both
unavailable responses are `no-store`. The linked page explains the problem
and offers latest conditions. Station shares intentionally retain static
per-gauge artwork; chart shares show the selected view. The route has its own 60-render-per-minute IP limit and bounded
parameter size/window; it does not consume the public gauge-detail quota.
Crawler user agents receive the same limit. A configured limiter outage still
fails closed to bound rendering work. Noncanonical image queries redirect before
upstream work, removing tracking keys and normalizing encodings into one cache
key. Successful images have five-minute CDN freshness and one-minute browser
freshness, not immutable parameter-only caching. No new native sharing dependency
is needed.

The image route deliberately bypasses `withX402Route`: share previews and
attachments are a free public presentation of source readings, not a paid API
product or an Eddy Read. Activating the payout address does not paywall images.
This permits machine extraction from PNGs; that trade-off is accepted for
shareability. Canonical URLs, caching and the independent fail-closed quota
bound rendering work. Revisit this policy explicitly if the paid product is
expanded to cover public visualizations.

The extraction includes documented additive behavior, rather than being a
move-only refactor: station timezone metadata, alternate ladder thresholds, and
opt-in station calendar bounds. Ordinary history requests preserve their
existing upstream `auto` dispatch, including boundary cases. Only station
calendar mode fixes the resolution to `daily` when chosen, because translating
calendar bounds can change provider age/span calculations. Typical calendar
dates use explicit UTC fields (equivalent on the UTC production runtime); the
handler retains the rationale. No schema migration is required.

After #1580, web sharing lives in `GaugeHistoryChart`: desktop controls stay
inline and mobile uses its expanded dialog. Dates, zoom, layers and scale live
in the common component and survive presentation changes. Both platforms allow
link sharing while image preparation is running.

## Float share images

A saved float shares as a 1080 × 1920 PNG from `GET /api/share/float/image`,
rendered with `next/og` from one versioned query (`shared/float-share.ts`), and
the river's web page as the link text. It follows the chart image's rules:
stateless, nothing stored, one canonical spelling (others are 308-redirected so
they share a cache key), rate limited, and an error rather than a picture for
anything it will not draw: 400 for a malformed or inconsistent share, 422
(`places_unavailable`) for a well-formed one whose river or access points no
longer resolve. The app names the float's places only for the 422. That last rule matters more here: there is no link
preview to fall back to, and the app's share control treats any PNG as the
image it asked for.

What a float share may contain, and nothing else: the river (by slug), the
put-in and take-out (by id, so the server draws only names of approved access
points on that river), the calendar day, whether the take-out was reached, the
tracking state, the mood, the condition code with whether its reading was
current and its cfs, distance paddled, duration (no upper limit beyond a
30-day bound; recordings have none), and river explored with the whole percent
the recap states, decided on the phone from unrounded miles so the image never
contradicts the recap. It never carries the time of day, the GPS track, the
account, or the start note, and no free text: the query cannot be used to
render arbitrary words.

The server does not trust the query's mood. It applies the recap's own gate
(`moodGate`): nothing measured draws the standard otter, high water draws Big
water only on a current reading, and a mood that claims water the condition
does not show (Big water, Scrape) is refused. Flood floats can be shared and
state the condition plainly. Stickers are the app's own, written to
`public/icons` by `build-eddy-icons.py` and held to the app's pixels by the
icon parity test; the standard otter is a copy of the app's, held to it by
`shared/float-share.test.ts`.

The route returns the river's web path in `X-Eddy-Share-Path`; the app accepts
only a `/rivers/<state>/<slug>` path there and otherwise shares the image with
its title alone. Deploy the route before the app change reaches devices: an
older API answers 404, which the app reports as an image it could not prepare.

## Delivery and activation

The dependency order is shared state/web restoration, image sharing, then app
opening. One review branch may contain these independently reviewable pieces.
The association document adds **only** `/share/gauge/*` and `/share/chart/*`,
and only when `SHARE_APP_LINKS_ENABLED=true`. The default remains `/plan/*`.
Messages previews are server metadata and do not require this flag.

Do not enable the flag merely because the web deployment succeeded. Apple
caches associations, and AASA cannot target a minimum app version. Old installed
builds may claim new paths without understanding them. Leave activation off
until the release owner records an explicit compatibility decision and evidence:

- [ ] Supported App Store build receives both dedicated paths.
- [ ] Cold and warm chart links restore station, dates, layers, and each scale.
- [ ] Onboarding retains the destination; Back has the intended tab origin.
- [ ] Invalid/unknown versions show latest conditions, with no partial restore.
- [ ] Old installed build behavior has been tested and accepted, or activation
      remains off until a separately approved migration handles it.
- [ ] Physical-device PNG sharing works in Messages, Mail, Files, and a third-party
      destination, with the link text arriving alongside the image in Messages;
      the action sheet anchors correctly on iPad; cancellation, offline
      preparation and retry are verified.
- [ ] Landscape, accessibility text sizes, VoiceOver and web keyboard controls
      remain usable; daily labels agree across viewer timezones.
- [ ] Deployment and Apple CDN refresh are checked after explicit activation.

This PR does not deploy, change the production flag, or assert these device gates.
