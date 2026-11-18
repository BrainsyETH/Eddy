// eddy-ios/src/hooks/useDamAlerts.tsx
// The caller's dam generation alerts, held once for the dam screen (which sets
// them) and the Alerts tab (which lists them).
//
// A sibling of AlertRulesProvider and built the same way, for the same reason:
// an alert exists to make the backend push, so the server's list is the truth
// and this is a copy of it, updated optimistically and put back on failure.
//
// It is NOT folded into that provider. River and gauge rules share a shape
// (AlertRule) and a set of verbs; a dam alert is two switches on one row with
// no pause, no threshold and no one-shot, and stretching AlertRule to carry it
// would put a third `source` in front of every screen that switches on two.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { DamGenerationAlert } from '@eddy/types';
import { ApiError, deleteDamAlert, fetchDamAlerts, saveDamAlert } from '@/api/client';
import {
  applyDamAlert,
  changedDamAlertTimes,
  damAlertTimes,
  NO_DAM_ALERT,
  reconcileDamAlert,
  statusAfterLoad,
  type DamAlertChange,
  type DamAlertsStatus,
} from '@/lib/damAlerts';
import { useSession } from '@/hooks/useSession';

interface DamAlertsValue {
  /** Null when signed out, before the first load answers, or when it failed. */
  alerts: DamGenerationAlert[] | null;
  /**
   * Whether `alerts` can be believed. Only `loaded` and `signed-out` confirm
   * anything; see DamAlertsStatus for why `failed` is its own state.
   */
  status: DamAlertsStatus;
  /** Ask again. From `failed` this is the Retry. */
  refresh: () => Promise<void>;
  /**
   * Move one of a dam's two switches, with a token already in hand. Resolves
   * with the alert as the server now holds it, or null when both are off.
   *
   * Only the switch that moved is sent; the server keeps the other. So this is
   * safe to call before the list has loaded — the answer brings back whatever
   * was already saved.
   *
   * Takes the token rather than fetching one because every caller runs this
   * inside useAlertGate, which owns the session and turns a 401/403 thrown from
   * here into the sign-in sheet. Rejects after putting the list back.
   */
  save: (
    token: string,
    dam: { id: string; name: string },
    change: DamAlertChange,
  ) => Promise<DamGenerationAlert | null>;
  /** Remove one dam's alert. Rejects after putting the row back. */
  remove: (damId: string) => Promise<void>;
}

const DamAlertsContext = createContext<DamAlertsValue>({
  alerts: null,
  status: 'loading',
  refresh: async () => {},
  save: async () => null,
  remove: async () => {},
});

export function DamAlertsProvider({ children }: { children: ReactNode }) {
  const [alerts, setAlerts] = useState<DamGenerationAlert[] | null>(null);
  const [status, setStatus] = useState<DamAlertsStatus>('loading');
  const { session, isAnonymous, getAccessToken } = useSession();

  // Bumped by every write, so a load that started before a switch was flicked
  // cannot land after it and put the switch back.
  const mutationGen = useRef(0);
  const alertsRef = useRef<DamGenerationAlert[] | null>(null);
  useEffect(() => {
    alertsRef.current = alerts;
  }, [alerts]);
  // Whether the server has confirmed the list for this account at least once.
  const confirmed = useRef(false);

  const load = useCallback(
    async (signal?: AbortSignal): Promise<void> => {
      // An anonymous session cannot hold an alert (the server requires a
      // permanent account to write one), so there is nothing to ask for.
      const token = isAnonymous ? null : await getAccessToken();
      if (!token) {
        confirmed.current = false;
        setAlerts(null);
        setStatus(statusAfterLoad('signed-out', false));
        return;
      }
      // Asking with nothing confirmed: say so, including on a Retry after a
      // failure. A refresh of a confirmed list stays `loaded` throughout.
      if (!confirmed.current) setStatus('loading');

      // A loop, not a single request: an answer that raced a switch being
      // flicked is asked for again (see below). Bounded, so a burst of taps
      // cannot keep it spinning; past the bound it is a failed load.
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const gen = mutationGen.current;
        try {
          const next = await fetchDamAlerts(token, signal);
          if (next === null) {
            // The server refused a token this app believed in (an expired
            // session). That is not "signed out, so no alerts": the account
            // may hold one. Nothing was confirmed, so it is a failed load.
            setStatus(statusAfterLoad('failed', confirmed.current));
            return;
          }
          if (mutationGen.current !== gen) {
            // A switch was flicked while this was in flight, so the answer
            // may predate it. A confirmed list is already right (the save
            // reconciled it); an unconfirmed one still has to be fetched.
            if (confirmed.current) return;
            continue;
          }
          confirmed.current = true;
          setAlerts(next);
          setStatus(statusAfterLoad('loaded', true));
          return;
        } catch (err) {
          if (err instanceof ApiError && err.message === 'Request cancelled') return;
          // NOT "ready". With nothing confirmed this is `failed`, and the card
          // offers Retry instead of drawing switches it cannot vouch for. A
          // failed refresh of a confirmed list keeps that list.
          setStatus(statusAfterLoad('failed', confirmed.current));
          return;
        }
      }
      setStatus(statusAfterLoad('failed', confirmed.current));
    },
    [getAccessToken, isAnonymous],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load, session?.user?.id]);

  const refresh = useCallback(() => load(), [load]);

  const save = useCallback(
    async (token: string, dam: { id: string; name: string }, change: DamAlertChange) => {
      const before = alertsRef.current;
      mutationGen.current += 1;
      // What to show until the server answers: this app's best guess.
      const guess = changedDamAlertTimes(damAlertTimes(before, dam.id), change);
      setAlerts(applyDamAlert(before ?? [], dam, guess, new Date().toISOString()));
      try {
        const saved = await saveDamAlert(token, { damId: dam.id, ...change });
        // The server's answer replaces the guess, including the switch that
        // was not sent.
        setAlerts((current) => reconcileDamAlert(current ?? [], dam.id, saved));
        // Saved before the list was confirmed (straight after signing in):
        // the answer is one dam, so fetch the rest.
        if (!confirmed.current) void load();
        return saved;
      } catch (err) {
        setAlerts(before);
        throw err;
      }
    },
    [load],
  );

  const remove = useCallback(
    async (damId: string) => {
      const before = alertsRef.current;
      mutationGen.current += 1;
      setAlerts(applyDamAlert(before ?? [], { id: damId, name: '' }, NO_DAM_ALERT, ''));
      try {
        const token = await getAccessToken();
        if (!token) throw new ApiError('Sign in to change alerts', 401);
        await deleteDamAlert(token, damId);
      } catch (err) {
        setAlerts(before);
        throw err;
      }
    },
    [getAccessToken],
  );

  const value = useMemo(
    () => ({ alerts, status, refresh, save, remove }),
    [alerts, status, refresh, save, remove],
  );

  return <DamAlertsContext.Provider value={value}>{children}</DamAlertsContext.Provider>;
}

export function useDamAlerts() {
  return useContext(DamAlertsContext);
}
