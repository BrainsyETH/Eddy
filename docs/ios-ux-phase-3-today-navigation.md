# iOS UX Phase 3C: Today child navigation

Branch: `codex/ios-today-navigation`.
Baseline: `2fc94314017b6dd159342cb49b73ae4a8e8188c5` (main after Phase 3B merged, September 30, 2026).

## What changes

River Conditions and Eddy’s Reads push onto the native root navigation stack at `/river-conditions` and `/eddy-reads`. Native Back and the edge-back gesture return to Today. Direct links without a navigation history have a native Today action. `/reports` remains the Today tab route, and the compact Today hub keeps its existing sections and rails.

Each route owns its search query, filters, ordering, and mounted list. Pushing a child no longer swaps the data and header of Today’s list, so Today stays mounted at its scroll position. A detail push also keeps its child list mounted. Closing a child and opening it again starts the requested filter and a new query; this change does not persist route state across app restarts.

Child screens use the native search bar: River Conditions searches river names, while Eddy’s Reads searches reads by river. Cancel clears the query and retains the selected filter. Today keeps its existing search across rivers, gauges, access points, and dams. Condition-count links carry their selected filter into River Conditions. Read cards open the river’s read section. The visible read filter now says Favorites, while the existing internal `following` filter value remains valid.

The shared public-data catalog reuses the same river snapshot and in-flight request across Today and its children. Mounting another route does not pay for another fresh request. Foregrounding after five minutes refreshes conditions, and pulling to refresh forces a load. A child’s river refresh updates the mounted Today snapshot too. Disk/seed data still paints before the network finishes, and a failed refresh keeps the current list instead of replacing it with older disk data. Gauge enrichment shares a request and remains retryable after failure. Search, favorites, filters, and location permission stay outside this catalog.

A failed first reads request offers Try again. A direct Nearby read link without coordinates asks the user to use their location, or to open Settings when permission is denied; opening the link does not request permission automatically. Native headers follow the existing transparent system-header configuration, and child lists use automatic content insets to scroll beneath the bars.

## Scope

This phase covers Today child navigation and the state/data ownership needed to preserve it. Native tabs, the broader typography/material pass, camping accessibility, and dam/weather layouts remain separate work. No dependencies, API contracts, backend schema, native configuration, or release channels change. No deployment or store submission is included.

The search bar uses the composition API shipped with the pinned Expo Router 57. Reference: [Expo Stack documentation](https://docs.expo.dev/router/advanced/stack/).

## Validation

- All 2,948 registered web/shared regression tests passed without failures or skips. Eleven new behavior tests cover shared requests, cache-first rendering, freshness, refresh retention, retry, consumer unmount, and route-filter parsing. They replace one source-order assertion with an actual deferred-request test.
- Web production/test typechecks and ESLint passed (0 errors, 14 existing warnings). Tailwind token and palette checks passed.
- `make check-mobile`: passed on Node 20, with 0 errors and 27 existing warnings (down from 30 after removing obsolete Today code/imports).
- `make bundle-mobile`: production Hermes iOS export and archive allowlist check passed (421 files, 10.57 MB; every Metro-resolved path included).
- `git diff --check`: passed.

The environment rejects the tsx CLI IPC socket. The registered test list and token script ran through the same installed tsx Node loader, retaining `tsconfig.test.json` for tests. No dependency or CI commands changed for this workaround.

There is no iOS simulator or physical device in this environment. Native search presentation, keyboard, gesture, scroll restoration, and VoiceOver behavior require device QA.

## Device QA

Use a small iPhone and a Home Indicator device. Repeat layout checks in light/dark appearance, increased contrast, Reduce Motion, and the largest accessibility text sizes. Include iOS 26 and an older supported iOS version for header/search differences.

- [ ] Scroll Today partway down and move a horizontal rail. Open River Conditions from its heading, then from each condition count. Verify the native title, Back action, and selected filter. Back and edge-back restore Today’s vertical position and rail position.
- [ ] In River Conditions, choose a filter and sort, enter a query, scroll, and open a river. Native Back restores the query, selected controls, and list position. Back again returns to the same place in Today. Opening a new child visit starts the requested filter with an empty query.
- [ ] Open Eddy’s Reads. Search by river name and combine the query with Favorites, Floatable, and All. Open a card: its river detail should target the read section. Back restores the read query, filter, and list position. Existing premium access behavior remains intact.
- [ ] In each child, type into native search, submit, scroll to dismiss the keyboard, clear, and cancel. Scrolling or opening a detail must not discard the query. Cancel clears the query without resetting the filter. Keyboard and native header never obscure the first actionable row.
- [ ] On Today, search rivers, gauges, access points, and dams, switch scopes, load more results, and open a result with the keyboard showing. Back retains the query and scope. Cancel returns to the compact hub.
- [ ] Open `/reports`, `/river-conditions?filter=high`, `/eddy-reads?filter=following`, and `/eddy-reads?filter=nearby` directly. Unknown filters fall back to All rivers or For you reads. With no Back history, the Today toolbar action and VoiceOver escape return to Today. Search escape first exits search.
- [ ] Select Nearby with permission undetermined, allowed, and denied. Only an explicit location action may prompt. Direct Nearby links with no coordinates show Use my location or Open Settings; returning after enabling location recovers through the same action. Distance remains approximate distance to the gauge.
- [ ] Open a child immediately after Today loads: no full-screen river reload. Pull to refresh in a child and return to Today: the shared river readings update without resetting Today’s list. Background for more than five minutes and resume; conditions refresh without clearing rows.
- [ ] Launch offline with seed data, launch with cached data, and fail a refresh after live rows load. Copy distinguishes missing live conditions from cached conditions; existing rows remain. Reconnect and retry. A failed first reads request shows Try again and recovers, rather than leaving a permanent spinner. Empty search/filter results remain distinct from loading and failure.
- [ ] Scroll beneath native chrome and to the final row. Check the notch, status bar, Home Indicator, search field, and Back control for overlap. Verify readable text and usable filters at large accessibility sizes. VoiceOver announces native Back/Today, search, selected filters, loading/error states, and row actions. Confirm two-finger escape and reduced-motion transitions on device.

Report device/iOS version, text size/appearance, entry point, action sequence, and a recording for layout or gesture failures.
