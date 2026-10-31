import type { ErrorEvent, Map } from 'maplibre-gl';

export const MAP_STYLE_TIMEOUT_MS = 15_000;

/** Why readiness gave up: the style never parsed in time, or its fetch failed. */
export type StyleFailure = 'timeout' | 'style-error';

/**
 * A parsed style can accept Eddy's sources and layers while basemap tiles,
 * sprites and fonts are still downloading. Both loaded() AND isStyleLoaded()
 * wait for those resources in MapLibre 6; neither is a layer-readiness check.
 * getStyle() returns undefined until the style is initialized (and again
 * during a full style replacement), without waiting for its remote resources.
 */
export function isStyleReady(map: Pick<Map, 'getStyle'>): boolean {
  return Boolean(map.getStyle());
}

/**
 * A style fetch/parse failure, as opposed to a tile, sprite or glyph error.
 * Source errors carry `sourceId` (MapLibre's source caches bubble their
 * events through the style with it), and sprites/glyphs are only requested
 * after the style has parsed — so an error with no source while the style is
 * still unparsed can only be the style itself. Tile 404s are never fatal.
 */
export function isStyleLoadError(
  map: Pick<Map, 'getStyle'>,
  event: { sourceId?: string },
): boolean {
  return event.sourceId === undefined && !isStyleReady(map);
}

/**
 * Run once when the style is parsed, even if no load/idle event ever arrives.
 * `onFailure` fires at most once, on the 15 s timeout or as soon as the style
 * request itself fails — a 404 style should not spin for 15 s first.
 */
export function whenStyleReady(
  map: Pick<Map, 'getStyle' | 'on' | 'off'>,
  onReady: () => void,
  onFailure?: (reason: StyleFailure) => void,
): () => void {
  let done = false;
  let failed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cleanup = () => {
    done = true;
    clearTimeout(timer);
    map.off('style.load', handleReady);
    map.off('error', handleError);
  };
  const handleReady = () => {
    if (done || !isStyleReady(map)) return;
    cleanup();
    onReady();
  };
  const fail = (reason: StyleFailure) => {
    if (done || failed) return;
    failed = true;
    clearTimeout(timer);
    onFailure?.(reason);
  };
  // ErrorEvent's type omits the sourceId that source-cache errors carry.
  const handleError = (event: ErrorEvent) => {
    if (isStyleLoadError(map, event as ErrorEvent & { sourceId?: string })) fail('style-error');
  };
  map.on('style.load', handleReady);
  if (onFailure) {
    // Keep the listeners after failing: a late successful style recovers.
    timer = setTimeout(() => fail('timeout'), MAP_STYLE_TIMEOUT_MS);
    map.on('error', handleError);
  }
  handleReady();
  return cleanup;
}
