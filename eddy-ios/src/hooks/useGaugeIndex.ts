// eddy-ios/src/hooks/useGaugeIndex.ts
// The national gauge layer, zoomed out: every station, clustered on-device.
//
// useViewportGauges stops asking below MIN_GAUGE_ZOOM, because a continental
// viewport request is one the server caps at 1,000 and orders by discharge —
// most creeks would silently vanish. So below the floor the layer used to
// draw NOTHING, which is the opposite of every other gauge map: those show the
// whole network as counts that break apart as you zoom in.
//
// This is that. One CDN-cached request for every station's position and latest
// reading (~14,000 rows, compact tuples — see /api/gauges/points), handed to
// the same clustered source the viewport tier draws into. Mapbox clusters it
// natively, so the phone draws a few dozen bubbles, not fourteen thousand dots.
//
//   1. LAZY        — nothing is fetched until the layer is on AND the camera is
//                    below the floor. Most sessions never pay for it.
//   2. STALE-FIRST — the last body is kept on disk and paints immediately on
//                    the next launch; a network refresh follows when it is
//                    older than REFRESH_MS.
//   3. RAW ON DISK — the stored body is re-decoded against the current clock,
//                    so a reading that was live when saved is not painted as
//                    live a day later (flowBandFor reads the timestamp).
//   4. KEEP ON FAILURE — a failed refresh leaves what is drawn.

import { useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { decodeGaugePoints, type GaugePointsResponse, type MapGaugeLite } from '@eddy/types';
import { fetchGaugePoints } from '@/api/client';
import { warn } from '@/lib/monitoring';

const STORAGE_KEY = 'eddy.map.gaugeIndex.v1';

/** Matches the route's CDN freshness; the national readings refresh hourly. */
const REFRESH_MS = 15 * 60_000;

interface Stored {
  fetchedAt: number;
  body: GaugePointsResponse;
}

export interface GaugeIndexState {
  gauges: MapGaugeLite[];
  /** True once any answer — disk or network — has been decoded. */
  ready: boolean;
  loading: boolean;
}

const EMPTY: GaugeIndexState = { gauges: [], ready: false, loading: false };

// Module scope, like the other map caches: remounting the map tab must not
// throw away a 14,000-row decode.
let memory: Stored | null = null;
let memoryGauges: MapGaugeLite[] | null = null;

async function readDisk(): Promise<Stored | null> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<Stored>;
    if (typeof parsed.fetchedAt !== 'number' || !parsed.body) return null;
    return { fetchedAt: parsed.fetchedAt, body: parsed.body };
  } catch {
    return null;
  }
}

function writeDisk(stored: Stored): void {
  void AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(stored)).catch(() => {});
}

export function useGaugeIndex(enabled: boolean): GaugeIndexState {
  const [state, setState] = useState<GaugeIndexState>(() =>
    memoryGauges ? { gauges: memoryGauges, ready: true, loading: false } : EMPTY,
  );
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!enabled) return;
    // The setters are not tied to this effect run's lifetime: a refresh started here
    // must still land if the camera crossed the floor and back meanwhile, and
    // a set after unmount is a no-op in React 18.

    const apply = (stored: Stored) => {
      memory = stored;
      memoryGauges = decodeGaugePoints(stored.body);
      setState({ gauges: memoryGauges, ready: true, loading: false });
    };

    const refresh = async () => {
      if (inFlight.current) return;
      const controller = new AbortController();
      inFlight.current = controller;
      setState((prev) => ({ ...prev, loading: true }));
      try {
        const body = await fetchGaugePoints(controller.signal);
        const stored = { fetchedAt: Date.now(), body };
        writeDisk(stored);
        apply(stored);
      } catch (err) {
        if (!controller.signal.aborted && !(err instanceof Error && err.message === 'Request cancelled')) {
          warn('map', 'gauge index load failed', { message: err instanceof Error ? err.message : String(err) });
        }
        setState((prev) => ({ ...prev, loading: false }));
      } finally {
        if (inFlight.current === controller) inFlight.current = null;
      }
    };

    void (async () => {
      if (!memory) {
        const disk = await readDisk();
        if (disk && !memory) apply(disk);
      }
      if (!memory || Date.now() - memory.fetchedAt > REFRESH_MS) await refresh();
    })();
  }, [enabled]);

  // Abort on unmount so a backgrounded map is not still downloading.
  useEffect(() => () => inFlight.current?.abort(), []);

  return state;
}
