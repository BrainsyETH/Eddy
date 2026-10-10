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

4. **"Ready offline" means every chunk reports
   `completedResourceCount == requiredResourceCount`**, as returned by
   `offlineManager.getPacks()`. Re-checked when the trip opens, not only when
   the download finishes. An ambient-cache hit never counts.

5. **Updating never deletes first.** A refresh downloads into new pack names
   and removes the old ones only after the new ones verify complete. Removing a
   download keeps the saved float and its essential data.

6. **When there is no usable background map, draw the river anyway.** The Float
   Mode map switches once, for the rest of that screen visit, from Mapbox to
   the SVG river-only view (`eddy-ios/src/float/FloatMap.tsx`) when Mapbox
   cannot render: no token, Expo Go, or the map failing to load its style.
   That view needs no style, tiles or network. It shows the same line, ends
   and position, labelled "background map unavailable". It never flips back
   and forth with connectivity.

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
  resource counts per tile region; the style pack's state is only visible
  through the error callback during a download. That is why style-pack
  rendering offline is on the device-proof list below.
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
