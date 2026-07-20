import type maplibregl from 'maplibre-gl';

export interface MarkerPointerPriorityEntry {
  el: HTMLElement;
  baseZIndex: number;
}

export interface MarkerRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/**
 * Return the marker whose visual centre is closest to the pointer.
 *
 * DOM markers can overlap when a long river is framed at a low zoom. Browsers
 * normally send the click to whichever marker was appended last, which can make
 * a control labelled for one access point activate a different point above it.
 * Raising the nearest centre during pointer movement keeps the visible target,
 * accessible name, and activated record aligned.
 */
export function nearestMarkerIndex(
  rects: MarkerRect[],
  clientX: number,
  clientY: number,
  maxDistance = 32,
): number | null {
  let nearest: number | null = null;
  let nearestDistanceSquared = maxDistance * maxDistance;

  rects.forEach((rect, index) => {
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const dx = centerX - clientX;
    const dy = centerY - clientY;
    const distanceSquared = dx * dx + dy * dy;

    if (distanceSquared <= nearestDistanceSquared) {
      nearest = index;
      nearestDistanceSquared = distanceSquared;
    }
  });

  return nearest;
}

/** Attach pointer priority to a map and return a cleanup function. */
export function attachNearestMarkerPointerPriority(
  map: maplibregl.Map,
  entries: MarkerPointerPriorityEntry[],
): () => void {
  const container = map.getContainer();

  const reset = () => {
    entries.forEach(({ el, baseZIndex }) => {
      el.style.zIndex = String(baseZIndex);
    });
  };

  const prioritize = (event: PointerEvent) => {
    const rects = entries.map(({ el }) => el.getBoundingClientRect());
    const nearest = nearestMarkerIndex(rects, event.clientX, event.clientY);

    entries.forEach(({ el, baseZIndex }, index) => {
      el.style.zIndex = String(index === nearest ? 50 : baseZIndex);
    });
  };

  container.addEventListener('pointermove', prioritize);
  container.addEventListener('pointerleave', reset);

  return () => {
    container.removeEventListener('pointermove', prioritize);
    container.removeEventListener('pointerleave', reset);
    reset();
  };
}
