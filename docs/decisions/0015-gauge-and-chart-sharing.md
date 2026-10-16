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
UTC explicitly. Geographic timezone resolution is server-only (`tz-lookup`).

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
renders SVG through `next/og`. It contains no paid Eddy Read. The user previews
the resulting PNG and shares those same bytes. Image preparation requires
internet; link sharing does not wait for it. Render errors remain retryable and
are never cached. The route has an independent rate limit and bounded parameter
size/window; successful images have five-minute CDN freshness, not immutable
parameter-only caching. No new native sharing dependency is needed.

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
      destination; cancellation, offline preparation and retry are verified.
- [ ] Landscape, accessibility text sizes, VoiceOver and web keyboard controls
      remain usable; daily labels agree across viewer timezones.
- [ ] Deployment and Apple CDN refresh are checked after explicit activation.

This PR does not deploy, change the production flag, or assert these device gates.
