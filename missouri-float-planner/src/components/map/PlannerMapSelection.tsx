'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Marker, Popup } from 'maplibre-gl';
import { useMap } from './map-context';
import type { PlannerMapPlace } from '@/lib/planner-map-catalog';

/** One persistent selection, separate from endpoint roles and hover feedback. */
export default function PlannerMapSelection({ place, children }: { place: PlannerMapPlace; children?: ReactNode }) {
  const map = useMap();
  const [host] = useState(() => document.createElement('div'));
  const callout = !!children;
  useEffect(() => {
    const ring = document.createElement('div');
    ring.className = 'planner-selected-ring';
    ring.dataset.selectedPlaceId = place.id;
    ring.setAttribute('aria-hidden', 'true');
    if (!callout) {
      const label = document.createElement('span');
      label.textContent = place.name;
      ring.appendChild(label);
    }
    const coordinates: [number, number] = [place.coordinates.lng, place.coordinates.lat];
    const marker = new Marker({ element: ring }).setLngLat(coordinates).addTo(map);
    const popup = callout ? new Popup({ closeButton: false, closeOnClick: false, focusAfterOpen: false,
      anchor: 'bottom', offset: 28, maxWidth: '300px', className: 'planner-place-popup' })
      .setLngLat(coordinates).setDOMContent(host).addTo(map) : null;
    // Observe at the owner: this dynamically loaded popup may mount after
    // the camera controller has already installed its panel observers.
    const observer = popup ? new ResizeObserver(() => {
      map.getContainer().dispatchEvent(new Event('planner-selection-resize'));
    }) : null;
    if (popup) observer?.observe(popup.getElement());
    if (callout) host.querySelector<HTMLElement>('[tabindex="-1"]')?.focus({ preventScroll: true });
    return () => { observer?.disconnect(); popup?.remove(); marker.remove(); };
  }, [map, place.id, place.name, place.coordinates.lng, place.coordinates.lat, host, callout]);
  return children ? createPortal(children, host) : null;
}
