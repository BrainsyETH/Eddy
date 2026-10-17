# Home Screen widgets

The Home Screen widgets share the `EddyFloatActivity` WidgetKit extension with
the existing River Mode Live Activity. River level is a configurable small
widget; Your rivers is a configurable medium widget with three optional station
pickers. Empty slots follow the first three distinct starred rivers/gauges in
the app’s existing order, skipping stations explicitly chosen in another slot.
Duplicate selections render once. Dams have their own widget. A river uses
its primary gauge; a gauge star uses its physical primary river association.
The station name stays visible, including when one station rates two rivers.
Each card/row opens the gauge detail screen. Empty states open Favorites.

The small widget can select any curated station/river association or a starred
national gauge through Edit Widget. Open Eddy once to populate the picker.
Its public river/station names are retained separately when a gauge is
unstarred; resolving that choice never adds it back to Favorites or the picker.
Additional widget sizes and condition Lock Screen accessories are separate work.
The existing River Mode Live Activity is unchanged.

## Discovering widgets in Alerts

The **Mine** segment of Alerts includes an optional widget setup invitation
for installed iOS binaries that expose the widget native bridge. An older
binary, Expo Go or Android never advertises unavailable Home Screen widgets.
The invitation is shown once per device until dismissed or opened; afterward
a compact **Home Screen widgets** row remains so people can reopen the guide.
The device-only `eddy.widgets.setup-guide.seen.v1` key records seeing the
guide, never falsely asserts that a widget was installed.

The sheet previews **River level** (small, edited to select a gauge) and
**Your rivers** (medium, three station pickers with Favorites defaults),
**Dam generation** and **Daily river report** (medium), with
illustrative readings explicitly marked as sample data. It teaches Apple's
Home Screen **touch and hold → Edit → Add Widget → search Eddy** flow, followed
by the widget-specific customization. iOS owns the widget gallery: no button
claims that Eddy can install a widget on the user's behalf. Widget discovery
needs no account, location, or notification permission. Unlike alert rules,
widgets are not push notifications; their data refresh cadence is controlled
by iOS, and observation time remains visible.

## Display and previews

Widgets use semantic text styles (at least caption2 for small labels), with
Dynamic Type growth capped at xxLarge for the fixed widget bounds. The small
card drops the otter, secondary reading and history details on tight layouts.
Your rivers shows fewer, roomier rows at larger text sizes, with a link stating
how many remain in Eddy. Observation time has its own space: today shows a
local clock time; older readings show their calendar date, with the full
timestamp in VoiceOver. Small-widget trend labels use “Steady”, “Slow rise”,
“Fast rise”, “Slow fall” and “Fast fall”; VoiceOver retains the full trend.
The secondary measurement sits beside the primary reading, separate from status.
No status or age label is shrunk to fit. Otter images use desaturated accented
rendering to preserve their detail on a tinted Home Screen.

Placeholders and gallery snapshots show three illustrative rivers, with
readings, a Flowing label and history; installed empty widgets still explain
how to choose/star a station. Each preview reading replaces its observation age
with "Sample data", including in VoiceOver; real river names in examples must
not make illustrative readings look current. This preview flag lives only on
the entry and is never persisted with station data. `ConditionsPreview.json` is
generated through the shared condition/history code and rebased in memory for previews only. It is
never stored as a real reading or used by a live timeline. Regenerate it from
`missouri-float-planner` with
`node --import tsx scripts/generate-widget-preview.ts`; the registered web test
checks that the packaged example matches the canonical presentation.

## Data and freshness

- `src/components/ConditionsWidgetSync.tsx` in the iOS app shares only public
  station metadata and local favorite choices through
  `group.<bundleIdentifier>.widgets`. It waits for star hydration, preserves
  cached catalog metadata offline, and serializes writes so unstars/deletion
  cannot be undone by an earlier save. Old binaries and Expo Go skip the bridge.
- When Eddy becomes active, `ConditionsWidgetSync` asks the native bridge to
  reload all four widget timelines, throttled to once per 15 minutes across app
  relaunches. A favorite or station configuration change always reloads. This
  is a request to WidgetKit, not a guarantee of network access or a 15-minute
  cadence; standalone widget timelines retain their OS-controlled policy.
- WidgetKit records the last detail/history request attempt, success, response
  status or sanitized failure reason, and the detail observation time by public
  site ID in the shared App Group. The optional native
  `readWidgetDiagnostics()` bridge exposes the last 30 entries to local QA;
  the app logs a snapshot on foreground in development only. Diagnostics are
  pruned after 30 days without changing the separately cached readings. On device, widget
  network failures also emit `[Eddy widgets]` console messages. No account,
  GPS, response body, or request URL is stored. To diagnose a stale widget:
  compare last attempt against last success; no recent attempt suggests a
  deferred timeline, while a recent failed attempt identifies network, HTTP,
  timeout or decoding failure. A successful response with an old observation
  means the upstream station itself hasn't supplied a newer reading.
- `GET /api/gauges/:siteId?widget=1` returns the widget's minimal gauge
  fields plus the exact canonical `widget` snapshot. It keeps NWS point alerts
  and river-specific rating/observation freshness, and skips non-widget
  water-quality, seasonal comparison and other full-detail enrichment.
  Normal gauge-detail clients continue to receive the full response.
- `GET /api/gauges/:siteId` adds a versioned `widget` presentation snapshot.
  Its condition labels/colors and strict-unit ratings come from
  `shared/condition-widget.ts` and the canonical condition system. Every linked
  river has its own rating; Swift does not reimplement the ladder. The primary
  displayed number uses that river's rating unit, with the other unit secondary.
  Unrated stations prefer discharge when available.
- The snapshot also carries warning presentation from the gauge endpoint's
  existing NWS point lookup, with no extra request. A current NWS flood warning
  takes precedence over the level label, including for stale, flagged or
  unrated gauges. The number and original observation date remain visible;
  warnings do not rewrite a river's ladder rating. Watches/advisories do not
  become warnings. Labels quote the NWS event, with an icon as well as color.
- Alerts have a separate 15-minute presentation lifetime, bounded by each NWS
  expiration. This is a lifetime for the assembled response, not a new NWS check:
  the point lookup can already be cached for five minutes. Cached warnings past
  that lifetime say "Check flood alerts" without warning color until refreshed
  or expired. Unknown/failed lookups retain a previously known warning with its
  original dates; a successful empty lookup clears it. For missing/invalid NWS
  expiration, the server supplies a separate 24-hour reminder deadline from the
  successful alert snapshot. After that, the widget shows neutral "Alerts
  unavailable" without the triangle, retaining the reading without implying
  that the warning was cleared. Failed refreshes never restart either clock.
  Old payloads without this deadline use their existing 15-minute boundary for
  the unavailable state. This cutoff is also a local timeline transition.
  Explicit NWS expirations keep their own deadlines. Widgets cannot
  promise immediate warning delivery, cancellation or an all-clear.
- `GET /api/gauges/:siteId/history?days=1&widget=1` adds `widgetSeries` only for
  instantaneous observations. The 24-hour sparkline preserves gaps and extrema;
  a six-hour trend requires a recent, contiguous, trusted series. Daily means,
  forecast points and suspect readings do not become current trends.
- WidgetKit requests a refresh after 15 minutes; iOS determines when it runs.
  Each row shows observation age, never response age. Failed requests retain
  cached values with their original dates. Expiration timeline entries remove
  condition colors after the shared six-hour limit and trends after three hours
  without requiring another successful request. Flagged readings stay neutral.
  An older API can still supply numbers and times, with neutral presentation.
  Alert freshness/expiration also has local timeline transitions. The sparkline
  uses the history response's own `from/to` axis and never extends missing data
  to the present; cached history may describe an older 24-hour window.
- Requests use existing public HTTPS APIs with bounded timeouts and no cookies,
  account tokens or GPS. App-group storage contains no float track or account
  identity. The host and extension declare their UserDefaults usage in privacy
  manifests; the extension uses the same-group reason `1C8F.1`.

## Build and acceptance

Native source/config changes require a new iOS binary, not an OTA. Deploy the
additive web response fields before distributing that binary. There are no
database migrations. `withFloatActivity.js` generates the sources, assets,
privacy manifest, app-group entitlements and EAS extension credential metadata.
`scripts/check-float-activity.cjs` checks generated target membership,
entitlements, resource embedding and repeated application; it does not compile
Swift. The pure data/selection tests run in the web suite.
On a Mac, also run the Foundation contract checks (this still does not compile
SwiftUI/WidgetKit):

```sh
cd eddy-ios
swiftc modules/eddy-live-activity/ios/ConditionWidgetData.swift modules/eddy-live-activity/ios/SupplementaryWidgetData.swift scripts/check-condition-widgets.swift -o /tmp/eddy-widget-check
/tmp/eddy-widget-check modules/eddy-live-activity/widget/ConditionsPreview.json
```

Device verification and release status are unconfirmed until the widget gates
in [the release runbook](ios-release-runbook.md#home-screen-widget-release-gates)
have recorded evidence. In particular, a successful Metro bundle is not evidence
that the extension compiles or that its App Group is provisioned.

## Dam generation and daily river report

Both are configurable medium widgets in the same extension. Dam generation
uses a bundled public powerhouse catalog generated from `USACE_DAMS` by the
preview generator. An installed unconfigured dam widget asks for a selection;
tapping a configured widget opens `/dam/:damId`. Its compact public
`GET /api/dams/:damId?widget=1` response projects the existing snapshot using
canonical `dam-generation` logic, without adding database queries or changing
the normal detail response. It labels turbine flow separately from the next
scheduled change (Central Time); this is not total release or downstream flow.
Missing, negative, daily-mean and invalid/future measurements are unavailable,
not zero. Cached timelines carry hourly and exact observation/schedule expiry
transitions: after two hours observations lose present-tense language; after
90 minutes (or unknown check time) the schedule asks to check Eddy. The final
entry remains stale indefinitely during an outage. Network failures preserve
original timestamps; 404 clears the selected dam’s cache.

Daily river report selects a curated river’s primary gauge, defaulting to the
first eligible river in Favorites. It reuses the existing gauge snapshot,
including flood-warning precedence, and the public river weather forecast.
Weather is labelled forecast, with location and Fahrenheit units; retrieval
is a cache deadline, never an observation timestamp. Cached weather is hidden
after three hours and only the current Central calendar date can render.
Gauge and weather requests fail independently. Tapping opens `/river/:slug`.
This widget does not fetch Premium Eddy Read prose, credentials or account data.

The optional synchronous `widgetLayoutVersion()` native bridge returns 2 for
these layouts. In-app setup guidance only advertises the added widgets/editable
medium layout on that binary; older widget binaries retain their original
Favorites instructions. This change requires a new native iOS binary. Deploy
the additive dam widget API before distributing that binary; against an older
API, the dam widget remains unavailable rather than interpreting an incompatible
payload. Simulator compilation, static-to-configurable widget upgrade migration,
and device layout/timeline checks remain release gates, not proven by JS tests.
