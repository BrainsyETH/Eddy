import type { Map } from 'maplibre-gl';

export const MAP_STYLE_TIMEOUT_MS = 15_000;

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

/** Run once when the style is parsed, even if no load/idle event ever arrives. */
export function whenStyleReady(
  map: Pick<Map, 'getStyle' | 'on' | 'off'>,
  onReady: () => void,
  onTimeout?: () => void,
): () => void {
  let done = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cleanup = () => {
    done = true;
    clearTimeout(timer);
    map.off('style.load', handleReady);
  };
  const handleReady = () => {
    if (done || !isStyleReady(map)) return;
    cleanup();
    onReady();
  };
  map.on('style.load', handleReady);
  if (onTimeout) {
    // Keep the listener after timing out: a late successful style recovers.
    timer = setTimeout(onTimeout, MAP_STYLE_TIMEOUT_MS);
  }
  handleReady();
  return cleanup;
}
