# 0011 — Float Mode offline maps are Mapbox tile regions along the route, with a river-only fallback

Status: active · 2026-10 · decisions verified against `@rnmapbox/maps` 10.3.5
source; the items under "Prove on a device" are not yet verified.

Float Mode ([#1448](https://github.com/BrainsyETH/Eddy/issues/1448)) must work
at a put-in with no signal. The essential data (river line, access points,
calibration) is already copied into the float session at start and never
needs the network (`eddy-ios/src/lib/floatSession.ts`). This record is about
the **background map**: an optional download, plus a deliberate fallback when
there is none.

## Decision

1. **Use the non-legacy `offlineManager`** from `@rnmapbox/maps`. In 10.3.5 its
   iOS module (`ios/RNMBX/Offline/RNMBXOfflineModule.swift`) is built on the
   Maps SDK v10 `TileStore` tile regions plus an `OfflineManager` style pack.
   The legacy manager (`offlineManagerLegacy`) is the old offline-region
   database and is not used.
   - Tile regions **share tiles**: removing one region frees only what no
     other region uses, so overlapping trip downloads need no reference
     counting of our own.
   - The style pack (style JSON, sprites, glyphs) downloads with the region,
     so the map can render with no network.
   - `acceptExpired: true` is hard-coded, so an old download still renders.

2. **Download a corridor, not a rectangle.** The JS wrapper only accepts a
   two-point `bounds`, which the native side turns into a rectangle polygon.
   A diagonal 15-mile stretch as one rectangle would download mostly hills
   nobody floats past. So a trip is split along the route line into chunks,
   and each chunk becomes its own padded tile region. Shared tiles make the
   overlaps free.
   - Start values, to measure on devices, not budgets: chunks of about 3 km
     of line; padding about 1.5 km each side; zoom 10–15 (roads and terrain
     context at 10–12, river detail at 13–15); the route extended about 1 km
     beyond the take-out.
   - One style only: `STYLE_URL` (`mapbox://styles/mapbox/outdoors-v12`). No
     satellite, no user-drawn areas, no zoom choices.

3. **Pack names are `float:<trip-key>:<chunk>`**, where the trip key is the
   saved float's short code or the quick-start session id. This must never
   match `^river:[^:]+:\d+$`, the pattern `src/map/packSweep.ts` deletes for
   the removed river-download feature. A test asserts it.

4. **"Ready offline" means the whole trip, not only tiles.** A download first
   saves a **route package** (the river line, access points and calibration
   the float will use, the planned chunk names, and the style URL) under
   `eddy.tripPackage.v1.<trip-key>`, outside the `eddy.cache.` prefix that
   "Clear saved river data" removes. An offline start from that saved float
   reads the package before the cache. Ready offline then requires all of:
   the package present and current; its style URL equal to the one the app
   draws; every one of its chunks reporting
   `completedResourceCount == requiredResourceCount` from
   `offlineManager.getPacks()`; and `styleVerified`, set only when a download
   positively confirms the style pack is complete. **@rnmapbox/maps 10.3.5
   cannot confirm it from JavaScript** (see "Constraints" below), and the
   absence of an error is not evidence, so nothing sets `styleVerified` yet:
   a fully downloaded trip shows "Trip and map tiles saved", never Ready
   offline. Confirming the style pack needs a small native check that reads
   the SDK's style pack counts; that is an open decision. Re-checked
   each time the trip opens. An ambient-cache hit never counts. The code is
   `tripReadiness` in `eddy-ios/src/lib/tripDownload.ts`, with tests.

5. **Updating never deletes first.** A refresh downloads into new pack names
   and removes the old ones only after the new ones verify complete. Removing a
   download keeps the saved float and its essential data.

6. **When there is no usable background map, keep the same map and draw the
   river anyway.** When Mapbox cannot load its style (no download, no signal,
   nothing cached), the Float Mode map switches to a built-in neutral style
   with no sources, which needs no network. It is the same map instance, so
   the route, ends, position, camera, following, pan, zoom and Recenter all
   continue, with a quiet "Background map unavailable" label. While neutral,
   it checks for a connection at most once a minute and tries the real style
   again; a failed retry falls back to neutral, so a flickering signal cannot
   make it flap or remount (`eddy-ios/src/float/FloatMap.tsx`). The plain SVG
   drawing remains only for builds with no Mapbox at all (no token, Expo Go).

7. **Downloads are deliberate and user-started.** Never started automatically
   on reconnection. The native module sets `networkRestriction: .none`, so a
   user-started download also runs over cellular; the size estimate is shown
   before starting.

## Constraints found in the source

- **Downloads run in-process.** iOS suspends them when Eddy is backgrounded.
  `resumePackDownload` re-runs `startLoading`, and `TileStore` skips tiles it
  already has, so an interrupted download resumes rather than restarts, also
  after a relaunch (`getPacks` re-lists regions from `TileStore`). The UI
  must say "Paused, keep Eddy open to finish", never imply completion.
- **Completeness covers tiles, not the style pack.** `getPacks()` reports
  resource counts per tile region. Nothing exposes the style pack: the
  TileStore module offers only `setOption`; the one "complete" progress event
  fires when the TILES finish; the step that waits for both style and tiles
  sends nothing; and `getPackStatus` rebuilds its in-memory pack from
  TileStore on every call, discarding any state from the run. An error can be
  heard (with a listener attached on resume too), but silence proves nothing.
- **`createPack` throws if the name exists in this process.** Updates use new
  names (decision 5), which also avoids that.

## Prove on a device before building the full download UI

1. One representative trip: download → airplane mode → cold launch → Float
   Mode map renders the downloaded area, with labels → start and resume.
2. No download, cleared ambient cache, airplane mode: the river-only view
   appears and tracking works.
3. Background the app mid-download, return: progress resumes; nothing claims
   completion early.
4. Measure real sizes for three trip lengths (about 5, 10 and 20 miles) at the
   start values above. Record them here and adjust chunk, padding and zoom.
5. Confirm Mapbox's current tile-count and storage limits for TileStore
   regions on this account, and the pricing for offline usage; record both
   here. Not verified from the SDK source.

## Not in this decision

Custom-area or whole-river downloads, satellite imagery, and offline
road-turn navigation (#1448, out of scope for the first release).
