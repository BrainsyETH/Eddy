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
import { readBestIndex } from '@/lib/riverCache';
import { loadFloatRoute } from '../loadFloatRoute';
import type { StartLocation } from './useStart';

/** One lookup per screen, from the first usable fix; onFound hears a river the fix sits on. */
export function useGpsRiver(enabled: boolean, location: StartLocation, onFound: (slug: string) => void) {
  const fix = usableStartFix(location.fix, location.checkedAt) ? location.fix : null;
  const fixRef = useRef(fix);
  const foundRef = useRef(onFound);
  useEffect(() => { fixRef.current = fix; foundRef.current = onFound; });
  const [result, setResult] = useState<{ slug: string | null } | null>(null);
  const hasFix = fix != null;
  useEffect(() => {
    const start = fixRef.current;
    if (!enabled || !start || result) return;
    const controller = new AbortController();
    void (async () => {
      let rivers = (await readBestIndex())?.payload ?? [];
      if (!rivers.length) rivers = await fetchRivers(controller.signal).catch(() => []);
      if (controller.signal.aborted) return;
      const here = { lat: start.point[1], lng: start.point[0] };
      const hits: { slug: string; offsetMeters: number }[] = [];
      for (const slug of gpsRiverCandidates(suggestRivers(rivers, here, 10))) {
        const loaded = await loadFloatRoute(slug, controller.signal).catch(() => null);
        if (controller.signal.aborted) return;
        const hit = loaded?.ok ? startRiverPosition(loaded.index, start, Date.now()) : null;
        if (hit) hits.push({ slug, offsetMeters: hit.offsetMeters });
      }
      const slug = gpsRiver(hits);
      setResult({ slug });
      if (slug) foundRef.current(slug);
    })();
    return () => controller.abort();
  }, [enabled, hasFix, result]);
  return {
    searching: enabled && !result && (hasFix || location.state === 'checking' || location.busy),
  };
}
