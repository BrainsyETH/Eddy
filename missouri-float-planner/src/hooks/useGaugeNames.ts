'use client';

import { useCallback, useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { gaugeNameRequests, mergeGaugeNames, type GaugeViewport } from '@/lib/gauges/map-index';

/** Viewport payloads supply names only. The complete index always owns coverage/readings. */
export function useGaugeNames(enabled: boolean) {
  const [request, setRequest] = useState<string[]>([]);
  const [viewport, setViewport] = useState<GaugeViewport | null>(null);
  const [names, setNames] = useState<ReadonlyMap<string, string>>(() => new Map());
  const onViewportChange = useCallback((next: GaugeViewport) => setViewport(next), []);
  useEffect(() => {
    if (!enabled) { setRequest([]); return; }
    const next = gaugeNameRequests(viewport);
    const timer = setTimeout(() => setRequest(previous =>
      previous.join('|') === next.join('|') ? previous : next), 250);
    return () => clearTimeout(timer);
  }, [enabled, viewport]);
  const query = useQuery({
    queryKey: ['gauge-viewport-names', request],
    queryFn: async ({ signal }) => {
      const replies = await Promise.all(request.map(async bbox => {
        const response = await fetch(`/api/gauges/map?bbox=${bbox}&limit=1000`, { signal });
        if (!response.ok) throw new Error('Station names could not load');
        const body = await response.json();
        if (!Array.isArray(body.gauges)) throw new Error('Invalid station names response');
        return body.gauges as unknown[];
      }));
      return replies.flat();
    },
    enabled: enabled && request.length > 0,
    staleTime: 15 * 60_000,
    retry: 1,
  });
  useEffect(() => {
    if (query.data) setNames(previous => mergeGaugeNames(previous, query.data));
  }, [query.data]);
  return { names, onViewportChange, namesError: enabled && request.length > 0 && query.isError,
    retryNames: () => { if (enabled && request.length) void query.refetch(); } };
}
