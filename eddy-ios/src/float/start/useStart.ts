// eddy-ios/src/float/start/useStart.ts
// Starting the float: the permission flow, the last checks, and beginFloat.
// No session exists until the permission flow finishes and the float is on disk.

import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';
import { useFocusEffect, useNavigation, useRouter } from 'expo-router';
import { CommonActions } from 'expo-router/react-navigation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { useFloatArchive } from '@/hooks/useFloatArchive';
import { currentStartFix, useFloatStartLocation } from '@/hooks/useFloatStartLocation';
import { loadFloatRoute, routeProblemCopy, type LoadedRoute } from '@/float/loadFloatRoute';
import { startSession, takeOutChoices } from '@/lib/floatSession';
import { completedFloatRoutes, startRiverPosition, usableStartFix } from '@/lib/floatStart';
import { startLocationState } from '@/lib/floatPermissions';
import { beginFloat } from '@/lib/floatSessionStore';

export type Params = {
  riverSlug?: string;
  putInId?: string;
  takeOutId?: string;
  shortCode?: string;
  plannerMph?: string;
  boatType?: string;
  step?: 'takeout' | 'summary' | 'background';
  startKey?: string;
  sessionId?: string;
};
export type StartLocation = ReturnType<typeof useFloatStartLocation>;
const BACKGROUND_EXPLAINED_KEY = 'eddy:float-background-explained:v1';

export function newSessionId() {
  return `float-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useStart(params: Params, loaded: LoadedRoute | null, location: StartLocation) {
  const archive = useFloatArchive();
  const router = useRouter();
  const navigation = useNavigation();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const running = useRef(false);
  const focused = useRef(false);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      return () => {
        focused.current = false;
      };
    }, []),
  );
  const run = async (intent: 'start' | 'background' | 'foreground') => {
    if (running.current || !loaded?.ok) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      if (!archive.ready && !(await archive.refresh())) {
        setError('Your float history could not be opened. Please try again.');
        return;
      }
      const foreground = await Location.getForegroundPermissionsAsync();
      const services = await Location.hasServicesEnabledAsync();
      if (!focused.current) return;
      if (startLocationState(foreground, services) !== 'ready') {
        await location.refresh();
        return;
      }
      const background = await Location.getBackgroundPermissionsAsync();
      if (intent === 'start' && background.status !== 'granted') {
        const explained = await AsyncStorage.getItem(BACKGROUND_EXPLAINED_KEY).catch(() => null);
        if (!focused.current) return;
        if (!explained) {
          router.push({ pathname: '/float-start', params: { ...params, step: 'background' } });
          return;
        }
      }
      if (intent !== 'start') {
        await AsyncStorage.setItem(BACKGROUND_EXPLAINED_KEY, '1').catch(() => {});
        if (!focused.current) return;
        if (intent === 'background' && background.status !== 'granted') {
          if (!background.canAskAgain) {
            await Linking.openSettings();
            return;
          }
          // Allow Once can silently decline this. Foreground tracking still starts.
          await Location.requestBackgroundPermissionsAsync();
        }
      }
      if (!focused.current) return;
      // Permissions may have changed in the system prompt; never start from a stale grant.
      const finalPermission = await Location.getForegroundPermissionsAsync();
      const finalServices = await Location.hasServicesEnabledAsync();
      if (!focused.current) return;
      if (startLocationState(finalPermission, finalServices) !== 'ready') {
        await location.refresh();
        return;
      }
      const saved = Boolean(params.putInId);
      // The preview fix may have aged out while the summary was open; get a
      // fresh one so "this take-out is behind you" is still checked. A GPS
      // timeout does not block the start: the session reports a start past
      // the take-out itself.
      let fix = location.fix;
      if (!saved && !usableStartFix(fix, Date.now())) {
        await location.refresh();
        if (!focused.current) return;
        fix = currentStartFix();
      }
      const hit = !saved ? startRiverPosition(loaded.index, fix, Date.now()) : null;
      if (
        hit &&
        !takeOutChoices(loaded.route, loaded.index, hit.riverMile).some(
          (choice) => choice.id === params.takeOutId,
        )
      ) {
        setError('This take-out is behind you. Go back to choose one downstream.');
        return;
      }
      const speed = Number(params.plannerMph);
      const made = startSession({
        id: params.sessionId!,
        kind: saved ? 'saved' : 'quick',
        shortCode: params.shortCode,
        route: loaded.route,
        index: loaded.index,
        putInId: params.putInId,
        takeOutId: params.takeOutId ?? '',
        plannerMph: saved && Number.isFinite(speed) && speed > 0 ? speed : null,
        boatType: params.boatType ?? null,
        now: Date.now(),
      });
      if (!made.ok) {
        setError(routeProblemCopy(made.reason));
        return;
      }
      const result = await beginFloat(made.session);
      if (result === 'storage-failed') {
        setError('Eddy couldn’t save this float. Free up some storage and try again.');
        return;
      }
      const state = navigation.getState();
      if (!state) {
        router.replace('/float-mode');
        return;
      }
      const routes = completedFloatRoutes(state.routes, params.startKey ?? '');
      navigation.dispatch({
        ...CommonActions.reset({ ...state, routes, index: routes.length - 1 }),
        target: state.key,
      });
    } catch {
      if (focused.current) setError('Eddy couldn’t start this float. Please try again.');
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return { run, busy, error };
}

export function useRiverRoute(slug?: string, tripKey?: string): LoadedRoute | null {
  const [state, setState] = useState<{ slug: string; result: LoadedRoute } | null>(null);
  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    void loadFloatRoute(slug, controller.signal, tripKey)
      .then((result) => {
        if (!controller.signal.aborted) setState({ slug, result });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ slug, result: { ok: false, reason: 'no-river-data' } });
      });
    return () => controller.abort();
  }, [slug, tripKey]);
  return state && state.slug === slug ? state.result : null;
}
