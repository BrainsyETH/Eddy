'use client';

import { useEffect } from 'react';
import { useMap } from './map-context';
import type { GaugeViewport } from '@/lib/gauges/map-index';

/** Publish settled camera bounds; the shared name hook debounces/cache-keys requests. */
export default function NationalGaugeViewport({ onChange }: { onChange: (viewport: GaugeViewport) => void }) {
  const map = useMap();
  useEffect(() => {
    const publish = () => {
      const bounds = map.getBounds();
      onChange({ bounds: [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()], zoom: map.getZoom() });
    };
    publish();
    map.on('moveend', publish); map.on('resize', publish);
    return () => { map.off('moveend', publish); map.off('resize', publish); };
  }, [map, onChange]);
  return null;
}
