'use client';

// Eddy's rated rivers (geometry, rated gauges, thresholds) for the state view:
// the planner's own dataset (/api/usgs/mo-dataset?slim=1, CDN-cached, ~90 KB),
// fetched once, only when a state is shown. Null while loading or unavailable
// — the map then simply draws no rated sections.

import { useEffect, useState } from 'react';
import { parseRatedRivers, type RatedRiver } from '@/lib/national-map/rated';

export function useRatedRivers(enabled: boolean): RatedRiver[] | null {
  const [rivers, setRivers] = useState<RatedRiver[] | null>(null);
  const [requested, setRequested] = useState(false);
  useEffect(() => {
    if (!enabled || requested) return;
    setRequested(true);
    fetch('/api/usgs/mo-dataset?slim=1')
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => setRivers(body ? parseRatedRivers(body) : null))
      .catch(() => setRequested(false));
  }, [enabled, requested]);
  return enabled ? rivers : null;
}
