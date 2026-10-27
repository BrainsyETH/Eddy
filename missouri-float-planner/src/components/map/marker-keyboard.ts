import type { Map, Marker } from 'maplibre-gl';

/** Keyboard equivalent of a marker's existing pointer action. */
export function enableMarkerKeyboard(element: HTMLElement, label: string, dismiss: () => void): void {
  element.setAttribute('role', 'button');
  element.tabIndex = 0;
  element.setAttribute('aria-label', label);
  element.classList.add('map-marker-control');
  element.addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      event.stopPropagation();
      element.click();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      dismiss();
    }
  });
}

/** Offscreen pins must not scroll the clipped map when reached with Tab. */
export function attachMarkerTabOrder(map: Map, markers: Marker[]): () => void {
  const controls = markers.filter(marker => marker.getElement().hasAttribute('tabindex'));
  const update = () => {
    const canvas = map.getCanvas();
    for (const marker of controls) {
      const point = map.project(marker.getLngLat());
      marker.getElement().tabIndex = point.x >= 0 && point.x <= canvas.clientWidth
        && point.y >= 0 && point.y <= canvas.clientHeight ? 0 : -1;
    }
  };
  update();
  map.on('moveend', update);
  map.on('resize', update);
  return () => { map.off('moveend', update); map.off('resize', update); };
}
