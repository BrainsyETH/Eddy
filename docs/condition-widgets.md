# River level and Favorites widgets

The Home Screen widgets share the `EddyFloatActivity` WidgetKit extension with
the existing River Mode Live Activity. River level is a configurable small
widget; Your rivers is a medium widget with the first three distinct starred
rivers/gauges in the app's existing order. Dams are not included. A river uses
its primary gauge; a gauge star uses its physical primary river association.
The station name stays visible, including when one station rates two rivers.
Each card/row opens the gauge detail screen. Empty states open Favorites.

The small widget can select any curated station/river association or a starred
national gauge through Edit Widget. Open Eddy once to populate the picker.
Its public river/station names are retained separately when a gauge is
unstarred; resolving that choice never adds it back to Favorites or the picker.
Additional widget sizes and condition Lock Screen accessories are separate work.
The existing River Mode Live Activity is unchanged.

## Display and previews

Widgets use semantic text styles (at least caption2 for small labels), with
Dynamic Type growth capped at xxLarge for the fixed widget bounds. The small
card drops the otter, secondary reading and history details on tight layouts.
Your rivers shows fewer, roomier rows at larger text sizes, with a link stating
how many remain in Eddy. Observation time has its own space; very long relative
ages fall back to a dated observation, with the full timestamp in VoiceOver.
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
swiftc modules/eddy-live-activity/ios/ConditionWidgetData.swift scripts/check-condition-widgets.swift -o /tmp/eddy-widget-check
/tmp/eddy-widget-check modules/eddy-live-activity/widget/ConditionsPreview.json
```

Device verification and release status are unconfirmed until the widget gates
in [the release runbook](ios-release-runbook.md#home-screen-widget-release-gates)
have recorded evidence. In particular, a successful Metro bundle is not evidence
that the extension compiles or that its App Group is provisioned.
