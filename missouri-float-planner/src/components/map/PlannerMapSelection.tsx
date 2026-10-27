'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Popup } from 'maplibre-gl';
import { useMap } from './map-context';
import type { PlannerMapPlace } from '@/lib/planner-map-catalog';

/** An attached preview; the clustered marker layer owns selection artwork. */
export default function PlannerMapSelection({ place, children }: { place: PlannerMapPlace; children?: ReactNode }) {
  const map = useMap();
  const [host] = useState(() => document.createElement('div'));
  const callout = !!children;
  useEffect(() => {
    if (!callout) return;
    const coordinates: [number, number] = [place.coordinates.lng, place.coordinates.lat];
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
    return () => { observer?.disconnect(); popup?.remove(); };
  }, [map, place.id, place.name, place.coordinates.lng, place.coordinates.lat, host, callout]);
  return children ? createPortal(children, host) : null;
}
