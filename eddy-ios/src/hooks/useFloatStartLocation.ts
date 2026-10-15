import { useCallback, useRef, useState } from 'react';
import { AppState, Linking } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { preciseLocationAction, startLocationState, type ForegroundPermission } from '@/lib/floatPermissions';
import { canAskPreciseInApp, requestPreciseLocation } from '@/float/preciseLocation';
import { START_FIX_MAX_AGE_MS, usableStartFix, type StartFix } from '@/lib/floatStart';

// Only a short-lived preview, shared across setup pages. Never persisted or sent
// through navigation URLs; actual tracking still starts only after beginFloat.
let previewFix: StartFix | null = null;

/** The shared preview fix right now, for a check that must not use a render's copy. */
export function currentStartFix(): StartFix | null {
  return previewFix;
}

export function useFloatStartLocation() {
  const [permission, setPermission] = useState<ForegroundPermission | null>(null);
  const [servicesEnabled, setServicesEnabled] = useState(true);
  const [fix, setFix] = useState<StartFix | null>(null);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState(Date.now);
  const generation = useRef(0);
  const focused = useRef(false);
  const requesting = useRef(false);
  // Declined the in-app precise-location prompt on this visit: Settings next.
  const [preciseDeclined, setPreciseDeclined] = useState(false);

  const refresh = useCallback(async (request = false, forceFix = false) => {
    const ticket = ++generation.current;
    const current = () => focused.current && generation.current === ticket;
    if (!current()) return false;
    setBusy(true);
    setError(null);
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      requesting.current = request;
      const next = request
        ? await Location.requestForegroundPermissionsAsync()
        : await Location.getForegroundPermissionsAsync();
      requesting.current = false;
      const enabled = await Location.hasServicesEnabledAsync();
      if (!current()) return false;
      setCheckedAt(Date.now());
      setPermission(next);
      setServicesEnabled(enabled);
      if (startLocationState(next, enabled) !== 'ready') {
        previewFix = null;
        setFix(null);
        return false;
      }
      if (!forceFix && usableStartFix(previewFix, Date.now())) {
        setFix(previewFix);
        return true;
      }
      setFix(null);
      previewFix = null;
      const position = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('Location timed out')), 10_000);
        }),
      ]);
      if (!current()) return false;
      const nextFix: StartFix = {
        point: [position.coords.longitude, position.coords.latitude],
        accuracy: position.coords.accuracy,
        timestamp: position.timestamp,
      };
      if (!usableStartFix(nextFix, Date.now())) throw new Error('Location is not precise yet');
      previewFix = nextFix;
      setCheckedAt(Date.now());
      setFix(nextFix);
      return true;
    } catch {
      if (current()) setError('Eddy couldn’t find your location. Try again.');
      return false;
    } finally {
      requesting.current = false;
      if (timeout) clearTimeout(timeout);
      if (current()) setBusy(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      void refresh();
      // Re-check after Settings; never repeat the iOS prompt on foregrounding.
      const subscription = AppState.addEventListener('change', (state) => {
        if (state === 'active' && !requesting.current) void refresh();
      });
      // Expire preview distances while the screen is left open, too.
      const expiry = setInterval(
        () => {
          const now = Date.now();
          setCheckedAt(now);
          setFix((value) => (usableStartFix(value, now) ? value : null));
        },
        Math.min(START_FIX_MAX_AGE_MS, 10_000),
      );
      return () => {
        focused.current = false;
        generation.current++;
        subscription.remove();
        clearInterval(expiry);
      };
    }, [refresh]),
  );

  const state = startLocationState(permission, servicesEnabled);
  const precise = preciseLocationAction(preciseDeclined, canAskPreciseInApp);

  /** Apple's in-app precise-location prompt. Resolves whether it was allowed. */
  const askPrecise = useCallback(async () => {
    requesting.current = true;
    let allowed = false;
    try {
      allowed = await requestPreciseLocation();
    } finally {
      requesting.current = false;
    }
    if (!allowed) {
      setPreciseDeclined(true);
      return false;
    }
    await refresh(false, true);
    return true;
  }, [refresh]);

  const act = useCallback(async () => {
    if (state === 'precise' && precise === 'ask') {
      await askPrecise();
      return;
    }
    if (state === 'settings' || state === 'precise' || state === 'services') {
      try {
        await Linking.openSettings();
      } catch {
        setError('Open Settings and check Location for Eddy.');
      }
    } else {
      await refresh(state === 'request', true);
    }
  }, [state, precise, askPrecise, refresh]);

  return { state, precise, fix, checkedAt, busy, error, act, askPrecise, refresh };
}
