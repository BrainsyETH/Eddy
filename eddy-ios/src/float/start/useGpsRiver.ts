// eddy-ios/src/float/start/useGpsRiver.ts
// Ready to float fills the river from GPS when the paddler is standing on one,
// so the usual setup at the water is a take-out and Start. A river counts only
// when the fix sits on its mapped line (startRiverPosition), never merely near
// an access; otherwise the river stays a choice.

import { useEffect, useRef, useState } from 'react';
import { fetchRivers } from '@/api/client';
import { suggestRivers } from '@/lib/floatSession';
import { startRiverPosition, usableStartFix } from '@/lib/floatStart';
import { gpsRiver, gpsRiverCandidates } from '@/lib/floatStartSelection';
import { createGpsRiverLookup } from '@/lib/gpsRiverLookup';
import { readBestIndex } from '@/lib/riverCache';
import { loadFloatRoute } from '../loadFloatRoute';
import type { StartLocation } from './useStart';

/** Retry on a new fix, or at most every 30 seconds while automatic detection has a fresh fix. */
export function useGpsRiver(enabled: boolean, location: StartLocation, onFound: (slug: string) => void) {
  const fix = usableStartFix(location.fix, location.checkedAt) ? location.fix : null;
  const fixRef = useRef(fix);
  const foundRef = useRef(onFound);
  useEffect(() => { fixRef.current = fix; foundRef.current = onFound; });
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const [lookup] = useState(() => createGpsRiverLookup(async (start, signal) => {
    let rivers = (await readBestIndex())?.payload ?? [];
    if (!rivers.length) rivers = await fetchRivers(signal).catch(() => []);
    if (signal.aborted) return null;
    const here = { lat: start.point[1], lng: start.point[0] };
    const hits: { slug: string; offsetMeters: number }[] = [];
    for (const slug of gpsRiverCandidates(suggestRivers(rivers, here, 10))) {
      const loaded = await loadFloatRoute(slug, signal).catch(() => null);
      if (signal.aborted) return null;
      const hit = loaded?.ok ? startRiverPosition(loaded.index, start, Date.now()) : null;
      if (hit) hits.push({ slug, offsetMeters: hit.offsetMeters });
    }
    return gpsRiver(hits);
  }));
  const key = fix ? `${fix.timestamp}:${fix.accuracy}:${fix.point.join(',')}:${Math.floor(location.checkedAt / 30_000)}` : null;
  useEffect(() => {
    const start = fixRef.current;
    if (!enabled || !start || !key) return;
    let current = true;
    void lookup.run(start).catch(() => null).then(slug => {
      if (!current) return;
      setSettledKey(key);
      if (slug) foundRef.current(slug);
    });
    return () => { current = false; lookup.cancel(); };
  }, [enabled, key, lookup]);
  return {
    searching: enabled && ((key != null && settledKey !== key) || location.state === 'checking' || location.busy),
  };
}
