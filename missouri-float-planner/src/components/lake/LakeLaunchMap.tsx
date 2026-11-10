'use client';

import { useEffect, useMemo, useRef } from 'react';
import { Marker } from 'maplibre-gl';
import MapContainer from '@/components/map/MapContainer';
import { useMap } from '@/components/map/map-context';
import type { LakeLaunch } from '@shared/lake-types';

function LaunchMarkers({ launches, selected, onSelect }: Props) {
  const map = useMap();
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  useEffect(() => {
    const currentButtons = buttons.current;
    const markers = launches.map((launch, index) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = String(index + 1);
      button.className = `flex h-11 w-11 items-center justify-center rounded-full border-2 border-white font-bold shadow-md bg-primary-700 text-white`;
      button.setAttribute('aria-label', `Show ${launch.name}`);
      currentButtons.set(launch.id, button);
      button.addEventListener('click', () => onSelect(launch.id));
      return new Marker({ element: button }).setLngLat([launch.lon, launch.lat]).addTo(map);
    });
    return () => { markers.forEach(marker => marker.remove()); currentButtons.clear(); };
  }, [map, launches, onSelect]);
  useEffect(() => {
    for (const [id, button] of buttons.current) {
      button.setAttribute('aria-pressed', String(selected === id));
      button.classList.toggle('bg-accent-500', selected === id);
      button.classList.toggle('bg-primary-700', selected !== id);
    }
  }, [selected, launches, onSelect]);
  return null;
}

interface Props { launches: LakeLaunch[]; selected: string | null; onSelect: (id: string) => void }

export default function LakeLaunchMap(props: Props) {
  const bounds = useMemo<[number, number, number, number] | undefined>(() => {
    if (!props.launches.length) return undefined;
    const xs = props.launches.map(l => l.lon), ys = props.launches.map(l => l.lat);
    return [Math.min(...xs) - .015, Math.min(...ys) - .015, Math.max(...xs) + .015, Math.max(...ys) + .015];
  }, [props.launches]);
  if (!props.launches.length) return <p className="p-5 text-sm text-neutral-600">No launches match this filter.</p>;
  return <MapContainer initialBounds={bounds} cooperativeGestures><LaunchMarkers {...props} /></MapContainer>;
}
