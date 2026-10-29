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
The rectangular Lock Screen family is included in native layout 4 below; other accessory families remain separate work.
The existing River Mode Live Activity is unchanged.

## Discovering widgets in Alerts

The **Mine** segment of Alerts includes an optional widget setup invitation
for installed iOS binaries that expose the widget native bridge. An older
binary, Expo Go or Android never advertises unavailable Home Screen widgets.
The invitation is shown once per device until dismissed or opened; afterward
a compact **River Widgets** row ("Set up a river level widget.") remains so people can reopen the guide.
The device-only `eddy.widgets.setup-guide.seen.v1` key records seeing the
guide, never falsely asserts that a widget was installed.

The sheet previews **River level** (small, edited to select a gauge) and
**Your rivers** (medium, three station pickers with Favorites defaults),
**Dam generation** and **Daily river report** (medium), with
illustrative readings explicitly marked as sample data. It teaches Apple's
Home Screen **touch and hold → Edit → Add Widget → search Eddy** flow, followed
by the widget-specific customization in three short numbered steps. The preview
replaces feature descriptions; steps have no repeated headings or explanatory
footer. Lock Screen instructions appear only on supporting binaries, and v1
Favorites instructions still describe starring rivers instead of Edit Widget.
iOS owns the widget gallery: no button
claims that Eddy can install a widget on the user's behalf. Widget discovery
needs no account, location, or notification permission. Unlike alert rules,
widgets are not push notifications; their data refresh cadence is controlled
by iOS, and observation time remains visible.

## Display and previews

Widgets use semantic text styles (at least caption2 for small labels), with
Dynamic Type growth capped at xxLarge for the fixed widget bounds. The small
card shows one large reading in the selected river's rating unit (CFS or FT),
never both. Unrated stations prefer available discharge. It drops the otter
and history details on tight layouts before reducing the primary reading.
Your rivers shows fewer, roomier rows at larger text sizes, with a link stating
how many remain in Eddy. Observation time has its own space: today shows a
local clock time; older readings show their calendar date, with the full
timestamp in VoiceOver. Small-widget trend labels use “Steady”, “Slow rise”,
“Fast rise”, “Slow fall” and “Fast fall”; VoiceOver retains the full trend.
Station subtitles omit an exact repeated river-name prefix while VoiceOver
retains the complete public station name. No duplicate measurement is shown.
No status or age label is shrunk to fit. Otter images use desaturated accented
rendering to preserve their detail on a tinted Home Screen.

Gauges use the existing gauge otter; Dam generation uses `eddy-dam.png`; Daily
River Report uses `eddy-river.png`. Prebuild copies those shipped assets into
the widget catalog. Warm Stone/Sandbar surfaces and Deep Teal accents come
from the iOS brand palette; condition colors still come from the API. The
report title, selected river and condition each appear once. Weather uses a
separate forecast tile with a condition symbol, high/low Fahrenheit readings
and precipitation icon. The forecast location is available to VoiceOver;
the gauge station and observation time have one shared footer.

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
  displayed number uses that river's rating unit, with no secondary number.
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
the normal detail response. It places observed turbine flow beside today's
hourly posted schedule in Central Time. Bars use published MW (their upper
scale is labelled), not estimated cfs or a count of generators. A short solid
bar means zero scheduled generation; a hollow dashed bar means a missing or
invalid hour. A coral pointer marks the current local hour, including the
source's repeated/skipped wall-clock slots on DST days. Hour-ending labels
come from the shared schedule rules. This is not total release or downstream flow.
The additive v1 `scheduleDays` data retains its original Central calendar date.
Any schedule matching today's date draws, including one whose check has aged
out — the footer's observed time already conveys staleness, so the widget does
not swap the chart for a "check schedule" prompt. No schedule for today shows
"Not posted today"; an older server without hourly data shows "Open schedule".
Existing binaries still receive the next-change summary they understand.
Missing, negative, daily-mean and invalid/future measurements are unavailable,
not zero. Cached timelines carry hourly and exact observation/schedule expiry
transitions: after two hours observations lose present-tense language; after
90 minutes (or unknown check time) the next-change summary older binaries show
asks to check Eddy. The final
entry remains stale indefinitely during an outage. Network failures preserve
original timestamps; 404 clears the selected dam’s cache.

Daily river report selects a curated river’s primary gauge, defaulting to the
first eligible river in Favorites. It reuses the existing gauge snapshot,
including flood-warning precedence, and the public river weather forecast.
Weather is labelled forecast, with Fahrenheit units and location in VoiceOver; retrieval
is a cache deadline, never an observation timestamp. Cached weather is hidden
after three hours and only the current Central calendar date can render.
Gauge and weather requests fail independently. Tapping opens `/river/:slug`.
This widget does not fetch Premium Eddy Read prose, credentials or account data.

The optional synchronous `widgetLayoutVersion()` native bridge returned 3 for
these visual layouts (4 with the Lock Screen extension below). In-app previews
show the hourly schedule on v3 and later and next-change rows on v2. Setup steps
keep automatic Favorites instructions on v1. This change requires a new native iOS binary. Deploy
the additive dam widget API before distributing that binary; against an older
API, the dam widget remains unavailable rather than interpreting an incompatible
payload. Simulator compilation, static-to-configurable widget upgrade migration,
and device layout/timeline checks remain release gates, not proven by JS tests.

## Lock Screen extension (native layout 4)

`EddyRiverLevelWidget` supports `accessoryRectangular` in addition to
`systemSmall`; it keeps the same kind, configuration intent, cache, unit
selection and timeline provider. The Lock Screen displays one reading, a trend
only while its observation/history remain valid, and the original observation
age. Warning, flagged and older states remain visible without relying on color.
No extra background task, location collection or refresh cadence is added.
The in-app widget guide hides this family on binaries below layout version 4.

Native build, Lock Screen layout/VoiceOver, Always-On and failed-network device
verification remain unconfirmed. Host App Shortcuts and their validation are
described in `eddy-ios/README.md` under App Shortcuts.

The Lock Screen title uses the configured **station**, so two gauges on the
same river remain distinguishable. Age includes **ago**; VoiceOver retains
the full river/station identity and observation time. The first widget
invitation keeps one line of value; the acknowledged row stays compact.

The native Shortcuts release is separate from saved places (#1565). Test
“Open [river] in Eddy” as well as the default phrase. For both float actions,
restore the recorder before navigation: active → River Mode; unreadable →
River Mode recovery; Return with no float → Floats home. Prepare with no
active float opens the chosen saved route’s setup and does not start it.
