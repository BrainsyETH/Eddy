# River level and Favorites widgets

The Home Screen widgets share the `EddyFloatActivity` WidgetKit extension with
the existing Float Mode Live Activity. River level is a configurable small
widget; Your rivers is a medium widget with the first three distinct starred
rivers/gauges in the app's existing order. Dams are not included. A river uses
its primary gauge; a gauge star uses its physical primary river association.
The station name stays visible, including when one station rates two rivers.
Each card/row opens the gauge detail screen. Empty states open Favorites.

The small widget can select any curated station/river association or a starred
national gauge through Edit Widget. Open Eddy once to populate the picker.
Additional widget sizes and condition Lock Screen accessories are separate work.
The existing Float Mode Live Activity is unchanged.

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

Device verification and release status are unconfirmed until the widget gates
in [the release runbook](ios-release-runbook.md#home-screen-widget-release-gates)
have recorded evidence. In particular, a successful Metro bundle is not evidence
that the extension compiles or that its App Group is provisioned.
