// eddy-ios/src/lib/mapLoadingError.ts
// Which Mapbox loading errors mean the background map cannot draw at all.
//
// Pure, so the web suite tests it (missouri-float-planner/src/lib/
// trip-download.test.ts). ADR 0011 decision 6.
//
// @rnmapbox/maps reports EVERY loading error through one event: the style,
// its sprite or glyphs, and each single tile or source that fails. Its payload
// names the tile and source when the error is about one. Offline, a downloaded
// trip still asks for tiles outside its corridor (a frame wider than the
// stretch, a lower zoom than the download), and each of those fails. Treating
// them as "the style failed" dropped River Mode to the plain background on a
// map whose style and corridor were on the phone. Only an error that names no
// tile and no source means the style itself could not load.

/** What rnmapbox passes to onMapLoadingError: Mapbox's message, and the tile or source it is about. */
export interface MapLoadingErrorPayload {
  error?: string;
  tileId?: string;
  sourceId?: string;
}

/**
 * True when the style itself (or its sprite or glyphs) failed, so the map has
 * no background to draw. A payload of an unexpected shape counts as a style
 * failure: the plain background is the safe reading when the error is unknown.
 */
export function styleLoadFailed(payload: unknown): boolean {
  if (payload == null || typeof payload !== 'object') return true;
  const { tileId, sourceId } = payload as MapLoadingErrorPayload;
  return !tileId && !sourceId;
}
