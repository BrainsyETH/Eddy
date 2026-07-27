// eddy-ios/src/hooks/useLocation.ts
// Where you are, asked for only when it is the answer to something.
//
// ── The permission is never spent on launch ─────────────────────────────────
// iOS gives an app ONE chance at the location prompt. Firing it at startup asks
// for something before the user has any idea what it buys them, and a decline
// is permanent short of a trip to Settings. So nothing here runs until an
// explicit tap — the locate button on the map, the "Near me" chip in River
// Reports — at which point the ask has a visible reason attached to it. Same
// discipline as PushPrimer, for the same reason.
//
// ── Coarse is enough ────────────────────────────────────────────────────────
// Every question this answers is "which of these places is closest", measured
// in miles. Balanced accuracy resolves that fine, gets a fix faster, and costs
// far less battery than the precision used for turn-by-turn navigation.
//
// ── It never leaves the phone ───────────────────────────────────────────────
// No coordinate here is sent anywhere. Distances are computed on device against
// data the app already holds, which is why the permission copy in app.json can
// say so plainly.

import { useCallback, useEffect, useRef, useState } from 'react';
import * as Location from 'expo-location';

export interface Coords {
  lat: number;
  lng: number;
}

export type LocationStatus =
  /** Never asked. The only state in which a tap will show the system prompt. */
  | 'idle'
  | 'locating'
  | 'ready'
  /** Asked and refused, or refused earlier and remembered by iOS. */
  | 'denied'
  /** Permission held, but no fix — indoors, airplane mode, a cold GPS. */
  | 'unavailable';

interface LocationValue {
  coords: Coords | null;
  status: LocationStatus;
  /**
   * Ask for a position, prompting for permission if this is the first time.
   * Safe to call repeatedly: concurrent calls share one in-flight request, and
   * a denial is not re-prompted.
   */
  request: () => Promise<Coords | null>;
}

/**
 * Great-circle distance in miles.
 *
 * STRAIGHT LINE, and every caller must say so. The number that actually decides
 * a trip is drive time, which is a Mapbox Directions call per candidate — far
 * too expensive to run across two dozen rivers to sort a list. "32 miles away"
 * with the caveat beats a spinner, and beats nothing.
 */
export function milesBetween(a: Coords, b: Coords): number {
  const EARTH_RADIUS_MILES = 3958.8;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function useLocation(): LocationValue {
  const [coords, setCoords] = useState<Coords | null>(null);
  const [status, setStatus] = useState<LocationStatus>('idle');

  // Concurrent callers share one request. Two chips tapped in quick succession
  // must not produce two permission prompts or two GPS acquisitions.
  const inFlight = useRef<Promise<Coords | null> | null>(null);

  const request = useCallback(async (): Promise<Coords | null> => {
    if (coords) return coords;
    // A refusal is respected until the app restarts. Re-prompting a user who
    // just said no is the behaviour that gets apps deleted, and iOS would
    // suppress the dialog anyway — so the only effect would be a silent retry
    // loop behind a spinner.
    if (status === 'denied') return null;
    if (inFlight.current) return inFlight.current;

    const run = (async (): Promise<Coords | null> => {
      setStatus('locating');
      try {
        const { status: permission } = await Location.requestForegroundPermissionsAsync();
        if (permission !== Location.PermissionStatus.GRANTED) {
          setStatus('denied');
          return null;
        }

        // Last known first: it returns immediately and is almost always good
        // enough to rank places tens of miles apart. Waiting on a fresh fix
        // before showing anything would put a multi-second stall behind a tap.
        const cached = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 });
        const position =
          cached ??
          (await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }));

        if (!position) {
          setStatus('unavailable');
          return null;
        }

        const next = { lat: position.coords.latitude, lng: position.coords.longitude };
        setCoords(next);
        setStatus('ready');
        return next;
      } catch {
        // Permission held but no fix — indoors, airplane mode, a cold GPS.
        // Distinct from 'denied' because it is worth trying again later.
        setStatus('unavailable');
        return null;
      } finally {
        inFlight.current = null;
      }
    })();

    inFlight.current = run;
    return run;
  }, [coords, status]);

  // ── Resolve a position we ALREADY have permission for, without prompting ──
  //
  // getForegroundPermissionsAsync is the getter, not the asker: it reports the
  // current grant and never shows the system dialog. That distinction is the
  // whole feature. Someone who granted location on a previous run should have
  // the map open where they are, and someone who has not should not be
  // interrupted by a dialog for merely opening a tab — which is exactly the
  // trade the `request`-on-tap design above already makes.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { status: permission } = await Location.getForegroundPermissionsAsync();
        if (cancelled || permission !== Location.PermissionStatus.GRANTED) return;
        // Cached only. A cold GPS fix is a multi-second wait, and nothing here
        // was asked for — this is opportunistic, so it either has an answer to
        // hand or it stays quiet.
        const cached = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 });
        if (cancelled || !cached) return;
        setCoords({ lat: cached.coords.latitude, lng: cached.coords.longitude });
        setStatus('ready');
      } catch {
        // Nothing to report: we never claimed to be locating.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { coords, status, request };
}
