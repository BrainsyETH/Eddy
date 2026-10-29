// eddy-ios/src/float/start/useStart.ts
// Starting the float: the permission flow, the last checks, and beginFloat.
// No session exists until the permission flow finishes and the float is on disk.

import { initialFloatReminders, type FloatReminderChoices } from '@/lib/floatReminders';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { useFloatArchive } from '@/hooks/useFloatArchive';
import { currentStartFix, useFloatStartLocation } from '@/hooks/useFloatStartLocation';
import { loadFloatRoute, refreshFloatHazards, routeProblemCopy, type LoadedRoute } from '@/float/loadFloatRoute';
import { startSession, takeOutChoices } from '@/lib/floatSession';
import { startRiverPosition, usableStartFix } from '@/lib/floatStart';
import { clearPendingFloatSetup } from '@/float/pendingFloatSetup';
import { prefetchStretchPhotos } from '@/float/floatPhotos';
import { startLocationState } from '@/lib/floatPermissions';
import { beginFloat } from '@/lib/floatSessionStore';
import { useAppConfig } from '@/hooks/useAppConfig';

export type Params = {
  riverSlug?: string;
  putInId?: string;
  takeOutId?: string;
  shortCode?: string;
  plannerMph?: string;
  boatType?: string;
  step?: 'takeout' | 'summary';
  sessionId?: string;
  downloadKey?: string;
};
export type StartLocation = ReturnType<typeof useFloatStartLocation>;

export function newSessionId() {
  return `float-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function useStart(params: Params & { previewStartMile?: number }, loaded: LoadedRoute | null, location: StartLocation, reminders: FloatReminderChoices) {
  const archive = useFloatArchive();
  const { features, featuresReady } = useAppConfig();
  const canStart = featuresReady && features.floatMode === true;
  const startAllowed = useRef(canStart);
  useLayoutEffect(() => { startAllowed.current = canStart; }, [canStart]);
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
  // Only When In Use is asked for. Recording with the phone locked comes from
  // the background activity session the native recorder holds (ADR 0014),
  // not from "Always", so there is no second permission step.
  const run = async () => {
    if (running.current || !loaded?.ok || !startAllowed.current) return;
    running.current = true;
    setBusy(true);
    setError(null);
    try {
      if (!archive.ready && !(await archive.refresh())) {
        setError('Your float history could not be opened. Please try again.');
        return;
      }
      // Permissions may have changed in Settings; never start from a stale grant.
      let permission = await Location.getForegroundPermissionsAsync();
      const services = await Location.hasServicesEnabledAsync();
      if (!focused.current) return;
      // Precise Location off: Apple's prompt, here in Eddy, then start. Only
      // once that is declined does the card offer Settings instead.
      if (startLocationState(permission, services) === 'precise' && location.precise === 'ask') {
        if (!(await location.askPrecise()) || !focused.current) return;
        permission = await Location.getForegroundPermissionsAsync();
      }
      if (startLocationState(permission, services) !== 'ready') {
        await location.refresh();
        return;
      }
      const saved = Boolean(params.putInId);
      // The preview fix may have aged out while the summary was open; get a
      // fresh one so "this take-out is behind you" is still checked. A GPS
      // timeout does not block the start: the session reports a start past
      // the take-out itself.
      let fix = location.fix;
      if (!usableStartFix(fix, Date.now())) {
        await location.refresh();
        if (!focused.current) return;
        fix = currentStartFix();
      }
      const hit = startRiverPosition(loaded.index, fix, Date.now());
      if (
        hit &&
        !takeOutChoices(loaded.route, loaded.index, hit.riverMile).some(
          (choice) => choice.id === params.takeOutId,
        )
      ) {
        setError('This take-out is behind you. Choose one downstream.');
        return;
      }
      // The route may come from the phone alone: ask for its hazards once,
      // briefly, and start with what the phone has if that does not answer.
      const route = await refreshFloatHazards(loaded.route, loaded.index);
      if (!focused.current) return;
      const speed = Number(params.plannerMph);
      const made = startSession({
        id: params.sessionId!,
        kind: saved ? 'saved' : 'quick',
        shortCode: params.shortCode,
        downloadKey: params.downloadKey,
        route,
        index: loaded.index,
        putInId: params.putInId,
        takeOutId: params.takeOutId ?? '',
        plannerMph: Number.isFinite(speed) && speed > 0 &&
          (saved || (hit && params.previewStartMile != null && Math.abs(hit.riverMile - params.previewStartMile) < 0.1))
          ? speed : null,
        boatType: params.boatType ?? null,
        now: Date.now(),
      });
      if (!made.ok) {
        setError(routeProblemCopy(made.reason));
        return;
      }
      // A foreground config refresh can disable new starts during permission/GPS work.
      if (!startAllowed.current) {
        setError('Starting a new float is temporarily unavailable.');
        return;
      }
      const result = await beginFloat({ ...made.session, reminders: initialFloatReminders(reminders) });
      if (result === 'storage-failed') {
        setError('Eddy couldn’t save this float. Free up some storage and try again.');
        return;
      }
      if (result === 'unreadable') {
        setError('Eddy couldn’t check for a float already in progress. Please try again.');
        return;
      }
      // Starting is usually the last moment with signal: save the stretch's
      // access photos for Float tools' Take-out and Ahead. Not awaited; a
      // photo that misses falls back to its place mark.
      if (result === 'started') {
        void prefetchStretchPhotos({
          points: loaded.accessPoints, riverSlug: loaded.route.riverSlug, takeOutId: made.session.takeOut.id,
          fromId: params.putInId, fromMile: hit?.riverMile ?? params.previewStartMile,
        });
      }
      // The active-session subscriber removes setup and presents the root
      // recording view, including if a concurrent start won the race.
      await clearPendingFloatSetup();
    } catch {
      if (focused.current) setError('Eddy couldn’t start this float. Please try again.');
    } finally {
      running.current = false;
      setBusy(false);
    }
  };
  return { run, busy, error, canStart, featuresReady };
}

export function useRiverRoute(slug?: string, tripKey?: string, reload = 0): LoadedRoute | null {
  const [state, setState] = useState<{ slug: string; tripKey?: string; reload: number; result: LoadedRoute } | null>(null);
  useEffect(() => {
    if (!slug) return;
    const controller = new AbortController();
    void loadFloatRoute(slug, controller.signal, tripKey)
      .then((result) => {
        if (!controller.signal.aborted) setState({ slug, tripKey, reload, result });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ slug, tripKey, reload, result: { ok: false, reason: 'no-river-data' } });
      });
    return () => controller.abort();
  }, [slug, tripKey, reload]);
  return state && state.slug === slug && state.tripKey === tripKey && state.reload === reload ? state.result : null;
}
