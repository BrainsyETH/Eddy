'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from 'react';
import { useQuery } from '@tanstack/react-query';
import { decodeMapIndex, filterMapGauges, restoreGaugeLayers, type GaugeFilter, type GaugeLayers } from '@/lib/gauges/map-index';

const STORAGE_KEY = 'eddy-web-gauge-layers-v1';
const EMPTY: ReturnType<typeof decodeMapIndex> = [];

/** One complete cached catalog at every zoom; viewport response caps cannot remove pins. */
export function useNationalGauges() {
  const [layers, setLayerState] = useState(() => restoreGaugeLayers(null));
  const layersRef = useRef(layers);
  const setLayers = useCallback((update: SetStateAction<GaugeLayers>) => {
    const next = typeof update === 'function' ? update(layersRef.current) : update;
    layersRef.current = next;
    // Save inside the action so immediately navigating to the other map cannot
    // outrun an effect and restore the previous choice.
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* private storage */ }
    setLayerState(next);
  }, []);
  const [restored, setRestored] = useState(false);
  const [filters, setFilters] = useState<Set<GaugeFilter>>(() => new Set());
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    try {
      const saved = restoreGaugeLayers(localStorage.getItem(STORAGE_KEY));
      layersRef.current = saved;
      setLayerState(saved);
    } catch { /* private storage */ }
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!layers.other) { setFilters(new Set()); return; }
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(tick);
  }, [layers.other]);
  const query = useQuery({
    queryKey: ['national-gauge-index'],
    queryFn: async ({ signal }) => {
      const response = await fetch('/api/gauges/points', { signal });
      if (!response.ok) throw new Error('USGS gauges could not load');
      return decodeMapIndex(await response.json());
    },
    enabled: restored && layers.other,
    staleTime: 15 * 60_000, refetchInterval: 15 * 60_000,
    retry: 2, refetchOnWindowFocus: true,
  });
  const gauges = useMemo(() => restored && layers.other ? filterMapGauges(query.data ?? EMPTY, filters, now) : EMPTY,
    [restored, layers.other, query.data, filters, now]);
  const toggleFilter = useCallback((key: GaugeFilter) => setFilters(previous => {
    const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next;
  }), []);
  return { layers, setLayers, filters, toggleFilter, clearFilters: () => setFilters(new Set()), gauges,
    loading: layers.other && (!restored || query.isLoading), error: layers.other && query.isError,
    hasData: query.data !== undefined, retry: () => { void query.refetch(); } };
}
export type NationalGaugeState = ReturnType<typeof useNationalGauges>;
