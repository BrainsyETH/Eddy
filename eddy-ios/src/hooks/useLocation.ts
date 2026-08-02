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
// No coordinate here is sent anywhere — including the one now written to disk,
// which lives in this app's own sandboxed storage. Distances are computed on
// device against data the app already holds, which is why the permission copy
// in app.json can say so plainly.
//
// ── Why the last fix is remembered ──────────────────────────────────────────
// "Allow Once" is a SESSION grant. iOS hands it back on relaunch as though
// nothing had ever been granted, so an app that keeps no position of its own
// has to ask again every single time it wants one — which is the complaint
// this file now answers. Nothing about the prompt itself can be changed; what
// can be changed is how often the app needs one.
//
// So a granted fix is written to disk and restored on the next launch as
// `remembered`. The map opens where you are, "near me" can sort, and no dialog
// appears — because none is needed. It stays SEPARATE from 'ready': a
// remembered position is not a live grant, and the Mapbox user-location puck
// (which would itself prompt) must never be mounted off one.

import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { warn } from '@/lib/monitoring';

export interface Coords {
  lat: number;
  lng: number;
}

export type LocationStatus =
  /** Never asked. The only state in which a tap will show the system prompt. */
  | 'idle'
  | 'locating'
  | 'ready'
  /**
   * A position from a PREVIOUS session, with no grant held right now.
   *
   * Good enough for everything this app measures in miles, and worth exactly as
   * much as a live fix for "which rivers are near me". Not worth a puck on the
   * map, and never a reason to skip the prompt when someone explicitly asks to
   * be located — see `request`.
   */
  | 'remembered'
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
 * Where the last granted fix is kept.
 *
 * Its own namespace rather than the versioned river cache: that store is swept
 * whenever its payload schema changes, and forgetting where the user is would
 * be an odd casualty of a change to how rivers are stored.
 */
const LAST_FIX_KEY = 'eddy.location.lastFix.v1';

/**
 * How long a remembered fix is worth restoring.
 *
 * Two weeks. Long enough to cover the ordinary rhythm of an app opened on
 * Thursday nights, short enough that a position captured on holiday two states
 * away does not quietly become the anchor for "rivers near me" in perpetuity.
 * Anything older is dropped, and the app is simply back to knowing nothing —
 * which is the honest answer at that point.
 */
const LAST_FIX_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

interface StoredFix {
  lat: number;
  lng: number;
  /** Epoch ms. */
  at: number;
}

async function readLastFix(): Promise<Coords | null> {
  try {
    const raw = await AsyncStorage.getItem(LAST_FIX_KEY);
    if (!raw) return null;
    const stored = JSON.parse(raw) as Partial<StoredFix>;
    if (
      typeof stored.lat !== 'number' ||
      typeof stored.lng !== 'number' ||
      typeof stored.at !== 'number'
    ) {
      return null;
    }
    if (Date.now() - stored.at > LAST_FIX_MAX_AGE_MS) return null;
    return { lat: stored.lat, lng: stored.lng };
  } catch {
    // A cache is never a reason a screen does not render. Same posture as
    // riverCache: reads resolve to null and say nothing.
    return null;
  }
}

/** Fire and forget, like every other write in this app's caches. */
function writeLastFix(coords: Coords): void {
  const stored: StoredFix = { ...coords, at: Date.now() };
  void AsyncStorage.setItem(LAST_FIX_KEY, JSON.stringify(stored)).catch((err) => {
    warn('cache', 'could not remember the last fix', err);
  });
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
    // A LIVE fix short-circuits; a remembered one does not. Somebody tapping
    // "show my location" is asking to be located now, and answering that with
    // last Tuesday's coordinates would centre the map on the wrong town and
    // leave the button looking broken. The saving is that they rarely have to
    // tap it at all any more.
    if (coords && status === 'ready') return coords;
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
        // Kept for the next launch, when an "Allow Once" grant will be gone and
        // the app would otherwise have nothing.
        writeLastFix(next);
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
        if (permission !== Location.PermissionStatus.GRANTED) {
          // ── No grant right now, which is the ordinary state after "Allow
          // Once" ─────────────────────────────────────────────────────────
          // Fall back to the fix from the last session. This is the whole point
          // of storing one: the map can open where the user is, and nothing
          // prompts, because nothing had to ask.
          const remembered = await readLastFix();
          if (cancelled || !remembered) return;
          setCoords(remembered);
          setStatus('remembered');
          return;
        }
        // Cached only. A cold GPS fix is a multi-second wait, and nothing here
        // was asked for — this is opportunistic, so it either has an answer to
        // hand or it stays quiet.
        const cached = await Location.getLastKnownPositionAsync({ maxAge: 5 * 60 * 1000 });
        if (cancelled) return;
        if (!cached) {
          // Permission held and no recent fix — the phone has been indoors, or
          // just booted. The remembered position still beats no position, and
          // it is not marked 'ready' because there is no live fix behind it.
          const remembered = await readLastFix();
          if (cancelled || !remembered) return;
          setCoords(remembered);
          setStatus('remembered');
          return;
        }
        const next = { lat: cached.coords.latitude, lng: cached.coords.longitude };
        setCoords(next);
        setStatus('ready');
        writeLastFix(next);
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
